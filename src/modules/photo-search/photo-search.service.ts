import type { PrismaClient } from "@prisma/client";
import { photoSearchQueue } from "../../jobs/queues.js";
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
  }) {
    const reserved = await this.credits.reserve({
      userId: input.userId,
      amountUnits: MODE_COST_UNITS.photo_search,
      metadata: { type: "photo_search" }
    });
    let job: Awaited<ReturnType<typeof this.prisma.photoSearchJob.create>> | undefined;
    try {
      job = await this.prisma.photoSearchJob.create({
        data: {
          userId: input.userId,
          telegramChatId: input.chatId != null ? BigInt(input.chatId) : undefined,
          telegramFileId: input.telegramFileId,
          telegramFileUniqueId: input.telegramFileUniqueId,
          inputMimeType: input.mimeType,
          inputSizeBytes: input.sizeBytes,
          status: "queued"
        }
      });
      await this.prisma.creditTransaction.update({
        where: { id: reserved.id },
        data: { photoSearchJobId: job.id }
      });
      await photoSearchQueue.add("photo-search", { photoSearchJobId: job.id }, { jobId: job.id });
      return job;
    } catch (error) {
      // Never leave a reserve hanging if the job could not be created/enqueued.
      await this.credits
        .releaseReserve({
          userId: input.userId,
          photoSearchJobId: job?.id,
          reserveTransactionId: reserved.id,
          amountUnits: MODE_COST_UNITS.photo_search,
          metadata: { reason: "photo_search_enqueue_failed" }
        })
        .catch(() => undefined);
      if (job) {
        await this.prisma.photoSearchJob
          .update({
            where: { id: job.id },
            data: { status: "failed", errorCode: "ENQUEUE_FAILED", finishedAt: new Date() }
          })
          .catch(() => undefined);
      }
      throw error;
    }
  }
}
