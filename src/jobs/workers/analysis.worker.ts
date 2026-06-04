import { Worker } from "bullmq";
import type { Bot } from "grammy";
import type { PrismaClient } from "@prisma/client";
import { env } from "../../config/env.js";
import { childLogger } from "../../config/logger.js";
import { redisConnection, type AnalysisJobPayload } from "../queues.js";
import { isFinalAttempt } from "../retry.js";
import { CreditsService } from "../../modules/billing/credits.service.js";
import type { InstagramProfileProvider } from "../../modules/instagram/types.js";
import type { LlmProvider } from "../../modules/llm/types.js";
import { buildStrategicReport } from "../../modules/analysis/report-builder.js";
import { ReportService } from "../../modules/reports/report.service.js";
import { recordUsage, recordUsageSafe } from "../../modules/observability/usage.js";
import { t } from "../../telegram/locales/index.js";
import { reportActionsKeyboard } from "../../telegram/keyboards/reports.js";
import type { MyContext } from "../../telegram/context.js";

const log = childLogger("analysis.worker");

export function startAnalysisWorker(input: {
  prisma: PrismaClient;
  bot?: Bot<MyContext>;
  instagram: InstagramProfileProvider;
  llm: LlmProvider;
  reportService: ReportService;
}) {
  const credits = new CreditsService(input.prisma);
  return new Worker<AnalysisJobPayload>(
    "analysis",
    async (job) => {
      const row = await input.prisma.analysisJob.findUniqueOrThrow({
        where: { id: job.data.analysisJobId },
        include: { user: { include: { settings: true } } }
      });
      const locale = row.user.language === "en" ? "en" : "ru";
      const messages = t(locale);

      // Idempotency: a re-delivered job that already finished must not redo the
      // (paid) pipeline or capture again.
      if (row.status === "completed") return;

      const finalAttempt = isFinalAttempt({
        attemptsMade: job.attemptsMade,
        attempts: job.opts.attempts
      });

      try {
        // Clear any partial state left by a previous failed attempt so unique
        // (analysisJobId) constraints on the snapshot/report do not break retries.
        await input.reportService.cleanupByAnalysisJob(row.id);
        await input.prisma.visionAnalysisItem.deleteMany({ where: { analysisJobId: row.id } });
        await input.prisma.instagramProfileSnapshot.deleteMany({
          where: { analysisJobId: row.id }
        });

        await input.prisma.analysisJob.update({
          where: { id: row.id },
          data: { status: "fetching_profile", stage: "fetching_profile", startedAt: new Date() }
        });
        await notify(
          input.bot,
          Number(row.telegramChatId),
          messages.progress(messages.progressStages.fetchingProfile, 1, 4)
        );

        const profile = await input.instagram.fetchProfile({
          username: row.targetUsername,
          postLimit: env.ANALYSIS_POST_LIMIT ?? 30,
          includeParentData: true
        });
        // Best-effort usage logging: a transient failure here must not throw out
        // of the success path, or the job would fail and retry would re-run the
        // already-paid Apify fetch above.
        await recordUsageSafe(
          input.prisma,
          {
            userId: row.userId,
            analysisJobId: row.id,
            provider: env.APIFY_TOKEN ? "apify" : "mock_instagram",
            operation: "fetch_profile",
            status: "success"
          },
          (error) => log.warn({ error, jobId: row.id }, "analysis_usage_record_failed")
        );
        const postSnapshotIds = await persistProfile(input.prisma, row.id, profile);

        await input.prisma.analysisJob.update({
          where: { id: row.id },
          data: {
            status: "analyzing_images",
            stage: "analyzing_images",
            progressCurrent: 2,
            progressTotal: 4
          }
        });
        await notify(
          input.bot,
          Number(row.telegramChatId),
          messages.progress(messages.progressStages.analyzingSignals, 2, 4)
        );

        const strategicReport = await buildStrategicReport({
          mode: row.mode as never,
          language: locale,
          profile,
          llm: input.llm,
          targetPosition: row.targetPosition ?? undefined,
          goal: row.goal ?? undefined
        });
        await persistVision(input.prisma, row.id, strategicReport.vision, postSnapshotIds);
        // Best-effort: a logging hiccup must not throw out of the success path and
        // trigger a retry that re-runs the already-paid Apify + OpenRouter work.
        await recordUsageSafe(
          input.prisma,
          {
            userId: row.userId,
            analysisJobId: row.id,
            provider: env.OPENROUTER_API_KEY ? "openrouter" : "mock_llm",
            operation: "generate_report",
            model: strategicReport.model,
            status: "success"
          },
          (error) => log.warn({ error, jobId: row.id }, "analysis_usage_record_failed")
        );

        await input.prisma.analysisJob.update({
          where: { id: row.id },
          data: {
            status: "generating_exports",
            stage: "generating_exports",
            progressCurrent: 3,
            progressTotal: 4
          }
        });
        await notify(
          input.bot,
          Number(row.telegramChatId),
          messages.progress(messages.progressStages.generatingExports, 3, 4)
        );

        const retentionDays =
          row.user.settings?.reportRetentionDays ?? env.REPORT_RETENTION_DAYS ?? 30;
        const report = await input.reportService.persist(
          row.id,
          row.userId,
          strategicReport,
          retentionDays
        );
        await input.reportService.createArtifacts(
          report.id,
          strategicReport,
          report.expiresAt ?? new Date(Date.now() + retentionDays * 86400000)
        );
        // Capture credits and mark the job completed in the same transaction:
        // a crash between the two would otherwise leave a captured job that is
        // not "completed", so a retry would re-run the paid pipeline and the
        // second capture would fail with RESERVE_NOT_FOUND.
        await credits.captureReserve({
          userId: row.userId,
          analysisJobId: row.id,
          amountUnits: row.costCreditUnits,
          metadata: { mode: row.mode, username: row.targetUsername },
          within: async (tx) => {
            await tx.analysisJob.update({
              where: { id: row.id },
              data: {
                status: "completed",
                stage: "completed",
                progressCurrent: 4,
                progressTotal: 4,
                progressPercent: 100,
                finishedAt: new Date()
              }
            });
          }
        });
        // Work is done and credits captured; a delivery hiccup must not fail the
        // job (a retry would re-bill Apify/OpenRouter and re-run everything).
        try {
          await notify(
            input.bot,
            Number(row.telegramChatId),
            messages.reportReady({
              username: row.targetUsername,
              mode: row.mode as never,
              metrics: strategicReport.metrics,
              summary: strategicReport.summary
            }),
            reportActionsKeyboard(messages, report.id)
          );
        } catch (notifyError) {
          log.warn({ error: notifyError, jobId: row.id }, "analysis_completed_notify_failed");
        }
      } catch (error) {
        log.error({ error, jobId: row.id, finalAttempt }, "analysis_failed");
        await recordUsage(input.prisma, {
          userId: row.userId,
          analysisJobId: row.id,
          provider: "analysis_pipeline",
          operation: "analysis",
          status: "failed",
          errorCode: error instanceof Error ? error.message : "ANALYSIS_FAILED"
        }).catch(() => undefined);
        if (!finalAttempt) {
          // More retries remain: keep the reserve intact so a successful retry can
          // capture it, and mark the job as retrying.
          await input.prisma.analysisJob.update({
            where: { id: row.id },
            data: {
              status: "retrying",
              stage: "retrying",
              errorCode: error instanceof Error ? error.message : "ANALYSIS_FAILED",
              errorMessage: error instanceof Error ? error.message : String(error)
            }
          });
          throw error;
        }
        await input.reportService.cleanupByAnalysisJob(row.id).catch(() => undefined);
        await credits.releaseReserve({
          userId: row.userId,
          analysisJobId: row.id,
          amountUnits: row.costCreditUnits,
          metadata: { reason: "analysis_failed" }
        });
        await input.prisma.analysisJob.update({
          where: { id: row.id },
          data: {
            status: "failed",
            stage: "failed",
            errorCode: error instanceof Error ? error.message : "ANALYSIS_FAILED",
            errorMessage: error instanceof Error ? error.message : String(error),
            finishedAt: new Date()
          }
        });
        await notify(input.bot, Number(row.telegramChatId), messages.genericError()).catch(
          () => undefined
        );
        throw error;
      }
    },
    { connection: redisConnection, concurrency: 2 }
  );
}

