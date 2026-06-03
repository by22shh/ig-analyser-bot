import type { PrismaClient } from "@prisma/client";
import { env } from "../../config/env.js";
import type { AnalysisMode, Locale } from "../../telegram/constants.js";
import { MODE_COST_UNITS } from "../billing/packages.js";
import { CreditsService } from "../billing/credits.service.js";
import { normalizeInstagramUsername } from "../instagram/normalize.js";
import { analysisQueue } from "../../jobs/queues.js";

export type StartAnalysisInput = {
  userId: string;
  chatId: number;
  inputType: "username" | "photo_match";
  username: string;
  mode: AnalysisMode;
  language: Locale;
  targetPosition?: string;
  goal?: string;
  idempotencyKey: string;
};

export class AnalysisService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly credits: CreditsService
  ) {}

  async startAnalysis(input: StartAnalysisInput) {
    const username = normalizeInstagramUsername(input.username);
    const costCreditUnits = MODE_COST_UNITS[input.mode];
    const existing = await this.prisma.analysisJob.findUnique({
      where: { idempotencyKey: input.idempotencyKey }
    });
    if (existing) return analysisStartResult(existing, true);

    const reserved = await this.credits.reserve({
      userId: input.userId,
      amountUnits: costCreditUnits,
      metadata: { mode: input.mode, username }
    });
    let job: Awaited<ReturnType<typeof this.prisma.analysisJob.create>> | undefined;
    try {
      job = await this.prisma.analysisJob.create({
        data: {
          userId: input.userId,
          mode: input.mode,
          inputType: input.inputType,
          targetUsername: username,
          targetPosition: input.targetPosition,
          goal: input.goal,
          language: input.language,
          status: "queued",
          stage: "queued",
          telegramChatId: BigInt(input.chatId),
          costCreditUnits,
          reservedTransactionId: reserved.id,
          idempotencyKey: input.idempotencyKey
        } as never
      });
      await this.prisma.creditTransaction.update({
        where: { id: reserved.id },
        data: { analysisJobId: job.id }
      });
      await analysisQueue.add("analysis", { analysisJobId: job.id }, { jobId: job.id });
      return analysisStartResult(job, false);
    } catch (error) {
      // Never leave a reserve hanging if the job could not be created/enqueued.
      await this.credits
        .releaseReserve({
          userId: input.userId,
          analysisJobId: job?.id,
          reserveTransactionId: reserved.id,
          amountUnits: costCreditUnits,
          metadata: { reason: "analysis_enqueue_failed" }
        })
        .catch(() => undefined);
      if (job) {
        await this.prisma.analysisJob
          .update({
            where: { id: job.id },
            data: {
              status: "failed",
              stage: "failed",
              errorCode: "ENQUEUE_FAILED",
              finishedAt: new Date()
            }
          })
          .catch(() => undefined);
      }
      if (isUniqueConstraintError(error)) {
        const duplicate = await this.prisma.analysisJob.findUniqueOrThrow({
          where: { idempotencyKey: input.idempotencyKey }
        });
        return analysisStartResult(duplicate, true);
      }
      throw error;
    }
  }

  async updateProgress(jobId: string, stage: string, current = 0, total = 0) {
    const percent = total ? Math.round((current / total) * 100) : 0;
    return this.prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        status: stage,
        stage,
        progressCurrent: current,
        progressTotal: total,
        progressPercent: percent
      }
    });
  }
}

function analysisStartResult(
  job: { id: string; status: string; costCreditUnits: number },
  reused: boolean
) {
  return {
    jobId: job.id,
    status: job.status,
    estimatedDurationSec: env.OPENROUTER_API_KEY ? 420 : 15,
    costCreditUnits: job.costCreditUnits,
    reused
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
