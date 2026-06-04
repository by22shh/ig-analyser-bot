import { describe, expect, it, vi } from "vitest";
import { userContext } from "../../src/telegram/middleware/user-context.js";

describe("userContext", () => {
  it("does not upsert a user for Telegram payment lifecycle updates", async () => {
    const upsertTelegramUser = vi.fn();
    const next = vi.fn();

    await userContext(
      {
        from: { id: 123 },
        message: { successful_payment: {} },
        services: { users: { upsertTelegramUser } }
      } as never,
      next
    );

    expect(upsertTelegramUser).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});
