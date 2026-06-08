import { beforeEach, describe, expect, it, vi } from "vitest";

const queues = vi.hoisted(() => ({
  analysisQueue: { add: vi.fn().mockResolvedValue(undefined) },
  photoSearchQueue: { add: vi.fn().mockResolvedValue(undefined) }
}));

// Stub lazy BullMQ factories so unit tests never open Redis connections.
vi.mock("../../src/jobs/queues.js", () => ({
  redisConnection: {},
  getAnalysisQueue: () => queues.analysisQueue,
  getPhotoSearchQueue: () => queues.photoSearchQueue
}));

import { PhotoSearchService } from "../../src/modules/photo-search/photo-search.service.js";

function uniqueConstraintError(): Error {
  return Object.assign(new Error("Unique constraint failed on idempotencyKey"), { code: "P2002" });
}

describe("PhotoSearchService.createJob idempotency", () => {
  beforeEach(() => {
    queues.photoSearchQueue.add.mockResolvedValue({} as never);
  });

  it("returns the existing job without reserving when the key already has a job", async () => {
    const existing = { id: "job-existing" };
    const prisma = {
      photoSearchJob: {
        findUnique: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
        update: vi.fn(),
        findUniqueOrThrow: vi.fn()
      },
      $transaction: vi.fn()
    } as never;
    const credits = { reserveWithin: vi.fn(), releaseReserve: vi.fn() } as never;
    const service = new PhotoSearchService(prisma, credits);

    const result = await service.createJob({
      userId: "u1",
      telegramFileId: "file-a",
      idempotencyKey: "photo:u1:session-1"
    });

    expect(result).toBe(existing);
    expect(
      (credits as unknown as { reserveWithin: ReturnType<typeof vi.fn> }).reserveWithin
    ).not.toHaveBeenCalled();
    expect(
      (prisma as unknown as { photoSearchJob: { create: ReturnType<typeof vi.fn> } }).photoSearchJob
        .create
    ).not.toHaveBeenCalled();
  });

  it("returns the winning job without reserving on a unique-constraint race", async () => {
    const winner = { id: "job-winner" };
    const prisma = {
      photoSearchJob: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(uniqueConstraintError()),
        update: vi.fn().mockResolvedValue({}),
        findUniqueOrThrow: vi.fn().mockResolvedValue(winner)
      },
      $transaction: vi.fn()
    } as never;
    (
      prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }
    ).$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma));
    const releaseReserve = vi.fn().mockResolvedValue(null);
    const credits = {
      reserveWithin: vi.fn().mockResolvedValue({ id: "reserve-1" }),
      releaseReserve
    } as never;
    const service = new PhotoSearchService(prisma, credits);

    const result = await service.createJob({
      userId: "u1",
      telegramFileId: "file-a",
      idempotencyKey: "photo:u1:session-1"
    });

    expect(result).toBe(winner);
    expect(
      (credits as unknown as { reserveWithin: ReturnType<typeof vi.fn> }).reserveWithin
    ).not.toHaveBeenCalled();
    expect(releaseReserve).not.toHaveBeenCalled();
  });

  it("releases the linked reserve and fails the job when enqueue fails", async () => {
    const job = { id: "job-1" };
    const prisma = {
      photoSearchJob: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(job),
        update: vi.fn().mockResolvedValue({}),
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
    queues.photoSearchQueue.add.mockRejectedValueOnce(new Error("redis_down"));
    const service = new PhotoSearchService(prisma, credits);

    await expect(
      service.createJob({
        userId: "u1",
        telegramFileId: "file-a",
        idempotencyKey: "photo:u1:session-1"
      })
    ).rejects.toThrow("redis_down");

    expect(releaseReserve).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        photoSearchJobId: "job-1",
        reserveTransactionId: "reserve-1"
      })
    );
    expect(
      (prisma as unknown as { photoSearchJob: { update: ReturnType<typeof vi.fn> } }).photoSearchJob
        .update
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({ status: "failed", errorCode: "ENQUEUE_FAILED" })
      })
    );
  });
});
