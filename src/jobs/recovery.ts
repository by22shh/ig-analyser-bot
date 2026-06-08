import type { Prisma, PrismaClient } from "@prisma/client";
import { childLogger } from "../config/logger.js";
import {
  getAnalysisQueue,
  getPhotoSearchQueue,
  type AnalysisJobPayload,
  type PhotoSearchJobPayload
} from "./queues.js";
import { CreditsService } from "../modules/billing/credits.service.js";

const log = childLogger("job.recovery");

const ACTIVE_ANALYSIS_STATUSES = [
  "queued",
  "fetching_profile",
  "analyzing_images",
  "generating_exports",
  "retrying"
];
const ACTIVE_PHOTO_SEARCH_STATUSES = ["queued", "searching", "retrying"];
const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_STALE_RESERVE_MS = 10 * 60_000;
const LEGACY_PHOTO_RESERVE_MATCH_MS = 5 * 60_000;

type RecoverableQueue<Payload> = {
  getJob: (jobId: string) => Promise<
    | {
        getState: () => Promise<string>;
        remove: () => Promise<void>;
      }
    | undefined
  >;
  add: (name: string, payload: Payload, opts: { jobId: string }) => Promise<unknown>;
};

export type JobRecoverySummary = {
  analysisRequeued: number;
  photoSearchRequeued: number;
  staleReservesReleased: number;
};

export async function recoverJobs(input: {
  prisma: PrismaClient;
  analysis?: RecoverableQueue<AnalysisJobPayload>;
  photoSearch?: RecoverableQueue<PhotoSearchJobPayload>;
  now?: Date;
  staleReserveMs?: number;
}): Promise<JobRecoverySummary> {
  const now = input.now ?? new Date();
  const summary: JobRecoverySummary = {
    analysisRequeued: 0,
    photoSearchRequeued: 0,
    staleReservesReleased: 0
  };
  summary.analysisRequeued = await recoverAnalysisJobs(
    input.prisma,
    input.analysis ?? getAnalysisQueue()
  );
  summary.photoSearchRequeued = await recoverPhotoSearchJobs(
    input.prisma,
    input.photoSearch ?? getPhotoSearchQueue()
  );
  summary.staleReservesReleased = await releaseStaleStartupReserves(
    input.prisma,
    now,
    input.staleReserveMs ?? DEFAULT_STALE_RESERVE_MS
  );
  return summary;
}

export function startJobRecoveryLoop(input: {
  prisma: PrismaClient;
  intervalMs?: number;
  staleReserveMs?: number;
}) {
  let running = false;
  let stopped = false;

  const run = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const summary = await recoverJobs({
        prisma: input.prisma,
        staleReserveMs: input.staleReserveMs
      });
      if (
        summary.analysisRequeued ||
        summary.photoSearchRequeued ||
        summary.staleReservesReleased
      ) {
        log.info(summary, "job_recovery_applied");
      }
    } catch (error) {
      log.error({ error }, "job_recovery_failed");
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(() => void run(), input.intervalMs ?? DEFAULT_INTERVAL_MS);
  timer.unref?.();
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    }
  };
}

async function recoverAnalysisJobs(
  prisma: PrismaClient,
  queue: RecoverableQueue<AnalysisJobPayload>
): Promise<number> {
  const jobs = await prisma.analysisJob.findMany({
    where: { status: { in: ACTIVE_ANALYSIS_STATUSES } },
    select: { id: true, userId: true, reservedTransactionId: true },
    orderBy: { createdAt: "asc" },
    take: 100
  });
  let requeued = 0;
  for (const job of jobs) {
    if (job.reservedTransactionId) {
      await prisma.creditTransaction.updateMany({
        where: {
          id: job.reservedTransactionId,
          userId: job.userId,
          type: "reserve",
          analysisJobId: null
        },
        data: { analysisJobId: job.id }
      });
    }
    if (await ensureQueueJob(queue, "analysis", { analysisJobId: job.id }, job.id)) {
      requeued += 1;
    }
  }
  return requeued;
}

