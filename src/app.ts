import Fastify from "fastify";
import type { Bot } from "grammy";
import { isIP } from "node:net";
import { env } from "./config/env.js";
import { childLogger } from "./config/logger.js";
import type { Services } from "./modules/container.js";
import type { MyContext } from "./telegram/context.js";

const log = childLogger("server");

export function createApp(input: { services: Services; bot: Bot<MyContext> }) {
  const app = Fastify({ logger: false, trustProxy: true });

  app.get("/health", async () => ({ ok: true, env: env.APP_ENV }));

  app.post("/telegram/webhook", async (request, reply) => {
    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const secret = request.headers["x-telegram-bot-api-secret-token"];
      if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        reply.code(401);
        return { ok: false };
      }
    }
    await input.bot.handleUpdate(request.body as never);
    return { ok: true };
  });

  app.post("/webhooks/yookassa", async (request, reply) => {
    if (env.YOOKASSA_WEBHOOK_ALLOWED_IPS && !isLocalDevIp(request.ip) && !isAllowedWebhookIp(request.ip, env.YOOKASSA_WEBHOOK_ALLOWED_IPS)) {
      reply.code(403);
      return { accepted: false };
    }
    try {
      const body = request.body as any;
      const result = await input.services.payments.handleYooKassaWebhook({
        event: body.event,
        object: body.object,
        raw: body
      });
      return result;
    } catch (error) {
      log.error({ error }, "yookassa_webhook_failed");
      reply.code(500);
      return { accepted: false };
    }
  });

  app.get("/payments/yookassa/return", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>ZRETI payment</title></head><body><main style=\"font-family:system-ui,sans-serif;max-width:560px;margin:64px auto;padding:0 20px;line-height:1.5\"><h1>ZRETI</h1><p>Оплата обрабатывается. Вернитесь в Telegram: кредиты начислятся автоматически после подтверждения платежа.</p><p>Your payment is being processed. Return to Telegram: credits will be granted automatically after confirmation.</p></main></body></html>";
  });

  app.get("/mock/yookassa/pay/:id", async (request) => ({
    ok: true,
    id: (request.params as { id: string }).id,
    message: "Mock payment page. Send a payment.succeeded webhook or use tests to grant credits."
  }));

  return app;
}

function isAllowedWebhookIp(ip: string, allowlist: string): boolean {
  return allowlist
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .some((entry) => matchesCidr(normalizeIp(ip), entry));
}

function matchesCidr(ip: string, entry: string): boolean {
  const [range, prefixRaw] = entry.split("/");
  const normalizedRange = normalizeIp(range ?? "");
  const version = isIP(ip);
  const rangeVersion = isIP(normalizedRange);
  if ((version !== 4 && version !== 6) || version !== rangeVersion) return false;
  const totalBits = version === 4 ? 32 : 128;
  const prefix = prefixRaw == null ? totalBits : Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > totalBits) return false;
  const ipValue = ipToBigInt(ip, version);
  const rangeValue = ipToBigInt(normalizedRange, version);
  const hostBits = BigInt(totalBits - prefix);
  const mask = prefix === 0 ? 0n : ((1n << BigInt(totalBits)) - 1n) ^ ((1n << hostBits) - 1n);
  return (ipValue & mask) === (rangeValue & mask);
}

function normalizeIp(ip: string): string {
  return ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}

function isLocalDevIp(ip: string): boolean {
  return env.APP_ENV !== "production" && ["127.0.0.1", "::1"].includes(normalizeIp(ip));
}

function ipToBigInt(ip: string, version: 4 | 6): bigint {
  if (version === 4) {
    return ip.split(".").reduce((value, octet) => (value << 8n) + BigInt(Number(octet)), 0n);
  }
  const [headRaw, tailRaw] = ip.split("::");
  const head = headRaw ? headRaw.split(":").filter(Boolean) : [];
  const tail = tailRaw ? tailRaw.split(":").filter(Boolean) : [];
  const missing = 8 - head.length - tail.length;
  const parts = [...head, ...Array(Math.max(missing, 0)).fill("0"), ...tail];
  return parts.reduce((value, part) => (value << 16n) + BigInt(parseInt(part || "0", 16)), 0n);
}
