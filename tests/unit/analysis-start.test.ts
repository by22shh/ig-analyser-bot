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
    queues.analysisQueue.add.mockClear();
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

  it("writes lawful-basis audit metadata when starting OSINT compliance analysis", async () => {
    const createdAt = new Date("2026-06-13T10:00:00.000Z");
    const job = {
      id: "11111111-1111-1111-1111-111111111111",
      status: "queued",
      costCreditUnits: 300,
      mode: "osint_compliance",
      createdAt
    };
    const prisma = {
      analysisJob: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(job),
        update: vi.fn().mockResolvedValue(job),
        findUniqueOrThrow: vi.fn()
      },
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "audit-1" })
      },
      $transaction: vi.fn()
    } as never;
    (
      prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }
    ).$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma));
    const credits = {
      reserveWithin: vi.fn().mockResolvedValue({ id: "reserve-1" }),
      releaseReserve: vi.fn()
    } as never;
    const service = new AnalysisService(prisma, credits);

    await service.startAnalysis({
      userId: "22222222-2222-2222-2222-222222222222",
      chatId: 100,
      inputType: "username",
      username: "alice",
      mode: "osint_compliance",
      language: "ru",
      idempotencyKey: "analysis:u1:req-1",
      source: "mini_app",
      requestId: "req-1",
      lawfulBasisAccepted: true
    });

    expect(
      (prisma as unknown as { auditLog: { create: ReturnType<typeof vi.fn> } }).auditLog.create
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "22222222-2222-2222-2222-222222222222",
        targetUserId: "22222222-2222-2222-2222-222222222222",
        action: "osint_lawful_basis_accepted",
        entityType: "analysis_job",
        entityId: "11111111-1111-1111-1111-111111111111",
        metadata: expect.objectContaining({
          userId: "22222222-2222-2222-2222-222222222222",
          analysisJobId: "11111111-1111-1111-1111-111111111111",
          mode: "osint_compliance",
          source: "mini_app",
          requestId: "req-1",
          lawfulBasisVersion: "osint-lawful-basis-2026-06-13",
          lawfulBasisAccepted: true,
          jobCreatedAt: "2026-06-13T10:00:00.000Z"
        })
      })
    });
  });

  it("does not duplicate lawful-basis audit logs for idempotent OSINT starts", async () => {
    const existing = {
      id: "11111111-1111-1111-1111-111111111111",
      status: "queued",
      costCreditUnits: 300,
      mode: "osint_compliance",
      createdAt: new Date("2026-06-13T10:00:00.000Z")
    };
    const prisma = {
      analysisJob: { findUnique: vi.fn().mockResolvedValue(existing) },
      auditLog: {
        findFirst: vi.fn().mockResolvedValue({ id: "audit-1" }),
        create: vi.fn()
      }
    } as never;
    const credits = { reserveWithin: vi.fn(), releaseReserve: vi.fn() } as never;
    const service = new AnalysisService(prisma, credits);

    const result = await service.startAnalysis({
      userId: "22222222-2222-2222-2222-222222222222",
      chatId: 100,
      inputType: "username",
      username: "alice",
      mode: "osint_compliance",
      language: "ru",
      idempotencyKey: "analysis:u1:req-1",
      source: "telegram",
      requestId: "req-1",
      lawfulBasisAccepted: true
    });

    expect(result.reused).toBe(true);
    expect(
      (prisma as unknown as { auditLog: { create: ReturnType<typeof vi.fn> } }).auditLog.create
    ).not.toHaveBeenCalled();
    expect(queues.analysisQueue.add).not.toHaveBeenCalled();
  });

  it("rejects OSINT compliance starts without lawful-basis confirmation", async () => {
    const service = new AnalysisService({} as never, {} as never);

    await expect(
      service.startAnalysis({
        userId: "u1",
        chatId: 100,
        inputType: "username",
        username: "alice",
        mode: "osint_compliance",
        language: "ru",
        idempotencyKey: "analysis:u1:req-1"
      })
    ).rejects.toThrow("OSINT_LAWFUL_BASIS_REQUIRED");
  });
});
