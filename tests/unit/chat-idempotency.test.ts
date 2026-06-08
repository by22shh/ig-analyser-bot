import { describe, expect, it, vi } from "vitest";

import { ReportChatService } from "../../src/modules/chat/report-chat.service.js";

describe("ReportChatService.ask idempotency", () => {
  it("returns the cached answer without reserving or calling the LLM when the update was already answered", async () => {
    const prisma = {
      report: {
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: "r1", rawText: "report", sections: [] })
      },
      reportChatMessage: {
        findUnique: vi.fn().mockResolvedValue({
          role: "assistant",
          content: "cached answer",
          model: "m",
          tokensIn: 3,
          tokensOut: 7
        }),
        create: vi.fn()
      },
      reportChatSession: { upsert: vi.fn() }
    } as never;
    const llm = { chat: vi.fn() } as never;
    const credits = { reserve: vi.fn(), captureReserve: vi.fn(), releaseReserve: vi.fn() } as never;
    const service = new ReportChatService(prisma, llm, credits);

    const result = await service.ask({
      userId: "u1",
      reportId: "r1",
      question: "q",
      language: "ru",
      requestId: "42"
    });

    expect(result.text).toBe("cached answer");
    expect(
      (credits as unknown as { reserve: ReturnType<typeof vi.fn> }).reserve
    ).not.toHaveBeenCalled();
    expect((llm as unknown as { chat: ReturnType<typeof vi.fn> }).chat).not.toHaveBeenCalled();
    expect(
      (prisma as unknown as { reportChatMessage: { findUnique: ReturnType<typeof vi.fn> } })
        .reportChatMessage.findUnique
    ).toHaveBeenCalledWith({ where: { idempotencyKey: "chat:u1:42" } });
  });

  it("persists the assistant answer with the idempotency key inside the capture transaction", async () => {
    const txMessageCreate = vi.fn().mockResolvedValue({});
    const txMessageUpdate = vi.fn().mockResolvedValue({});
    const prisma = {
      report: {
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: "r1", rawText: "report", sections: [] })
      },
      reportChatMessage: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(async (input: { data: { id: string; role: string } }) => ({
          id: input.data.id
        })),
        deleteMany: vi.fn()
      },
      reportChatSession: { upsert: vi.fn().mockResolvedValue({ id: "s1" }) },
      apiUsageEvent: { create: vi.fn().mockResolvedValue({}) }
    } as never;
    const llm = {
      chat: vi.fn().mockResolvedValue({ text: "fresh", model: "m", tokensIn: 1, tokensOut: 2 })
    } as never;
    const captureReserve = vi
      .fn()
      .mockImplementation(async (input: { within?: (tx: unknown) => Promise<void> }) => {
        if (input.within) {
          await input.within({
            reportChatMessage: { create: txMessageCreate, update: txMessageUpdate }
          });
        }
      });
    const credits = {
      reserve: vi.fn().mockResolvedValue({ id: "reserve-1" }),
      captureReserve,
      releaseReserve: vi.fn()
    } as never;
    const service = new ReportChatService(prisma, llm, credits);

    const result = await service.ask({
      userId: "u1",
      reportId: "r1",
      question: "q",
      language: "ru",
      requestId: "99"
    });

    expect(result.text).toBe("fresh");
    const reserveInput = (credits as unknown as { reserve: ReturnType<typeof vi.fn> }).reserve.mock
      .calls[0]?.[0] as { reportChatMessageId?: string };
    const captureInput = captureReserve.mock.calls[0]?.[0] as { reportChatMessageId?: string };
    expect(reserveInput.reportChatMessageId).toEqual(expect.any(String));
    expect(captureInput.reportChatMessageId).toBe(reserveInput.reportChatMessageId);
    expect(captureReserve).toHaveBeenCalledTimes(1);
    expect(txMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: reserveInput.reportChatMessageId },
        data: expect.objectContaining({
          role: "assistant",
          content: "fresh"
        })
      })
    );
    expect(
      (prisma as unknown as { reportChatMessage: { create: ReturnType<typeof vi.fn> } })
        .reportChatMessage.create
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "assistant_pending",
          idempotencyKey: "chat:u1:99"
        })
      })
    );
  });

  it("persists the user question inside the capture transaction, never as a standalone insert", async () => {
    const txCreate = vi.fn().mockResolvedValue({});
    const txUpdate = vi.fn().mockResolvedValue({});
    const topLevelCreate = vi.fn(async (input: { data: { id: string; role: string } }) => ({
      id: input.data.id
    }));
    const prisma = {
      report: {
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: "r1", rawText: "report", sections: [] })
      },
      reportChatMessage: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: topLevelCreate,
        deleteMany: vi.fn()
      },
      reportChatSession: { upsert: vi.fn().mockResolvedValue({ id: "s1" }) },
      apiUsageEvent: { create: vi.fn().mockResolvedValue({}) }
    } as never;
    const llm = {
      chat: vi.fn().mockResolvedValue({ text: "fresh", model: "m", tokensIn: 1, tokensOut: 2 })
    } as never;
    const captureReserve = vi
      .fn()
      .mockImplementation(async (input: { within?: (tx: unknown) => Promise<void> }) => {
        if (input.within) {
          await input.within({ reportChatMessage: { create: txCreate, update: txUpdate } });
        }
      });
    const credits = {
      reserve: vi.fn().mockResolvedValue({ id: "reserve-1" }),
      captureReserve,
      releaseReserve: vi.fn()
    } as never;
    const service = new ReportChatService(prisma, llm, credits);

    await service.ask({
      userId: "u1",
      reportId: "r1",
      question: "q",
      language: "ru",
      requestId: "100"
    });

    // The question must be written transactionally with the capture (alongside
    // the assistant answer), never as a standalone pre-LLM insert. The only
    // standalone write is the idempotency slot for the pending assistant answer.
    const topLevelRoles = (topLevelCreate.mock.calls as Array<[{ data: { role: string } }]>).map(
      (call) => call[0].data.role
    );
    expect(topLevelRoles).toEqual(["assistant_pending"]);
    const roles = (txCreate.mock.calls as Array<[{ data: { role: string } }]>).map(
      (call) => call[0].data.role
    );
    expect(roles).toEqual(["user"]);
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "assistant", content: "fresh" })
      })
    );
  });

  it("waits for the winning request when inserting the idempotency slot races", async () => {
    const uniqueError = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    const prisma = {
      report: {
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: "r1", rawText: "report", sections: [] })
      },
      reportChatMessage: {
        findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
          role: "assistant",
          content: "winner answer",
          model: "m",
          tokensIn: 4,
          tokensOut: 8
        }),
        create: vi.fn().mockRejectedValue(uniqueError)
      },
      reportChatSession: { upsert: vi.fn().mockResolvedValue({ id: "s1" }) }
    } as never;
    const llm = { chat: vi.fn() } as never;
    const credits = { reserve: vi.fn(), captureReserve: vi.fn(), releaseReserve: vi.fn() } as never;
    const service = new ReportChatService(prisma, llm, credits);

    const result = await service.ask({
      userId: "u1",
      reportId: "r1",
      question: "q",
      language: "ru",
      requestId: "101"
    });

    expect(result.text).toBe("winner answer");
    expect((llm as unknown as { chat: ReturnType<typeof vi.fn> }).chat).not.toHaveBeenCalled();
    expect(
      (credits as unknown as { reserve: ReturnType<typeof vi.fn> }).reserve
    ).not.toHaveBeenCalled();
  });

  it("recovers a stale pending idempotency slot and processes a fresh answer", async () => {
    const txMessageCreate = vi.fn().mockResolvedValue({});
    const txMessageUpdate = vi.fn().mockResolvedValue({});
    const pendingId = "old-pending";
    const staleCreatedAt = new Date(Date.now() - 16 * 60 * 1000);
    const topLevelCreate = vi.fn(async (input: { data: { id: string; role: string } }) => ({
      id: input.data.id
    }));
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      report: {
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: "r1", rawText: "report", sections: [] })
      },
      reportChatMessage: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: pendingId,
            role: "assistant_pending",
            content: "",
            createdAt: staleCreatedAt
          })
          .mockResolvedValueOnce(null),
        create: topLevelCreate,
        deleteMany
      },
      reportChatSession: { upsert: vi.fn().mockResolvedValue({ id: "s1" }) },
      apiUsageEvent: { create: vi.fn().mockResolvedValue({}) }
    } as never;
    const llm = {
      chat: vi.fn().mockResolvedValue({ text: "fresh", model: "m", tokensIn: 1, tokensOut: 2 })
    } as never;
    const captureReserve = vi
      .fn()
      .mockImplementation(async (input: { within?: (tx: unknown) => Promise<void> }) => {
        if (input.within) {
          await input.within({
            reportChatMessage: { create: txMessageCreate, update: txMessageUpdate }
          });
        }
      });
    const releaseReserve = vi.fn().mockResolvedValue(undefined);
    const credits = {
      reserve: vi.fn().mockResolvedValue({ id: "reserve-1" }),
      captureReserve,
      releaseReserve
    } as never;
    const service = new ReportChatService(prisma, llm, credits);

    const result = await service.ask({
      userId: "u1",
      reportId: "r1",
      question: "q",
      language: "ru",
      requestId: "102"
    });

    expect(result.text).toBe("fresh");
    expect(releaseReserve).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        reportChatMessageId: pendingId,
        amountUnits: 5,
        metadata: expect.objectContaining({ reason: "stale_pending_chat_recovered" })
      })
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: pendingId, role: "assistant_pending" }
    });
    expect(topLevelCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "assistant_pending",
          idempotencyKey: "chat:u1:102"
        })
      })
    );
    expect(txMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "assistant", content: "fresh" })
      })
    );
  });

  it("recovers stale pending answers in the background", async () => {
    const now = new Date("2026-06-08T12:00:00.000Z");
    const stale = new Date(now.getTime() - 16 * 60 * 1000);
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: "pending-1", session: { userId: "u1" }, createdAt: stale }]);
    const deleteMany = vi.fn().mockResolvedValueOnce({ count: 1 });
    const prisma = {
      reportChatMessage: { findMany, deleteMany }
    } as never;
    const credits = { releaseReserve: vi.fn().mockResolvedValue(undefined) } as never;
    const service = new ReportChatService(prisma, {} as never, credits);

    const recovered = await service.recoverStalePendingAnswers(now);

    expect(recovered).toBe(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: "assistant_pending",
          createdAt: { lt: new Date(now.getTime() - 15 * 60 * 1000) }
        }),
        take: 100
      })
    );
    expect(
      (credits as unknown as { releaseReserve: ReturnType<typeof vi.fn> }).releaseReserve
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        reportChatMessageId: "pending-1",
        amountUnits: 5
      })
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: "pending-1", role: "assistant_pending" }
    });
  });

  it("keeps stale pending answers when reserve release fails", async () => {
    const now = new Date("2026-06-08T12:00:00.000Z");
    const findMany = vi.fn().mockResolvedValue([{ id: "pending-1", session: { userId: "u1" } }]);
    const deleteMany = vi.fn();
    const prisma = {
      reportChatMessage: { findMany, deleteMany }
    } as never;
    const credits = { releaseReserve: vi.fn().mockRejectedValue(new Error("db down")) } as never;
    const service = new ReportChatService(prisma, {} as never, credits);

    await expect(service.recoverStalePendingAnswers(now)).rejects.toThrow("db down");

    expect(deleteMany).not.toHaveBeenCalled();
  });
});
