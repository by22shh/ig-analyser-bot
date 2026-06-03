import { Worker } from "bullmq";
import type { Bot } from "grammy";
import type { PrismaClient } from "@prisma/client";
import { env } from "../../config/env.js";
import { childLogger } from "../../config/logger.js";
import { redisConnection, type PhotoSearchJobPayload } from "../queues.js";
import { isFinalAttempt } from "../retry.js";
import type { FaceCheckAdapter } from "../../modules/photo-search/adapters/facecheck.adapter.js";
import { CreditsService } from "../../modules/billing/credits.service.js";
import { MODE_COST_UNITS } from "../../modules/billing/packages.js";
import { CB } from "../../telegram/constants.js";
import { t } from "../../telegram/locales/index.js";
import { InlineKeyboard } from "grammy";
import type { MyContext } from "../../telegram/context.js";

export function startPhotoSearchWorker(input: { prisma: PrismaClient; bot?: Bot<MyContext>; facecheck: FaceCheckAdapter }) {
  const credits = new CreditsService(input.prisma);
  const log = childLogger("photo-search.worker");
  return new Worker<PhotoSearchJobPayload>(
    "photo-search",
    async (job) => {
      const row = await input.prisma.photoSearchJob.findUniqueOrThrow({
        where: { id: job.data.photoSearchJobId },
        include: { user: true }
      });
      const messages = t(row.user.language);

      // Idempotency: a re-delivered finished job must not search/capture again.
      if (row.status === "completed") return;

      const finalAttempt = isFinalAttempt({ attemptsMade: job.attemptsMade, attempts: job.opts.attempts });

      try {
        // Drop matches from a previous failed attempt so a retry does not duplicate them.
        await input.prisma.photoSearchMatch.deleteMany({ where: { photoSearchJobId: row.id } });
        await input.prisma.photoSearchJob.update({ where: { id: row.id }, data: { status: "searching" } });
        const bytes = await downloadTelegramFile(input.bot, row.telegramFileId);
        const matches = await input.facecheck.search({ bytes, mimeType: row.inputMimeType ?? "image/jpeg" });
        await input.prisma.photoSearchMatch.createMany({
          data: matches.map((match) => ({
            photoSearchJobId: row.id,
            username: match.username,
            profileUrl: match.profileUrl,
            confidence: match.confidence,
            source: match.source,
            sourceUrl: match.sourceUrl,
            rawScore: match.rawScore
          }))
        });
        await credits.captureReserve({
          userId: row.userId,
          amountUnits: MODE_COST_UNITS.photo_search,
          metadata: { photoSearchJobId: row.id }
        });
        await input.prisma.photoSearchJob.update({ where: { id: row.id }, data: { status: "completed", finishedAt: new Date() } });
        if (input.bot) {
          const kb = new InlineKeyboard();
          for (const match of matches) {
            kb.text(`@${match.username} ${(match.confidence * 100).toFixed(0)}%`, `${CB.PHOTO_ANALYZE}:${match.username}`).row();
          }
          kb.text(messages.buttons.menu, CB.BACK_MAIN);
          // Work is done and captured; a delivery hiccup must not fail the job.
          try {
            await input.bot.api.sendMessage(Number(row.user.telegramId), messages.photoMatches(matches), { reply_markup: kb });
          } catch (notifyError) {
            log.warn({ error: notifyError, jobId: row.id }, "photo_search_notify_failed");
          }
        }
      } catch (error) {
        if (!finalAttempt) {
          // Keep the reserve for the retry; just mark the job as retrying.
          await input.prisma.photoSearchJob.update({
            where: { id: row.id },
            data: { status: "retrying", errorCode: error instanceof Error ? error.message : "PHOTO_SEARCH_FAILED" }
          });
          throw error;
        }
        await credits.releaseReserve({
          userId: row.userId,
          amountUnits: MODE_COST_UNITS.photo_search,
          metadata: { photoSearchJobId: row.id, reason: error instanceof Error ? error.message : "failed" }
        });
        await input.prisma.photoSearchJob.update({
          where: { id: row.id },
          data: { status: "failed", errorCode: error instanceof Error ? error.message : "PHOTO_SEARCH_FAILED", finishedAt: new Date() }
        });
        throw error;
      }
    },
    { connection: redisConnection, concurrency: 2 }
  );
}

async function downloadTelegramFile(bot: Bot<MyContext> | undefined, fileId: string): Promise<Buffer> {
  if (!bot || !env.TELEGRAM_BOT_TOKEN) {
    if (env.FACECHECK_API_TOKEN && !env.FACECHECK_TESTING_MODE) throw new Error("TELEGRAM_BOT_REQUIRED_FOR_PHOTO_SEARCH");
    return Buffer.from("mock");
  }
  const file = await bot.api.getFile(fileId);
  if (!file.file_path) throw new Error("TELEGRAM_FILE_PATH_MISSING");
  const apiRoot = env.TELEGRAM_API_ROOT.replace(/\/$/, "");
  const response = await fetch(`${apiRoot}/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
  if (!response.ok) throw new Error(`TELEGRAM_FILE_DOWNLOAD_${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
