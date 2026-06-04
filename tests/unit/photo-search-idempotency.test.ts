import { describe, expect, it, vi } from "vitest";

// The service module imports the BullMQ queues at load time; stub them so no
// Redis connection is opened during unit tests.
vi.mock("../../src/jobs/queues.js", () => ({
  redisConnection: {},
  analysisQueue: { add: vi.fn().mockResolvedValue(undefined) },
  photoSearchQueue: { add: vi.fn().mockResolvedValue(undefined) }
}));

import { PhotoSearchService } from "../../src/modules/photo-search/photo-search.service.js";

function uniqueConstraintError(): Error {
  return Object.assign(new Error("Unique constraint failed on idempotencyKey"), { code: "P2002" });
}

describe("PhotoSearchService.createJob idempotency", () => {
  it("returns the existing job without reserving when the key already has a job", async () => {
    const existing = { id: "job-existing" };
    const prisma = {
      photoSearchJob: {
        findUnique: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
        update: vi.fn(),
        findUniqueOrThrow: vi.fn()
      },
      creditTransaction: { update: vi.fn() }
    } as never;
    const credits = { reserve: vi.fn(), releaseReserve: vi.fn() } as never;
    const service = new PhotoSearchService(prisma, credits);

    const result = await service.createJob({
      userId: "u1",
      telegramFileId: "file-a",
      idempotencyKey: "photo:u1:session-1"
    });

    expect(result).toBe(existing);
    expect((credits as unknown as { reserve: ReturnType<typeof vi.fn> }).reserve).not.toHaveBeenCalled();
    expect(
      (prisma as unknown as { photoSearchJob: { create: ReturnType<typeof vi.fn> } }).photoSearchJob
        .create
    ).not.toHaveBeenCalled();
  });

  it("releases the duplicate reserve and returns the winning job on a unique-constraint race", async () => {
    const winner = { id: "job-winner" };
    const prisma = {
      photoSearchJob: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(uniqueConstraintError()),
        update: vi.fn().mockResolvedValue({}),
        findUniqueOrThrow: vi.fn().mockResolvedValue(winner)
      },
      creditTransaction: { update: vi.fn() }
    } as never;
    const releaseReserve = vi.fn().mockResolvedValue(null);
    const credits = {
      reserve: vi.fn().mockResolvedValue({ id: "reserve-1" }),
      releaseReserve
    } as never;
    const service = new PhotoSearchService(prisma, credits);

    const result = await service.createJob({
      userId: "u1",
      telegramFileId: "file-a",
      idempotencyKey: "photo:u1:session-1"
    });

    expect(result).toBe(winner);
    expect(releaseReserve).toHaveBeenCalledTimes(1);
    expect(releaseReserve).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", reserveTransactionId: "reserve-1" })
    );
  });
});