async function recoverPhotoSearchJobs(
  prisma: PrismaClient,
  queue: RecoverableQueue<PhotoSearchJobPayload>
): Promise<number> {
  const jobs = await prisma.photoSearchJob.findMany({
    where: { status: { in: ACTIVE_PHOTO_SEARCH_STATUSES } },
    select: { id: true, userId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 100
  });
  let requeued = 0;
  for (const job of jobs) {
    await linkLegacyPhotoReserve(prisma, job);
    if (await ensureQueueJob(queue, "photo-search", { photoSearchJobId: job.id }, job.id)) {
      requeued += 1;
    }
  }
  return requeued;
}

async function ensureQueueJob<Payload>(
  queue: RecoverableQueue<Payload>,
  name: string,
  payload: Payload,
  jobId: string
): Promise<boolean> {
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state !== "completed" && state !== "failed") return false;
    await existing.remove();
  }
  await queue.add(name, payload, { jobId });
  return true;
}

async function linkLegacyPhotoReserve(
  prisma: PrismaClient,
  job: { id: string; userId: string; createdAt: Date }
) {
  const linked = await prisma.creditTransaction.findFirst({
    where: { userId: job.userId, type: "reserve", photoSearchJobId: job.id },
    select: { id: true }
  });
  if (linked) return;

  const from = new Date(job.createdAt.getTime() - LEGACY_PHOTO_RESERVE_MATCH_MS);
  const to = new Date(job.createdAt.getTime() + LEGACY_PHOTO_RESERVE_MATCH_MS);
  const candidates = (
    await prisma.creditTransaction.findMany({
      where: {
        userId: job.userId,
        type: "reserve",
        analysisJobId: null,
        photoSearchJobId: null,
        reportChatMessageId: null,
        createdAt: { gte: from, lte: to }
      },
      select: { id: true, metadata: true },
      orderBy: { createdAt: "desc" },
      take: 5
    })
  ).filter((transaction) => isPhotoSearchReserve(transaction.metadata));

  if (candidates.length !== 1) return;
  const [candidate] = candidates;
  if (!candidate) return;
  await prisma.creditTransaction.updateMany({
    where: {
      id: candidate.id,
      userId: job.userId,
      type: "reserve",
      photoSearchJobId: null
    },
    data: { photoSearchJobId: job.id }
  });
}

async function releaseStaleStartupReserves(
  prisma: PrismaClient,
  now: Date,
  staleReserveMs: number
): Promise<number> {
  const cutoff = new Date(now.getTime() - staleReserveMs);
  const reserves = await prisma.creditTransaction.findMany({
    where: {
      type: "reserve",
      analysisJobId: null,
      photoSearchJobId: null,
      reportChatMessageId: null,
      createdAt: { lt: cutoff }
    },
    select: { id: true, userId: true, amountUnits: true, metadata: true },
    orderBy: { createdAt: "asc" },
    take: 200
  });
  const credits = new CreditsService(prisma);
  let released = 0;
  for (const reserve of reserves) {
    if (!isRecoverableStartupReserve(reserve.metadata)) continue;
    const transaction = await credits.releaseReserve({
      userId: reserve.userId,
      reserveTransactionId: reserve.id,
      amountUnits: Math.abs(Math.min(reserve.amountUnits, 0)),
      metadata: { reason: "stale_startup_reserve_recovery" }
    });
    if (transaction) released += 1;
  }
  return released;
}

function isRecoverableStartupReserve(metadata: Prisma.JsonValue): boolean {
  const record = metadataRecord(metadata);
  return (
    isPhotoSearchReserve(metadata) ||
    (typeof record.username === "string" && typeof record.mode === "string")
  );
}

function isPhotoSearchReserve(metadata: Prisma.JsonValue): boolean {
  return metadataRecord(metadata).type === "photo_search";
}

function metadataRecord(metadata: Prisma.JsonValue): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}
