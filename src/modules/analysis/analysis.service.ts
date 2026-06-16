import { Prisma, type PrismaClient } from "@prisma/client";
import { env } from "../../config/env.js";
import type { AnalysisMode, Locale } from "../../telegram/constants.js";
import { MODE_COST_UNITS } from "../billing/packages.js";
import { CreditsService } from "../billing/credits.service.js";
import { normalizeInstagramUsername } from "../instagram/normalize.js";
import { getAnalysisQueue } from "../../jobs/queues.js";

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
  source?: "telegram" | "mini_app" | "analysis_service";
  requestId?: string;
  lawfulBasisAccepted?: boolean;
  lawfulBasisVersion?: string;
};

export const OSINT_LAWFUL_BASIS_VERSION = "osint-lawful-basis-2026-06-13";

export class AnalysisService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly credits: CreditsService
  ) {}

  async startAnalysis(input: StartAnalysisInput) {
    if (input.mode === "osint_compliance" && input.lawfulBasisAccepted !== true) {
      throw new Error("OSINT_LAWFUL_BASIS_REQUIRED");
    }
    const username = normalizeInstagramUsername(input.username);
    const costCreditUnits = MODE_COST_UNITS[input.mode];
    const existing = await this.prisma.analysisJob.findUnique({
      where: { idempotencyKey: input.idempotencyKey }
    });
    if (existing) {
      await this.ensureOsintLawfulBasisAudit(this.prisma, input, {
        id: existing.id,
        mode: existing.mode,
        createdAt: existing.createdAt
      });
      return analysisStartResult(existing, true);
    }

    let job: Awaited<ReturnType<typeof this.prisma.analysisJob.create>> | undefined;
    let reserved: Awaited<ReturnType<CreditsService["reserve"]>> | undefined;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const analysisJob = await tx.analysisJob.create({
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
            idempotencyKey: input.idempotencyKey
          } as never
        });
        const reserve = await this.credits.reserveWithin(tx, {
          userId: input.userId,
          analysisJobId: analysisJob.id,
          amountUnits: costCreditUnits,
          metadata: { mode: input.mode, username }
        });
        const linkedJob = await tx.analysisJob.update({
          where: { id: analysisJob.id },
          data: { reservedTransactionId: reserve.id }
        });
        await this.ensureOsintLawfulBasisAudit(tx, input, {
          id: linkedJob.id,
          mode: linkedJob.mode,
          createdAt: linkedJob.createdAt
        });
        return { job: linkedJob, reserved: reserve };
      });
      job = created.job;
      reserved = created.reserved;
      if (env.JOB_QUEUE_DRIVER === "bullmq") {
        await getAnalysisQueue().add("analysis", { analysisJobId: job.id }, { jobId: job.id });
      }
      return analysisStartResult(job, false);
    } catch (error) {
      // Never leave a reserve hanging if the job could not be created/enqueued.
      if (reserved) {
        await this.credits
          .releaseReserve({
            userId: input.userId,
            analysisJobId: job?.id,
            reserveTransactionId: reserved.id,
            amountUnits: costCreditUnits,
            metadata: { reason: "analysis_enqueue_failed" }
          })
          .catch(() => undefined);
      }
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

  private async ensureOsintLawfulBasisAudit(
    client: Pick<PrismaClient | Prisma.TransactionClient, "auditLog">,
    input: StartAnalysisInput,
    job: { id: string; mode: string; createdAt: Date }
  ): Promise<void> {
    if (job.mode !== "osint_compliance") return;
    const existing = await client.auditLog.findFirst({
      where: {
        action: "osint_lawful_basis_accepted",
        entityType: "analysis_job",
        entityId: job.id
      },
      select: { id: true }
    });
    if (existing) return;
    const timestamp = new Date();
    await client.auditLog.create({
      data: {
        actorUserId: input.userId,
        targetUserId: input.userId,
        action: "osint_lawful_basis_accepted",
        entityType: "analysis_job",
        entityId: job.id,
        metadata: {
          userId: input.userId,
          analysisJobId: job.id,
          mode: job.mode,
          source: input.source ?? "analysis_service",
          requestId: input.requestId ?? null,
          timestamp: timestamp.toISOString(),
          lawfulBasisVersion: input.lawfulBasisVersion ?? OSINT_LAWFUL_BASIS_VERSION,
          lawfulBasisAccepted: true,
          jobCreatedAt: job.createdAt.toISOString()
        } satisfies Prisma.InputJsonObject
      }
    });
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
    estimatedDurationSec: env.ANALYSIS_ESTIMATED_DURATION_SEC ?? (env.OPENROUTER_API_KEY ? 90 : 15),
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
