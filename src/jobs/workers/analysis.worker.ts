import { Worker } from "bullmq";
import type { Bot } from "grammy";
import type { Prisma, PrismaClient } from "@prisma/client";
import { env } from "../../config/env.js";
import { childLogger } from "../../config/logger.js";
import { getRedisConnection, type AnalysisJobPayload } from "../queues.js";
import { isFinalAttempt } from "../retry.js";
import { CreditsService } from "../../modules/billing/credits.service.js";
import type {
  InstagramComment,
  InstagramPost,
  InstagramProfile,
  InstagramProfileProvider
} from "../../modules/instagram/types.js";
import type { LlmProvider } from "../../modules/llm/types.js";
import { buildStrategicReport } from "../../modules/analysis/report-builder.js";
import { ReportService } from "../../modules/reports/report.service.js";
import type { VisionAnalysisItemView } from "../../modules/reports/types.js";
import { recordUsage, recordUsageSafe } from "../../modules/observability/usage.js";
import { safeEditOrNotify, safeNotify } from "./notify.js";
import { t } from "../../telegram/locales/index.js";
import { reportActionsKeyboard } from "../../telegram/keyboards/reports.js";
import { backMenuKeyboard } from "../../telegram/keyboards/main-menu.js";
import type { MyContext } from "../../telegram/context.js";

const log = childLogger("analysis.worker");

export type AnalysisProcessorInput = {
  prisma: PrismaClient;
  bot?: Bot<MyContext>;
  instagram: InstagramProfileProvider;
  llm: LlmProvider;
  reportService: ReportService;
};

type AttemptInfo = {
  attemptsMade: number;
  attempts?: number;
  lease?: { workerId: string };
};

export function startAnalysisWorker(input: AnalysisProcessorInput) {
  return new Worker<AnalysisJobPayload>(
    "analysis",
    async (job) =>
      processAnalysisJob(input, job.data.analysisJobId, {
        attemptsMade: job.attemptsMade,
        attempts: job.opts.attempts
      }),
    { connection: getRedisConnection(), concurrency: 2 }
  );
}

type AnalysisJobWriteClient = PrismaClient | Prisma.TransactionClient;
type AnalysisJobLease = { workerId: string } | undefined;

const ANALYSIS_TERMINAL_STATUSES = ["completed", "failed"] as const;

async function assertAnalysisJobMutable(
  prisma: PrismaClient,
  analysisJobId: string,
  lease: AnalysisJobLease
) {
  if (await canMutateAnalysisJob(prisma, analysisJobId, lease)) return;
  throw new Error("ANALYSIS_JOB_NOT_ACTIVE");
}

async function canMutateAnalysisJob(
  prisma: PrismaClient,
  analysisJobId: string,
  lease: AnalysisJobLease
): Promise<boolean> {
  const current = await prisma.analysisJob.findUnique({
    where: { id: analysisJobId },
    select: { status: true, queueLockedBy: true }
  });
  if (!current || isAnalysisTerminalStatus(current.status)) return false;
  return !lease || current.queueLockedBy === lease.workerId;
}

async function updateRunningAnalysisJob(
  prisma: AnalysisJobWriteClient,
  analysisJobId: string,
  data: Prisma.AnalysisJobUpdateManyMutationInput,
  lease: AnalysisJobLease
) {
  const result = await prisma.analysisJob.updateMany({
    where: {
      id: analysisJobId,
      status: { notIn: [...ANALYSIS_TERMINAL_STATUSES] },
      ...(lease ? { queueLockedBy: lease.workerId } : {})
    },
    data
  });
  if (result.count === 0) throw new Error("ANALYSIS_JOB_NOT_ACTIVE");
}

function isAnalysisTerminalStatus(status: string): boolean {
  return ANALYSIS_TERMINAL_STATUSES.includes(status as (typeof ANALYSIS_TERMINAL_STATUSES)[number]);
}

