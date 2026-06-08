import { beforeEach, describe, expect, it, vi } from "vitest";

const processorMocks = vi.hoisted(() => ({
  processAnalysisJob: vi.fn(),
  processPhotoSearchJob: vi.fn()
}));

vi.mock("../../src/jobs/workers/analysis.worker.js", () => ({
  processAnalysisJob: processorMocks.processAnalysisJob
}));

vi.mock("../../src/jobs/workers/photo-search.worker.js", () => ({
  processPhotoSearchJob: processorMocks.processPhotoSearchJob
}));

import {
  processNextAnalysisJob,
  processNextPhotoSearchJob
} from "../../src/jobs/postgres-workers.js";

function claimed(id: string, attemptsMade: number, maxAttempts = 2) {
  return {
    id,
    queueAttemptsMade: attemptsMade,
    queueMaxAttempts: maxAttempts,
    queueLockedBy: "worker-1",
    queueLockedUntil: new Date("2026-06-08T00:10:00Z")
  };
}

function prismaWithClaim(job: ReturnType<typeof claimed> | null) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(job ? [job] : []),
    analysisJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    photoSearchJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }
  } as never;
}

describe("Postgres queue workers", () => {
  beforeEach(() => {
    vi.useRealTimers();
    processorMocks.processAnalysisJob.mockReset();
    processorMocks.processPhotoSearchJob.mockReset();
    processorMocks.processAnalysisJob.mockResolvedValue(undefined);
    processorMocks.processPhotoSearchJob.mockResolvedValue(undefined);
  });

  it("passes BullMQ-compatible attempt metadata from the claim", async () => {
    const prisma = prismaWithClaim(claimed("analysis-1", 1));
    const input = { prisma } as never;

    await expect(processNextAnalysisJob(input, "worker-1")).resolves.toBe(true);

    expect(processorMocks.processAnalysisJob).toHaveBeenCalledWith(input, "analysis-1", {
      attemptsMade: 0,
      attempts: 2,
      lease: { workerId: "worker-1" }
    });
  });

  it("schedules a retry with the same lease after the first failed attempt", async () => {
    const prisma = prismaWithClaim(claimed("analysis-1", 1));
    processorMocks.processAnalysisJob.mockRejectedValueOnce(new Error("APIFY_TIMEOUT"));

    await expect(processNextAnalysisJob({ prisma } as never, "worker-1")).rejects.toThrow(
      "APIFY_TIMEOUT"
    );

    expect(
      (prisma as unknown as { analysisJob: { updateMany: ReturnType<typeof vi.fn> } }).analysisJob
        .updateMany
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "analysis-1",
          queueLockedBy: "worker-1"
        }),
        data: expect.objectContaining({
          status: "retrying",
          queueLockedBy: null,
          queueLockedUntil: null,
          queueNextRunAt: expect.any(Date)
        })
      })
    );
  });

  it("does not schedule another retry once the max attempt is claimed", async () => {
    const prisma = prismaWithClaim(claimed("analysis-1", 2));
    processorMocks.processAnalysisJob.mockRejectedValueOnce(new Error("OPENROUTER_500"));

    await expect(processNextAnalysisJob({ prisma } as never, "worker-1")).rejects.toThrow(
      "OPENROUTER_500"
    );

    const updateCalls = (
      prisma as unknown as { analysisJob: { updateMany: ReturnType<typeof vi.fn> } }
    ).analysisJob.updateMany.mock.calls;
    expect(
      updateCalls.some(
        ([input]) =>
          (input as { data?: { status?: string } } | undefined)?.data?.status === "retrying"
      )
    ).toBe(false);
  });

  it("claims photo jobs by lock expiry, not by createdAt staleness", async () => {
    const prisma = prismaWithClaim(claimed("photo-1", 1));
    const input = { prisma } as never;

    await expect(processNextPhotoSearchJob(input, "worker-1")).resolves.toBe(true);

    expect(processorMocks.processPhotoSearchJob).toHaveBeenCalledWith(input, "photo-1", {
      attemptsMade: 0,
      attempts: 2,
      lease: { workerId: "worker-1" }
    });

    const sql = String(
      (prisma as unknown as { $queryRaw: ReturnType<typeof vi.fn> }).$queryRaw.mock.calls[0]?.[0]
    );
    expect(sql).toContain('"queueLockedUntil"');
    expect(sql).not.toContain('"createdAt" <');
  });
});
