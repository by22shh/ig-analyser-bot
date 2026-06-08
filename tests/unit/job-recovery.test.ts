import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/jobs/queues.js", () => ({
  analysisQueue: { getJob: vi.fn(), add: vi.fn() },
  photoSearchQueue: { getJob: vi.fn(), add: vi.fn() }
}));

import { recoverJobs } from "../../src/jobs/recovery.js";

function prismaWithJobs(input: {
  analysisJobs?: unknown[];
  photoSearchJobs?: unknown[];
  staleReserves?: unknown[];
}) {
  return {
    analysisJob: {
      findMany: vi.fn().mockResolvedValue(input.analysisJobs ?? [])
    },
    photoSearchJob: {
      findMany: vi.fn().mockResolvedValue(input.photoSearchJobs ?? [])
    },
    creditTransaction: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue(input.staleReserves ?? [])
    }
  } as never;
}

describe("recoverJobs", () => {
  it("requeues active analysis jobs missing from BullMQ and relinks legacy reserves", async () => {
    const prisma = prismaWithJobs({
      analysisJobs: [{ id: "analysis-1", userId: "user-1", reservedTransactionId: "reserve-1" }]
    });
    const analysis = { getJob: vi.fn().mockResolvedValue(undefined), add: vi.fn() };
    const photoSearch = { getJob: vi.fn(), add: vi.fn() };

    const summary = await recoverJobs({
      prisma,
      analysis,
      photoSearch,
      now: new Date("2026-06-08T00:00:00Z")
    });

    expect(summary.analysisRequeued).toBe(1);
    expect(analysis.add).toHaveBeenCalledWith(
      "analysis",
      { analysisJobId: "analysis-1" },
      { jobId: "analysis-1" }
    );
    expect(
      (prisma as unknown as { creditTransaction: { updateMany: ReturnType<typeof vi.fn> } })
        .creditTransaction.updateMany
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "reserve-1", analysisJobId: null }),
        data: { analysisJobId: "analysis-1" }
      })
    );
  });

  it("does not add a duplicate when BullMQ already has a non-terminal job", async () => {
    const prisma = prismaWithJobs({
      analysisJobs: [{ id: "analysis-1", userId: "user-1", reservedTransactionId: null }]
    });
    const existing = { getState: vi.fn().mockResolvedValue("waiting"), remove: vi.fn() };
    const analysis = { getJob: vi.fn().mockResolvedValue(existing), add: vi.fn() };
    const photoSearch = { getJob: vi.fn(), add: vi.fn() };

    const summary = await recoverJobs({
      prisma,
      analysis,
      photoSearch,
      now: new Date("2026-06-08T00:00:00Z")
    });

    expect(summary.analysisRequeued).toBe(0);
    expect(existing.remove).not.toHaveBeenCalled();
    expect(analysis.add).not.toHaveBeenCalled();
  });

  it("replaces terminal BullMQ records for DB-active jobs", async () => {
    const prisma = prismaWithJobs({
      photoSearchJobs: [
        { id: "photo-1", userId: "user-1", createdAt: new Date("2026-06-08T00:00:00Z") }
      ]
    });
    const existing = { getState: vi.fn().mockResolvedValue("failed"), remove: vi.fn() };
    const analysis = { getJob: vi.fn(), add: vi.fn() };
    const photoSearch = { getJob: vi.fn().mockResolvedValue(existing), add: vi.fn() };

    const summary = await recoverJobs({
      prisma,
      analysis,
      photoSearch,
      now: new Date("2026-06-08T00:00:00Z")
    });

    expect(summary.photoSearchRequeued).toBe(1);
    expect(existing.remove).toHaveBeenCalled();
    expect(photoSearch.add).toHaveBeenCalledWith(
      "photo-search",
      { photoSearchJobId: "photo-1" },
      { jobId: "photo-1" }
    );
  });
});
