import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../src/config/env.js";
import {
  clearTelegramRateLimit,
  telegramRateLimit
} from "../../src/telegram/middleware/rate-limit.js";

const originalEnv = {
  RATE_LIMIT_BOT_MAX: env.RATE_LIMIT_BOT_MAX,
  RATE_LIMIT_WINDOW_MS: env.RATE_LIMIT_WINDOW_MS
};

afterEach(() => {
  Object.assign(env, originalEnv);
  clearTelegramRateLimit();
});

describe("telegramRateLimit", () => {
  it("blocks repeated user updates over the configured window limit", async () => {
    env.RATE_LIMIT_BOT_MAX = 1;
    env.RATE_LIMIT_WINDOW_MS = 60_000;
    const answerCallbackQuery = vi.fn(async () => undefined);
    const ctx = {
      from: { id: 42 },
      callbackQuery: { id: "callback-1" },
      answerCallbackQuery
    };
    const next = vi.fn(async () => undefined);

    await telegramRateLimit(ctx as never, next);
    await telegramRateLimit(ctx as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it("does not rate limit payment lifecycle updates", async () => {
    env.RATE_LIMIT_BOT_MAX = 1;
    const ctx = {
      from: { id: 42 },
      preCheckoutQuery: { id: "pre-checkout-1" }
    };
    const next = vi.fn(async () => undefined);

    await telegramRateLimit(ctx as never, next);
    await telegramRateLimit(ctx as never, next);

    expect(next).toHaveBeenCalledTimes(2);
  });
});
