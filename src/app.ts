import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import type { Bot } from "grammy";
import { isIP } from "node:net";
import { env, isLocalRuntimeEnv } from "./config/env.js";
import { childLogger } from "./config/logger.js";
import type { Services } from "./modules/container.js";
import { registerMiniAppRoutes } from "./mini-app/routes.js";
import type { MyContext } from "./telegram/context.js";

const log = childLogger("server");

export function createApp(input: { services: Services; bot: Bot<MyContext> }) {
  const app = Fastify({ logger: false, trustProxy: false });

  app.get("/health", async () => ({ ok: true, env: env.APP_ENV }));
  registerMiniAppRoutes(app, input);

  app.post("/telegram/webhook", async (request, reply) => {
    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const secret = request.headers["x-telegram-bot-api-secret-token"];
      if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        reply.code(401);
        return { ok: false };
      }
    }
    const update = request.body as { update_id?: number };
    await input.bot.handleUpdate(update as never);
    // grammy's bot.catch swallows handler errors, so handleUpdate resolves even
    // when processing failed. Signal a retry to Telegram (HTTP 500) when the
    // dedup middleware recorded this update as failed, or when a redelivery was
    // skipped because a previous process left the update in "processing".
    // Re-delivery is safe because claimUpdate re-processes failed/stale updates
    // and handlers are idempotent (otherwise a transient failure would silently
    // drop e.g. a paid Telegram Stars grant).
    if (update?.update_id != null) {
      const tracked = await input.services.prisma.telegramUpdate.findUnique({
        where: { updateId: BigInt(update.update_id) }
      });
      if (tracked?.status === "failed" || tracked?.status === "processing") {
        reply.code(500);
        return { ok: false };
      }
    }
    return { ok: true };
  });

  app.post("/webhooks/yookassa", async (request, reply) => {
    const webhookIp = resolveRequestIp(request);
    if (
      env.YOOKASSA_WEBHOOK_ALLOWED_IPS &&
      !isLocalDevIp(webhookIp) &&
      !isAllowedWebhookIp(webhookIp, env.YOOKASSA_WEBHOOK_ALLOWED_IPS)
    ) {
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
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment</title></head><body><main style="font-family:system-ui,sans-serif;max-width:560px;margin:64px auto;padding:0 20px;line-height:1.5"><h1>Оплата</h1><p>Оплата обрабатывается. Вернитесь в Telegram: кредиты начислятся автоматически после подтверждения платежа.</p><p>Your payment is being processed. Return to Telegram: credits will be granted automatically after confirmation.</p></main></body></html>';
  });

  if (isLocalRuntimeEnv(env.APP_ENV)) {
    app.get("/mock/yookassa/pay/:id", async (request) => ({
      ok: true,
      id: (request.params as { id: string }).id,
      message: "Mock payment page. Send a payment.succeeded webhook or use tests to grant credits."
    }));
  }

  return app;
}

export function resolveRequestIp(request: Pick<FastifyRequest, "headers" | "ip" | "raw">): string {
  const directIp = normalizeIp(request.raw.socket.remoteAddress ?? request.ip);
  if (!shouldTrustForwardedHeaders(directIp)) return directIp;

  const forwardedIp =
    firstForwardedIp(request.headers["fly-client-ip"]) ??
    firstForwardedIp(request.headers["x-real-ip"]) ??
    firstForwardedIp(request.headers["x-forwarded-for"]);

  return forwardedIp ? normalizeIp(forwardedIp) : directIp;
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

function firstForwardedIp(header: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return undefined;
  const candidate = raw.split(",")[0]?.trim();
  return candidate && isIP(normalizeIp(candidate)) ? candidate : undefined;
}

function isLocalDevIp(ip: string): boolean {
  return isLocalRuntimeEnv(env.APP_ENV) && ["127.0.0.1", "::1"].includes(normalizeIp(ip));
}

function shouldTrustForwardedHeaders(ip: string): boolean {
  const normalized = normalizeIp(ip);
  return (
    isLoopbackIp(normalized) ||
    isPrivateIpv4(normalized) ||
    isUniqueLocalIpv6(normalized) ||
    isLinkLocalIpv6(normalized)
  );
}

function isLoopbackIp(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1";
}

function isPrivateIpv4(ip: string): boolean {
  if (isIP(ip) !== 4) return false;
  const octets = ip.split(".").map((part) => Number(part));
  const [a, b] = octets;
  return a === 10 || (a === 172 && b != null && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function isUniqueLocalIpv6(ip: string): boolean {
  if (isIP(ip) !== 6) return false;
  const first = Number.parseInt(ip.split(":")[0] ?? "0", 16);
  return (first & 0xfe00) === 0xfc00;
}

function isLinkLocalIpv6(ip: string): boolean {
  if (isIP(ip) !== 6) return false;
  const first = Number.parseInt(ip.split(":")[0] ?? "0", 16);
  return (first & 0xffc0) === 0xfe80;
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