export async function processAnalysisJob(
  input: AnalysisProcessorInput,
  analysisJobId: string,
  attemptInfo: AttemptInfo
) {
  const credits = new CreditsService(input.prisma);
  const row = await input.prisma.analysisJob.findUniqueOrThrow({
    where: { id: analysisJobId },
    include: { user: { include: { settings: true } } }
  });
  const locale = row.user.language === "en" ? "en" : "ru";
  const messages = t(locale);
  // Progress updates edit one message in place instead of stacking several.
  let progressMessageId: number | undefined;

  // Idempotency: a re-delivered job that already finished must not redo the
  // (paid) pipeline or capture again.
  if (isAnalysisTerminalStatus(row.status)) return;
  await assertAnalysisJobMutable(input.prisma, row.id, attemptInfo.lease);

  const finalAttempt = isFinalAttempt({
    attemptsMade: attemptInfo.attemptsMade,
    attempts: attemptInfo.attempts
  });

  try {
    // Clear any partial state left by a previous failed attempt so unique
    // (analysisJobId) constraints on the report do not break retries. Profile
    // and vision snapshots are retained as paid-step cache between attempts.
    await input.reportService.cleanupByAnalysisJob(row.id);
    const cachedProfile = await loadPersistedProfile(input.prisma, row.id);
    let profile: InstagramProfile;
    let postSnapshotIds: Map<string, string>;
    if (cachedProfile) {
      profile = cachedProfile.profile;
      postSnapshotIds = cachedProfile.postSnapshotIds;
    } else {
      await updateRunningAnalysisJob(
        input.prisma,
        row.id,
        { status: "fetching_profile", stage: "fetching_profile", startedAt: new Date() },
        attemptInfo.lease
      );
      progressMessageId = await safeEditOrNotify(
        input.bot,
        Number(row.telegramChatId),
        progressMessageId,
        messages.progress(messages.progressStages.fetchingProfile, 1, 4),
        (error) => log.warn({ error, jobId: row.id }, "analysis_progress_notify_failed")
      );

      profile = await input.instagram.fetchProfile({
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
          status: "success",
          costEstimateRub: env.APIFY_TOKEN ? (env.ECON_APIFY_PROFILE_COST_RUB ?? null) : null
        },
        (error) => log.warn({ error, jobId: row.id }, "analysis_usage_record_failed")
      );
      postSnapshotIds = await persistProfile(input.prisma, row.id, profile);
    }

    await updateRunningAnalysisJob(
      input.prisma,
      row.id,
      {
        status: "analyzing_images",
        stage: "analyzing_images",
        progressCurrent: 2,
        progressTotal: 4
      },
      attemptInfo.lease
    );
    progressMessageId = await safeEditOrNotify(
      input.bot,
      Number(row.telegramChatId),
      progressMessageId,
      messages.progress(messages.progressStages.analyzingSignals, 2, 4),
      (error) => log.warn({ error, jobId: row.id }, "analysis_progress_notify_failed")
    );

    const cachedVision = await loadReusableVision(input.prisma, row.id, profile.posts);
    const strategicReport = await buildStrategicReport({
      mode: row.mode as never,
      language: locale,
      profile,
      llm: input.llm,
      targetPosition: row.targetPosition ?? undefined,
      goal: row.goal ?? undefined,
      vision: cachedVision
    });
    if (!cachedVision)
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

    await updateRunningAnalysisJob(
      input.prisma,
      row.id,
      {
        status: "generating_exports",
        stage: "generating_exports",
        progressCurrent: 3,
        progressTotal: 4
      },
      attemptInfo.lease
    );
    // Last progress update for this job, so the returned id is not reused.
    await safeEditOrNotify(
      input.bot,
      Number(row.telegramChatId),
      progressMessageId,
      messages.progress(messages.progressStages.generatingExports, 3, 4),
      (error) => log.warn({ error, jobId: row.id }, "analysis_progress_notify_failed")
    );

    const retentionDays = row.user.settings?.reportRetentionDays ?? env.REPORT_RETENTION_DAYS ?? 30;
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
        await updateRunningAnalysisJob(
          tx,
          row.id,
          {
            status: "completed",
            stage: "completed",
            progressCurrent: 4,
            progressTotal: 4,
            progressPercent: 100,
            finishedAt: new Date(),
            queueLockedBy: null,
            queueLockedUntil: null
          },
          attemptInfo.lease
        );
      }
    });
    // Work is done and credits captured; a delivery hiccup must not fail the
    // job (a retry would re-bill Apify/OpenRouter and re-run everything).
    await safeNotify(
      input.bot,
      Number(row.telegramChatId),
      messages.reportReady({
        username: row.targetUsername,
        mode: row.mode as never,
        metrics: strategicReport.metrics,
        summary: strategicReport.summary
      }),
      (error) => log.warn({ error, jobId: row.id }, "analysis_completed_notify_failed"),
      reportActionsKeyboard(messages, report.id)
    );
  } catch (error) {
    if (!(await canMutateAnalysisJob(input.prisma, row.id, attemptInfo.lease))) {
      log.warn({ error, jobId: row.id }, "analysis_mutation_skipped_after_lost_lease");
      return;
    }
    const errorCode = error instanceof Error ? error.message : "ANALYSIS_FAILED";
    log.error({ error, jobId: row.id, finalAttempt }, "analysis_failed");
    await recordUsage(input.prisma, {
      userId: row.userId,
      analysisJobId: row.id,
      provider: "analysis_pipeline",
      operation: "analysis",
      status: "failed",
      errorCode
    }).catch(() => undefined);
    if (!finalAttempt) {
      // More retries remain: keep the reserve intact so a successful retry can
      // capture it, and mark the job as retrying.
      await updateRunningAnalysisJob(
        input.prisma,
        row.id,
        {
          status: "retrying",
          stage: "retrying",
          errorCode,
          errorMessage: error instanceof Error ? error.message : String(error)
        },
        attemptInfo.lease
      );
      throw error;
    }
    await input.reportService.cleanupByAnalysisJob(row.id).catch(() => undefined);
    await credits.releaseReserve({
      userId: row.userId,
      analysisJobId: row.id,
      amountUnits: row.costCreditUnits,
      metadata: { reason: "analysis_failed" }
    });
    await updateRunningAnalysisJob(
      input.prisma,
      row.id,
      {
        status: "failed",
        stage: "failed",
        errorCode,
        errorMessage: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
        queueLockedBy: null,
        queueLockedUntil: null
      },
      attemptInfo.lease
    );
    await safeNotify(
      input.bot,
      Number(row.telegramChatId),
      messages.analysisFailed(errorCode),
      undefined,
      backMenuKeyboard(messages)
    );
    throw error;
  }
}

