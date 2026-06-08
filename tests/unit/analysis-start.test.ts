import { beforeEach, describe, expect, it, vi } from "vitest";

const queues = vi.hoisted(() => ({
  analysisQueue: { add: vi.fn().mockResolvedValue(undefined) },
  photoSearchQueue: { add: vi.fn().mockResolvedValue(undefined) }
}));

vi.mock("../../src/jobs/queues.js", () => ({
  redisConnection: {},
  getAnalysisQueue: () => queues.analysisQueue,
  getPhotoSearchQueue: () => queues.photoSearchQueue
}));

import { AnalysisService } from "../../src/modules/analysis/analysis.service.js";

describe("AnalysisService.startAnalysis", () => {
  beforeEach(() => {
    queues.analysisQueue.add.mockResolvedValue({} as never);
  });

  it("releases the linked reserve and fails the job when enqueue fails", async () => {
    const job = { id: "analysis-1", status: "queued", costCreditUnits: 300 };
    const prisma = {
      analysisJob: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(job),
        update: vi.fn().mockResolvedValue(job),
        findUniqueOrThrow: vi.fn()
      },
      $transaction: vi.fn()
    } as never;
    (
      prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }
    ).$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma));
    const releaseReserve = vi.fn().mockResolvedValue({});
    const credits = {
      reserveWithin: vi.fn().mockResolvedValue({ id: "reserve-1" }),
      releaseReserve
    } as never;
    queues.analysisQueue.add.mockRejectedValueOnce(new Error("redis_down"));
    const service = new AnalysisService(prisma, credits);

    await expect(
      service.startAnalysis({
        userId: "u1",
        chatId: 100,
        inputType: "username",
        username: "@Alice",
        mode: "standard",
        language: "ru",
        idempotencyKey: "analysis:u1:alice"
      })
    ).rejects.toThrow("redis_down");

    expect(releaseReserve).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        analysisJobId: "analysis-1",
        reserveTransactionId: "reserve-1"
      })
    );
    expect(
      (prisma as unknown as { analysisJob: { update: ReturnType<typeof vi.fn> } }).analysisJob
        .update
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "analysis-1" },
        data: expect.objectContaining({ status: "failed", errorCode: "ENQUEUE_FAILED" })
      })
    );
  });
});
