import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { childLogger } from "../config/logger.js";
import { isFinalAttempt } from "./retry.js";
import { processAnalysisJob, type AnalysisProcessorInput } from "./workers/analysis.worker.js";
import {
  processPhotoSearchJob,
  type PhotoSearchProcessorInput
} from "./workers/photo-search.worker.js";

const log = childLogger("postgres.queue");
const POLL_INTERVAL_MS = 2500;
const LOCK_TTL_MS = 10 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const RETRY_BACKOFF_BASE_MS = 3000;
const DEFAULT_ATTEMPTS = 2;

type QueueWorkerHandle = {
  close(): Promise<void>;
};

type ClaimedJob = {
  id: string;
  queueAttemptsMade: number;
  queueMaxAttempts: number;
  queueLockedBy: string;
  queueLockedUntil: Date;
};

type QueueKind = "analysis" | "photo-search";

type QueueLease = {
  workerId: string;
};

export function startPostgresQueueWorkers(
  input: AnalysisProcessorInput & PhotoSearchProcessorInput
): QueueWorkerHandle {
  const workerId = `pgq:${randomUUID()}`;
  const analysis = startPollingLoop("analysis", () => processNextAnalysisJob(input, workerId));
  const photoSearch = startPollingLoop("photo-search", () =>
    processNextPhotoSearchJob(input, workerId)
  );

  return {
    async close() {
      await Promise.allSettled([analysis.close(), photoSearch.close()]);
    }
  };
}

export async function processNextAnalysisJob(
  input: AnalysisProcessorInput,
  workerId = `pgq:${randomUUID()}`
): Promise<boolean> {
  const claimed = await claimNextAnalysisJob(input.prisma, workerId);
  if (!claimed) return false;

  await runWithLease(input.prisma, "analysis", claimed, async (lease) => {
    const attemptInfo = attemptInfoFromClaim(claimed, lease);
    await processAnalysisJob(input, claimed.id, attemptInfo);
  });
  return true;
}

export async function processNextPhotoSearchJob(
  input: PhotoSearchProcessorInput,
  workerId = `pgq:${randomUUID()}`
): Promise<boolean> {
  const claimed = await claimNextPhotoSearchJob(input.prisma, workerId);
  if (!claimed) return false;

  await runWithLease(input.prisma, "photo-search", claimed, async (lease) => {
    const attemptInfo = attemptInfoFromClaim(claimed, lease);
    await processPhotoSearchJob(input, claimed.id, attemptInfo);
  });
  return true;
}

function startPollingLoop(name: string, processNext: () => Promise<boolean>): QueueWorkerHandle {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> = Promise.resolve();

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(run, POLL_INTERVAL_MS);
    timer.unref?.();
  };

  const run = () => {
    active = (async () => {
      try {
        let processed = false;
        do {
          processed = await processNext();
        } while (processed && !stopped);
      } catch (error) {
        log.error({ error, queue: name }, "postgres_queue_worker_failed");
      } finally {
        schedule();
      }
    })();
  };

  run();

  return {
    async close() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await active;
    }
  };
}

async function runWithLease(
  prisma: PrismaClient,
  queue: QueueKind,
  claimed: ClaimedJob,
  processJob: (lease: QueueLease) => Promise<void>
) {
  const lease = { workerId: claimed.queueLockedBy };
  const heartbeat = startLeaseHeartbeat(prisma, queue, claimed.id, lease.workerId);
  const attemptInfo = attemptInfoFromClaim(claimed, lease);
  let succeeded = false;

  try {
    await processJob(lease);
    succeeded = true;
  } catch (error) {
    if (!isFinalAttempt(attemptInfo)) {
      await scheduleRetry(prisma, queue, claimed, error).catch((retryError) =>
        log.error(
          { error: retryError, originalError: error, queue, jobId: claimed.id },
          "postgres_queue_retry_schedule_failed"
        )
      );
    } else {
      await releaseLease(prisma, queue, claimed.id, lease.workerId).catch((releaseError) =>
        log.warn(
          { error: releaseError, originalError: error, queue, jobId: claimed.id },
          "postgres_queue_lease_release_failed"
        )
      );
    }
    throw error;
  } finally {
    await heartbeat.close();
    if (succeeded) {
      await releaseLease(prisma, queue, claimed.id, lease.workerId).catch((releaseError) =>
        log.warn(
          { error: releaseError, queue, jobId: claimed.id },
          "postgres_queue_lease_release_failed"
        )
      );
    }
  }
}

function attemptInfoFromClaim(claimed: ClaimedJob, lease: QueueLease) {
  return {
    attemptsMade: Math.max(0, claimed.queueAttemptsMade - 1),
    attempts: Math.max(1, claimed.queueMaxAttempts),
    lease
  };
}

function startLeaseHeartbeat(
  prisma: PrismaClient,
  queue: QueueKind,
  jobId: string,
  workerId: string
): QueueWorkerHandle {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> = Promise.resolve();

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(run, HEARTBEAT_INTERVAL_MS);
    timer.unref?.();
  };

  const run = () => {
    active = extendLease(prisma, queue, jobId, workerId).catch((error) =>
      log.warn({ error, queue, jobId }, "postgres_queue_lease_heartbeat_failed")
    );
    active.finally(schedule).catch(() => undefined);
  };

  schedule();

  return {
    async close() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await active;
    }
  };
}

