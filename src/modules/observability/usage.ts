import type { PrismaClient } from "@prisma/client";

export type UsageEventInput = {
  userId?: string | null;
  analysisJobId?: string | null;
  provider: string;
  operation: string;
  model?: string | null;
  status: "success" | "failed" | "skipped";
  latencyMs?: number | null;
  costEstimateRub?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  errorCode?: string | null;
};

export async function recordUsage(prisma: PrismaClient, event: UsageEventInput) {
  return prisma.apiUsageEvent.create({
    data: {
      userId: event.userId ?? null,
      analysisJobId: event.analysisJobId ?? null,
      provider: event.provider,
      operation: event.operation,
      model: event.model ?? null,
      status: event.status,
      latencyMs: event.latencyMs ?? null,
      costEstimateRub: event.costEstimateRub ?? null,
      tokensIn: event.tokensIn ?? null,
      tokensOut: event.tokensOut ?? null,
      errorCode: event.errorCode ?? null
    }
  });
}
