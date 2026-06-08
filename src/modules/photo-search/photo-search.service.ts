import type { PrismaClient } from "@prisma/client";
import { env } from "../../config/env.js";
import { getPhotoSearchQueue } from "../../jobs/queues.js";
import { MODE_COST_UNITS } from "../billing/packages.js";
import { CreditsService } from "../billing/credits.service.js";

export class PhotoSearchService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly credits: CreditsService
  ) {}

  async createJob(input: {
    userId: string;
    chatId?: number;
    telegramFileId: string;
    telegramFileUniqueId?: string;
    mimeType?: string;
    sizeBytes?: number;
    idempotencyKey?: string;
  }) {
    // Idempotency: concurrent photo updates (a Telegram album/media-group, or a
    // fast double-send) all read wizard state `waiting_photo` before it clears.
    // A stable per-session key collapses them into one job so credits are
    // reserved and FaceCheck is paid only once.
    if (input.idempotencyKey) {
      const existing = await this.prisma.photoSearchJob.findUnique({
        where: { idempotencyKey: input.idempotencyKey }
      });
      if (existing) return existing;
    }
    let job: Awaited<ReturnType<typeof this.prisma.photoSearchJob.create>> | undefined;
    let reserved: Awaited<ReturnType<CreditsService["reserve"]>> | undefined;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const photoSearchJob = await tx.photoSearchJob.create({
          data: {
            userId: input.userId,
            telegramChatId: input.chatId != null ? BigInt(input.chatId) : undefined,
            telegramFileId: input.telegramFileId,
            telegramFileUniqueId: input.telegramFileUniqueId,
            inputMimeType: input.mimeType,
            inputSizeBytes: input.sizeBytes,
            idempotencyKey: input.idempotencyKey,
            status: "queued"
          }
        });
        const reserve = await this.credits.reserveWithin(tx, {
          userId: input.userId,
          photoSearchJobId: photoSearchJob.id,
          amountUnits: MODE_COST_UNITS.photo_search,
          metadata: { type: "photo_search" }
        });
        return { job: photoSearchJob, reserved: reserve };
      });
      job = created.job;
      reserved = created.reserved;
      if (env.JOB_QUEUE_DRIVER === "bullmq") {
        await getPhotoSearchQueue().add(
          "photo-search",
          { photoSearchJobId: job.id },
          { jobId: job.id }
        );
      }
      return job;
    } catch (error) {
      // Never leave a reserve hanging if the job could not be created/enqueued.
      if (reserved) {
        await this.credits
          .releaseReserve({
            userId: input.userId,
            photoSearchJobId: job?.id,
            reserveTransactionId: reserved.id,
            amountUnits: MODE_COST_UNITS.photo_search,
            metadata: { reason: "photo_search_enqueue_failed" }
          })
          .catch(() => undefined);
      }
      if (job) {
        await this.prisma.photoSearchJob
          .update({
            where: { id: job.id },
            data: { status: "failed", errorCode: "ENQUEUE_FAILED", finishedAt: new Date() }
          })
          .catch(() => undefined);
      }
      // A concurrent request won the unique key before this transaction reserved
      // credits, so return the winning job instead of charging the user twice.
      if (input.idempotencyKey && isUniqueConstraintError(error)) {
        return this.prisma.photoSearchJob.findUniqueOrThrow({
          where: { idempotencyKey: input.idempotencyKey }
        });
      }
      throw error;
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
