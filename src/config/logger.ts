import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    app: "ig-analyser-telegram-bot",
    env: env.APP_ENV
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