async function loadPersistedProfile(
  prisma: PrismaClient,
  analysisJobId: string
): Promise<{ profile: InstagramProfile; postSnapshotIds: Map<string, string> } | null> {
  const snapshot = await prisma.instagramProfileSnapshot.findUnique({
    where: { analysisJobId },
    include: { posts: { orderBy: { sortOrder: "asc" } } }
  });
  if (!snapshot) return null;
  if (snapshot.posts.length === 0 && snapshot.postsCount > 0) {
    await prisma.instagramProfileSnapshot
      .delete({ where: { id: snapshot.id } })
      .catch(() => undefined);
    return null;
  }

  const posts: InstagramPost[] = snapshot.posts.map((post) => ({
    id: post.postId,
    type: post.type,
    caption: post.caption ?? undefined,
    hashtags: post.hashtags,
    mentions: post.mentions,
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    latestComments: commentsArray(post.latestComments),
    timestamp: post.timestamp?.toISOString(),
    displayUrl: post.displayUrl ?? undefined,
    url: post.url ?? undefined,
    videoViewCount: post.videoViewCount ?? undefined,
    videoDuration: post.videoDuration == null ? undefined : Number(post.videoDuration),
    location: recordValue(post.location),
    isPinned: post.isPinned,
    productType: post.productType ?? undefined,
    musicInfo: recordValue(post.musicInfo),
    childPosts: post.childPosts,
    taggedUsers: post.taggedUsers
  }));

  return {
    profile: {
      username: snapshot.username,
      fullName: snapshot.fullName ?? undefined,
      biography: snapshot.biography ?? undefined,
      followersCount: snapshot.followersCount,
      followsCount: snapshot.followsCount,
      postsCount: snapshot.postsCount,
      profilePicUrl: snapshot.profilePicUrl ?? undefined,
      externalUrl: snapshot.externalUrl ?? undefined,
      isVerified: snapshot.isVerified,
      relatedProfiles: stringArray(snapshot.relatedProfiles),
      posts,
      providerDatasetId: snapshot.providerDatasetId ?? undefined,
      rawDebug: snapshot.rawDebug ?? undefined
    },
    postSnapshotIds: new Map(snapshot.posts.map((post) => [post.postId, post.id]))
  };
}

async function loadReusableVision(
  prisma: PrismaClient,
  analysisJobId: string,
  posts: InstagramPost[]
): Promise<VisionAnalysisItemView[] | undefined> {
  const expectedCount = Math.min(posts.length, env.ANALYSIS_MAX_IMAGES_ANALYZED ?? 30);
  if (expectedCount === 0) return [];

  const items = await prisma.visionAnalysisItem.findMany({
    where: { analysisJobId },
    orderBy: { createdAt: "asc" }
  });
  if (!items.length) return undefined;

  const byPostId = new Map(items.map((item) => [item.postId, item]));
  const ordered = posts
    .slice(0, expectedCount)
    .map((post) => byPostId.get(post.id))
    .filter((item): item is (typeof items)[number] => item != null);
  if (ordered.length === expectedCount) {
    return ordered.map((item) => ({
      postId: item.postId,
      status: visionStatus(item.status),
      description: item.description,
      model: item.model,
      promptVersion: item.promptVersion,
      errorCode: item.errorCode ?? undefined
    }));
  }

  await prisma.visionAnalysisItem.deleteMany({ where: { analysisJobId } });
  return undefined;
}

async function persistProfile(
  prisma: PrismaClient,
  analysisJobId: string,
  profile: Awaited<ReturnType<InstagramProfileProvider["fetchProfile"]>>
) {
  return prisma.$transaction(async (tx) => {
    const snapshot = await tx.instagramProfileSnapshot.create({
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
    await tx.instagramPostSnapshot.createMany({
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
    const posts = await tx.instagramPostSnapshot.findMany({
      where: { profileSnapshotId: snapshot.id },
      select: { id: true, postId: true }
    });
    return new Map(posts.map((post) => [post.postId, post.id]));
  });
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

function commentsArray(value: unknown): InstagramComment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): InstagramComment | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const text = typeof record.text === "string" ? record.text : "";
      return {
        ownerUsername: typeof record.ownerUsername === "string" ? record.ownerUsername : undefined,
        text,
        timestamp: typeof record.timestamp === "string" ? record.timestamp : undefined
      };
    })
    .filter((item): item is InstagramComment => item != null);
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function visionStatus(status: string): VisionAnalysisItemView["status"] {
  return status === "completed" || status === "skipped" || status === "failed" ? status : "failed";
}
