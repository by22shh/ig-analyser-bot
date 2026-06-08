import { Worker } from "bullmq";
import type { Bot } from "grammy";
import type { Prisma, PrismaClient } from "@prisma/client";
import { env } from "../../config/env.js";
import { childLogger } from "../../config/logger.js";
import { getRedisConnection, type PhotoSearchJobPayload } from "../queues.js";
import { isFinalAttempt } from "../retry.js";
import type { FaceCheckAdapter } from "../../modules/photo-search/adapters/facecheck.adapter.js";
import { CreditsService } from "../../modules/billing/credits.service.js";
import { MODE_COST_UNITS } from "../../modules/billing/packages.js";
import { recordUsage } from "../../modules/observability/usage.js";
import { CB } from "../../telegram/constants.js";
import { t } from "../../telegram/locales/index.js";
import { InlineKeyboard } from "grammy";
import type { MyContext } from "../../telegram/context.js";
import { safeNotify } from "./notify.js";
import { backMenuKeyboard } from "../../telegram/keyboards/main-menu.js";

export type PhotoSearchProcessorInput = {
  prisma: PrismaClient;
  bot?: Bot<MyContext>;
  facecheck: FaceCheckAdapter;
};

type AttemptInfo = {
  attemptsMade: number;
  attempts?: number;
  lease?: { workerId: string };
};

export function startPhotoSearchWorker(input: PhotoSearchProcessorInput) {
  return new Worker<PhotoSearchJobPayload>(
    "photo-search",
    async (job) =>
      processPhotoSearchJob(input, job.data.photoSearchJobId, {
        attemptsMade: job.attemptsMade,
        attempts: job.opts.attempts
      }),
    { connection: getRedisConnection(), concurrency: 2 }
  );
}

type PhotoSearchJobWriteClient = PrismaClient | Prisma.TransactionClient;
type PhotoSearchJobLease = { workerId: string } | undefined;

const PHOTO_SEARCH_TERMINAL_STATUSES = ["completed", "failed"] as const;

async function assertPhotoSearchJobMutable(
  prisma: PrismaClient,
  photoSearchJobId: string,
  lease: PhotoSearchJobLease
) {
  if (await canMutatePhotoSearchJob(prisma, photoSearchJobId, lease)) return;
  throw new Error("PHOTO_SEARCH_JOB_NOT_ACTIVE");
}

async function canMutatePhotoSearchJob(
  prisma: PrismaClient,
  photoSearchJobId: string,
  lease: PhotoSearchJobLease
): Promise<boolean> {
  const current = await prisma.photoSearchJob.findUnique({
    where: { id: photoSearchJobId },
    select: { status: true, queueLockedBy: true }
  });
  if (!current || isPhotoSearchTerminalStatus(current.status)) return false;
  return !lease || current.queueLockedBy === lease.workerId;
}

async function updateRunningPhotoSearchJob(
  prisma: PhotoSearchJobWriteClient,
  photoSearchJobId: string,
  data: Prisma.PhotoSearchJobUpdateManyMutationInput,
  lease: PhotoSearchJobLease
) {
  const result = await prisma.photoSearchJob.updateMany({
    where: {
      id: photoSearchJobId,
      status: { notIn: [...PHOTO_SEARCH_TERMINAL_STATUSES] },
      ...(lease ? { queueLockedBy: lease.workerId } : {})
    },
    data
  });
  if (result.count === 0) throw new Error("PHOTO_SEARCH_JOB_NOT_ACTIVE");
}

function isPhotoSearchTerminalStatus(status: string): boolean {
  return PHOTO_SEARCH_TERMINAL_STATUSES.includes(
    status as (typeof PHOTO_SEARCH_TERMINAL_STATUSES)[number]
  );
}

