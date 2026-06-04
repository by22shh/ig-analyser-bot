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

/**
 * Best-effort usage logging. Usage events are observability, never a correctness
 * dependency, so a transient DB failure must never propagate: on a paid success
 * path an unguarded throw would fail the job and trigger a costly re-run
 * (re-billing Apify/OpenRouter/FaceCheck). Returns undefined on failure.
 */
export async function recordUsageSafe(
  prisma: PrismaClient,
  event: UsageEventInput,
  onError?: (error: unknown) => void
) {
  try {
    return await recordUsage(prisma, event);
  } catch (error) {
    onError?.(error);
    return undefined;
  }
}