async function claimNextAnalysisJob(
  prisma: PrismaClient,
  workerId: string
): Promise<ClaimedJob | null> {
  const lockedUntil = new Date(Date.now() + LOCK_TTL_MS);
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "analysis_jobs"
    SET
      "status" = 'fetching_profile',
      "stage" = 'fetching_profile',
      "startedAt" = COALESCE("startedAt", NOW()),
      "updatedAt" = NOW(),
      "queueAttemptsMade" = LEAST("queueAttemptsMade" + 1, "queueMaxAttempts"),
      "queueMaxAttempts" = GREATEST("queueMaxAttempts", ${DEFAULT_ATTEMPTS}),
      "queueLockedBy" = ${workerId},
      "queueLockedUntil" = ${lockedUntil},
      "queueNextRunAt" = NOW()
    WHERE "id" = (
      SELECT "id"
      FROM "analysis_jobs"
      WHERE
        (
          "status" IN ('queued', 'retrying')
          AND "queueAttemptsMade" < "queueMaxAttempts"
          AND "queueNextRunAt" <= NOW()
          AND ("queueLockedUntil" IS NULL OR "queueLockedUntil" < NOW())
        )
        OR (
          "status" IN ('fetching_profile', 'analyzing_images', 'generating_exports')
          AND ("queueLockedUntil" IS NULL OR "queueLockedUntil" < NOW())
        )
      ORDER BY "queueNextRunAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id", "queueAttemptsMade", "queueMaxAttempts", "queueLockedBy", "queueLockedUntil"
  `;
  return rows[0] ?? null;
}

async function claimNextPhotoSearchJob(
  prisma: PrismaClient,
  workerId: string
): Promise<ClaimedJob | null> {
  const lockedUntil = new Date(Date.now() + LOCK_TTL_MS);
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "photo_search_jobs"
    SET
      "status" = 'searching',
      "updatedAt" = NOW(),
      "queueAttemptsMade" = LEAST("queueAttemptsMade" + 1, "queueMaxAttempts"),
      "queueMaxAttempts" = GREATEST("queueMaxAttempts", ${DEFAULT_ATTEMPTS}),
      "queueLockedBy" = ${workerId},
      "queueLockedUntil" = ${lockedUntil},
      "queueNextRunAt" = NOW()
    WHERE "id" = (
      SELECT "id"
      FROM "photo_search_jobs"
      WHERE
        (
          "status" IN ('queued', 'retrying')
          AND "queueAttemptsMade" < "queueMaxAttempts"
          AND "queueNextRunAt" <= NOW()
          AND ("queueLockedUntil" IS NULL OR "queueLockedUntil" < NOW())
        )
        OR (
          "status" = 'searching'
          AND ("queueLockedUntil" IS NULL OR "queueLockedUntil" < NOW())
        )
      ORDER BY "queueNextRunAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id", "queueAttemptsMade", "queueMaxAttempts", "queueLockedBy", "queueLockedUntil"
  `;
  return rows[0] ?? null;
}

async function scheduleRetry(
  prisma: PrismaClient,
  queue: QueueKind,
  claimed: ClaimedJob,
  error: unknown
) {
  const delayMs = RETRY_BACKOFF_BASE_MS * 2 ** Math.max(0, claimed.queueAttemptsMade - 1);
  const nextRunAt = new Date(Date.now() + delayMs);
  const errorCode = error instanceof Error ? error.message : "JOB_FAILED";

  if (queue === "analysis") {
    await prisma.analysisJob.updateMany({
      where: {
        id: claimed.id,
        queueLockedBy: claimed.queueLockedBy,
        status: { notIn: ["completed", "failed"] }
      },
      data: {
        status: "retrying",
        stage: "retrying",
        errorCode,
        errorMessage: error instanceof Error ? error.message : String(error),
        queueLockedBy: null,
        queueLockedUntil: null,
        queueNextRunAt: nextRunAt
      }
    });
    return;
  }

  await prisma.photoSearchJob.updateMany({
    where: {
      id: claimed.id,
      queueLockedBy: claimed.queueLockedBy,
      status: { notIn: ["completed", "failed"] }
    },
    data: {
      status: "retrying",
      errorCode,
      queueLockedBy: null,
      queueLockedUntil: null,
      queueNextRunAt: nextRunAt
    }
  });
}

async function extendLease(
  prisma: PrismaClient,
  queue: QueueKind,
  jobId: string,
  workerId: string
) {
  const lockedUntil = new Date(Date.now() + LOCK_TTL_MS);
  if (queue === "analysis") {
    await prisma.analysisJob.updateMany({
      where: { id: jobId, queueLockedBy: workerId, status: { notIn: ["completed", "failed"] } },
      data: { queueLockedUntil: lockedUntil }
    });
    return;
  }
  await prisma.photoSearchJob.updateMany({
    where: { id: jobId, queueLockedBy: workerId, status: { notIn: ["completed", "failed"] } },
    data: { queueLockedUntil: lockedUntil }
  });
}

async function releaseLease(
  prisma: PrismaClient,
  queue: QueueKind,
  jobId: string,
  workerId: string
) {
  if (queue === "analysis") {
    await prisma.analysisJob.updateMany({
      where: { id: jobId, queueLockedBy: workerId },
      data: { queueLockedBy: null, queueLockedUntil: null }
    });
    return;
  }
  await prisma.photoSearchJob.updateMany({
    where: { id: jobId, queueLockedBy: workerId },
    data: { queueLockedBy: null, queueLockedUntil: null }
  });
}