export async function processPhotoSearchJob(
  input: PhotoSearchProcessorInput,
  photoSearchJobId: string,
  attemptInfo: AttemptInfo
) {
  const credits = new CreditsService(input.prisma);
  const log = childLogger("photo-search.worker");
  const row = await input.prisma.photoSearchJob.findUniqueOrThrow({
    where: { id: photoSearchJobId },
    include: { user: true }
  });
  const messages = t(row.user.language);

  // Idempotency: a re-delivered finished job must not search/capture again.
  if (isPhotoSearchTerminalStatus(row.status)) return;
  await assertPhotoSearchJobMutable(input.prisma, row.id, attemptInfo.lease);

  const finalAttempt = isFinalAttempt({
    attemptsMade: attemptInfo.attemptsMade,
    attempts: attemptInfo.attempts
  });

  try {
    await updateRunningPhotoSearchJob(
      input.prisma,
      row.id,
      { status: "searching" },
      attemptInfo.lease
    );
    // Drop matches from a previous failed attempt so a retry does not duplicate them.
    await input.prisma.photoSearchMatch.deleteMany({ where: { photoSearchJobId: row.id } });
    const bytes = await downloadTelegramFile(input.bot, row.telegramFileId);
    const matches = await input.facecheck.search({
      bytes,
      mimeType: row.inputMimeType ?? "image/jpeg"
    });
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
    // Capture credits and mark the job completed atomically (same reasoning
    // as the analysis worker): a crash between the two would let a retry
    // re-run the paid FaceCheck search and then fail the second capture.
    await credits.captureReserve({
      userId: row.userId,
      photoSearchJobId: row.id,
      amountUnits: MODE_COST_UNITS.photo_search,
      metadata: { photoSearchJobId: row.id },
      within: async (tx) => {
        await updateRunningPhotoSearchJob(
          tx,
          row.id,
          {
            status: "completed",
            finishedAt: new Date(),
            queueLockedBy: null,
            queueLockedUntil: null
          },
          attemptInfo.lease
        );
      }
    });
    await recordUsage(input.prisma, {
      userId: row.userId,
      provider:
        env.FACECHECK_API_TOKEN && !env.FACECHECK_TESTING_MODE ? "facecheck" : "mock_facecheck",
      operation: "photo_search",
      status: "success",
      costEstimateRub:
        env.FACECHECK_API_TOKEN && !env.FACECHECK_TESTING_MODE
          ? (env.ECON_FACECHECK_SEARCH_COST_RUB ?? null)
          : null
    }).catch((usageError) =>
      log.warn({ error: usageError, jobId: row.id }, "photo_search_usage_record_failed")
    );
    if (input.bot) {
      const kb = new InlineKeyboard();
      for (const match of matches) {
        kb.text(
          `@${match.username} ${(match.confidence * 100).toFixed(0)}%`,
          `${CB.PHOTO_ANALYZE}:${match.username}`
        );
        if (match.profileUrl) kb.url(messages.buttons.openInstagram, match.profileUrl);
        kb.row();
      }
      kb.text(messages.buttons.menu, CB.BACK_MAIN);
      // Work is done and captured; a delivery hiccup must not fail the job.
      try {
        await input.bot.api.sendMessage(
          Number(row.telegramChatId ?? row.user.telegramId),
          messages.photoMatches(matches),
          {
            parse_mode: "HTML",
            reply_markup: kb,
            link_preview_options: { is_disabled: true }
          }
        );
      } catch (notifyError) {
        log.warn({ error: notifyError, jobId: row.id }, "photo_search_notify_failed");
      }
    }
  } catch (error) {
    if (!(await canMutatePhotoSearchJob(input.prisma, row.id, attemptInfo.lease))) {
      log.warn({ error, jobId: row.id }, "photo_search_mutation_skipped_after_lost_lease");
      return;
    }
    if (!finalAttempt) {
      // Keep the reserve for the retry; just mark the job as retrying.
      await updateRunningPhotoSearchJob(
        input.prisma,
        row.id,
        {
          status: "retrying",
          errorCode: error instanceof Error ? error.message : "PHOTO_SEARCH_FAILED"
        },
        attemptInfo.lease
      );
      throw error;
    }
    await credits.releaseReserve({
      userId: row.userId,
      photoSearchJobId: row.id,
      amountUnits: MODE_COST_UNITS.photo_search,
      metadata: {
        photoSearchJobId: row.id,
        reason: error instanceof Error ? error.message : "failed"
      }
    });
    await recordUsage(input.prisma, {
      userId: row.userId,
      provider:
        env.FACECHECK_API_TOKEN && !env.FACECHECK_TESTING_MODE ? "facecheck" : "mock_facecheck",
      operation: "photo_search",
      status: "failed",
      errorCode: error instanceof Error ? error.message : "PHOTO_SEARCH_FAILED"
    }).catch(() => undefined);
    await updateRunningPhotoSearchJob(
      input.prisma,
      row.id,
      {
        status: "failed",
        errorCode: error instanceof Error ? error.message : "PHOTO_SEARCH_FAILED",
        finishedAt: new Date(),
        queueLockedBy: null,
        queueLockedUntil: null
      },
      attemptInfo.lease
    );
    await safeNotify(
      input.bot,
      Number(row.telegramChatId ?? row.user.telegramId),
      messages.photoSearchFailed(),
      (notifyError) =>
        log.warn({ error: notifyError, jobId: row.id }, "photo_search_failed_notify_failed"),
      backMenuKeyboard(messages)
    );
    throw error;
  }
}

async function downloadTelegramFile(
  bot: Bot<MyContext> | undefined,
  fileId: string
): Promise<Buffer> {
  if (!bot || !env.TELEGRAM_BOT_TOKEN) {
    if (env.FACECHECK_API_TOKEN && !env.FACECHECK_TESTING_MODE)
      throw new Error("TELEGRAM_BOT_REQUIRED_FOR_PHOTO_SEARCH");
    return Buffer.from("mock");
  }
  const file = await bot.api.getFile(fileId);
  if (!file.file_path) throw new Error("TELEGRAM_FILE_PATH_MISSING");
  const apiRoot = env.TELEGRAM_API_ROOT.replace(/\/$/, "");
  const response = await fetch(`${apiRoot}/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`, {
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`TELEGRAM_FILE_DOWNLOAD_${response.status}`);
  const maxBytes = Math.max(1, Math.floor((env.PHOTO_UPLOAD_MAX_MB ?? 10) * 1024 * 1024));
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("PHOTO_TOO_LARGE");
  }
  const chunks: Buffer[] = [];
  let received = 0;
  const reader = response.body?.getReader();
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) throw new Error("PHOTO_TOO_LARGE");
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error("PHOTO_TOO_LARGE");
  return bytes;
}
