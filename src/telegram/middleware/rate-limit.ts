import type { NextFunction } from "grammy";
import { env } from "../../config/env.js";
import { childLogger } from "../../config/logger.js";
import type { MyContext } from "../context.js";

const log = childLogger("telegram-rate-limit");
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 10_000;

export function clearTelegramRateLimit(): void {
  buckets.clear();
}

export async function telegramRateLimit(ctx: MyContext, next: NextFunction): Promise<void> {
  const max = env.RATE_LIMIT_BOT_MAX ?? 0;
  const windowMs = env.RATE_LIMIT_WINDOW_MS ?? 60_000;
  if (max <= 0 || windowMs <= 0 || isPaymentLifecycleUpdate(ctx)) {
    await next();
    return;
  }

  const key = rateLimitKey(ctx);
  if (!key) {
    await next();
    return;
  }

  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
    pruneBuckets(now);
  }

  bucket.count += 1;
  if (bucket.count <= max) {
    await next();
    return;
  }

  log.warn({ key, max, retryAfterMs: bucket.resetAt - now }, "telegram_rate_limited");
  if (ctx.callbackQuery) {
    await ctx
      .answerCallbackQuery({ text: "Too many requests. Try again later.", show_alert: false })
      .catch(() => undefined);
  }
}

function rateLimitKey(ctx: MyContext): string | undefined {
  const userId = ctx.from?.id;
  if (userId != null) return `tg:user:${userId}`;
  const chatId = ctx.chat?.id;
  if (chatId != null) return `tg:chat:${chatId}`;
  return undefined;
}

function isPaymentLifecycleUpdate(ctx: MyContext): boolean {
  return Boolean(ctx.preCheckoutQuery || ctx.message?.successful_payment);
}

function pruneBuckets(now: number): void {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
