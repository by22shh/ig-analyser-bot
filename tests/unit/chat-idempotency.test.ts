import { describe, expect, it, vi } from "vitest";

import { ReportChatService } from "../../src/modules/chat/report-chat.service.js";

describe("ReportChatService.ask idempotency", () => {
  it("returns the cached answer without reserving or calling the LLM when the update was already answered", async () => {
    const prisma = {
      report: {
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: "r1", rawText: "report", sections: [] })
      },
      reportChatMessage: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ content: "cached answer", model: "m", tokensIn: 3, tokensOut: 7 }),
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
    const prisma = {
      report: {
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: "r1", rawText: "report", sections: [] })
      },
      reportChatMessage: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
      reportChatSession: { upsert: vi.fn().mockResolvedValue({ id: "s1" }) },
      apiUsageEvent: { create: vi.fn().mockResolvedValue({}) }
    } as never;
    const llm = {
      chat: vi.fn().mockResolvedValue({ text: "fresh", model: "m", tokensIn: 1, tokensOut: 2 })
    } as never;
    const captureReserve = vi
      .fn()
      .mockImplementation(async (input: { within?: (tx: unknown) => Promise<void> }) => {
        if (input.within) await input.within({ reportChatMessage: { create: txMessageCreate } });
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
    expect(captureReserve).toHaveBeenCalledTimes(1);
    expect(txMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "assistant", idempotencyKey: "chat:u1:99" })
      })
    );
  });
});
