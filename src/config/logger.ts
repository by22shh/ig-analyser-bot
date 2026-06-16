import pino from "pino";
import { env } from "./env.js";

const TELEGRAM_BOT_TOKEN_IN_URL = /bot\d+:[A-Za-z0-9_-]+/g;
const SECRET_FIELD_PATTERN = /(authorization|password|provider_token|secret|token)/i;

const configuredSecrets = [
  env.TELEGRAM_BOT_TOKEN,
  env.APIFY_TOKEN,
  env.OPENROUTER_API_KEY,
  env.FACECHECK_API_TOKEN,
  env.YOOKASSA_SECRET_KEY,
  env.S3_ACCESS_KEY_ID,
  env.S3_SECRET_ACCESS_KEY,
  env.SENTRY_DSN
].filter((value): value is string => value.length >= 8);

export function redactLogSecrets(value: string): string {
  let redacted = value.replace(TELEGRAM_BOT_TOKEN_IN_URL, "bot[redacted]");
  for (const secret of configuredSecrets) {
    redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}

function sanitizeLogValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactLogSecrets(value);
  if (typeof value !== "object" || value === null) return value;
  if (depth > 6) return "[truncated]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (value instanceof Error) {
    const errorRecord: Record<string, unknown> = {
      name: value.name,
      message: redactLogSecrets(value.message)
    };
    if (value.stack) errorRecord.stack = redactLogSecrets(value.stack);

    const extra = value as Error & Record<string, unknown>;
    for (const key of ["code", "errno", "type", "status", "statusCode", "error", "cause"]) {
      if (extra[key] !== undefined)
        errorRecord[key] = sanitizeLogValue(extra[key], depth + 1, seen);
    }
    return errorRecord;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, depth + 1, seen));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SECRET_FIELD_PATTERN.test(key) ? "[redacted]" : sanitizeLogValue(item, depth + 1, seen)
    ])
  );
}

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    app: "ig-analyser-telegram-bot",
    env: env.APP_ENV
  },
  serializers: {
    error: (value: unknown) => sanitizeLogValue(value)
  },
  redact: {
    paths: [
      "TELEGRAM_BOT_TOKEN",
      "APIFY_TOKEN",
      "OPENROUTER_API_KEY",
      "FACECHECK_API_TOKEN",
      "YOOKASSA_SECRET_KEY",
      "*.authorization",
      "*.Authorization",
      "*.provider_token",
      "*.token",
      "*.raw.base64"
    ],
    remove: true
  }
});

export const childLogger = (name: string, extra: Record<string, unknown> = {}) =>
  logger.child({ module: name, ...extra });
