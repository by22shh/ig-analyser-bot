import { describe, expect, it, vi } from "vitest";
import { consentGate } from "../../src/telegram/middleware/consent-gate.js";

describe("consentGate", () => {
  it("blocks non-start interactions until consent is accepted", async () => {
    const next = vi.fn();
    const reply = vi.fn();

    await consentGate(
      {
        user: { language: "ru", consentAcceptedAt: null },
        message: { text: "some_username" },
        reply
      } as never,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("Бот"), expect.any(Object));
  });

  it("allows /start before consent", async () => {
    const next = vi.fn();
    const reply = vi.fn();

    await consentGate(
      {
        user: { language: "ru", consentAcceptedAt: null },
        message: { text: "/start" },
        reply
      } as never,
      next
    );

    expect(next).toHaveBeenCalledOnce();
    expect(reply).not.toHaveBeenCalled();
  });
});