async function notify(
  bot: Bot<MyContext> | undefined,
  chatId: number,
  text: string,
  replyMarkup?: any
) {
  if (!bot) return;
  await bot.api.sendMessage(chatId, text, {
    parse_mode: "HTML",
    reply_markup: replyMarkup,
    link_preview_options: { is_disabled: true }
  });
}

async function persistProfile(
  prisma: PrismaClient,
  analysisJobId: string,
  profile: Awaited<ReturnType<InstagramProfileProvider["fetchProfile"]>>
) {
  const snapshot = await prisma.instagramProfileSnapshot.create({
    data: {
      analysisJobId,
      username: profile.username,
      fullName: profile.fullName,
      biography: profile.biography,
      followersCount: profile.followersCount,
      followsCount: profile.followsCount,
      postsCount: profile.postsCount,
      profilePicUrl: profile.profilePicUrl,
      externalUrl: profile.externalUrl,
      isVerified: profile.isVerified,
      relatedProfiles: profile.relatedProfiles,
      provider: "apify",
      providerDatasetId: profile.providerDatasetId,
      rawDebug: profile.rawDebug as never
    }
  });
  await prisma.instagramPostSnapshot.createMany({
    data: profile.posts.map((post, index) => ({
      profileSnapshotId: snapshot.id,
      postId: post.id,
      type: post.type,
      caption: post.caption,
      hashtags: post.hashtags,
      mentions: post.mentions,
      likesCount: post.likesCount,
      commentsCount: post.commentsCount,
      latestComments: post.latestComments as never,
      timestamp: post.timestamp ? new Date(post.timestamp) : null,
      displayUrl: post.displayUrl,
      url: post.url,
      videoViewCount: post.videoViewCount,
      videoDuration: post.videoDuration,
      location: post.location as never,
      isPinned: post.isPinned,
      productType: post.productType,
      musicInfo: post.musicInfo as never,
      childPosts: post.childPosts,
      taggedUsers: post.taggedUsers,
      sortOrder: index
    }))
  });
  const posts = await prisma.instagramPostSnapshot.findMany({
    where: { profileSnapshotId: snapshot.id },
    select: { id: true, postId: true }
  });
  return new Map(posts.map((post) => [post.postId, post.id]));
}

async function persistVision(
  prisma: PrismaClient,
  analysisJobId: string,
  vision: Awaited<ReturnType<LlmProvider["analyzeVision"]>>,
  postSnapshotIds: Map<string, string>
) {
  if (!vision.length) return;
  await prisma.visionAnalysisItem.createMany({
    data: vision.map((item) => ({
      analysisJobId,
      postSnapshotId: postSnapshotIds.get(item.postId),
      postId: item.postId,
      status: item.status,
      description: item.description,
      model: item.model,
      promptVersion: item.promptVersion,
      errorCode: item.errorCode
    }))
  });
}
