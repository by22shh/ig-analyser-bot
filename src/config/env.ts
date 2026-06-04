import "dotenv/config";
import { z } from "zod";

const boolFromString = z.union([z.boolean(), z.string(), z.undefined()]).transform((value) => {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === "") return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
});

const optionalNumber = (fallback?: number) =>
  z.union([z.string(), z.number(), z.undefined()]).transform((value) => {
    if (value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
  });

const optionalString = z.string().optional().default("");
const optionalUrl = z
  .union([z.literal(""), z.string().url()])
  .optional()
  .default("");

const schema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  PORT: optionalNumber(3000),

  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_WEBHOOK_URL: optionalString,
  TELEGRAM_WEBHOOK_SECRET: optionalString,
  TELEGRAM_ADMIN_IDS: optionalString,
  TELEGRAM_USE_LONG_POLLING: boolFromString.default(false),
  TELEGRAM_API_ROOT: z.string().url().default("https://api.telegram.org"),
  CHANNEL_URL: z.string().url().default("https://t.me/homie_tech"),
  SUPPORT_URL: z.string().url().default("https://t.me/homie_tech"),
  TOS_URL: z.string().url().default("https://teletype.in/@homiebot/policy"),
  PRIVACY_URL: z.string().url().default("https://telegram.org/privacy-tpa"),

  DATABASE_URL: z
    .string()
    .default("postgresql://ig_analyser:ig_analyser@localhost:5432/ig_analyser_bot"),
  DIRECT_URL: z
    .string()
    .default("postgresql://ig_analyser:ig_analyser@localhost:5432/ig_analyser_bot"),
  REDIS_URL: z.string().default("redis://localhost:6379/0"),

  APIFY_TOKEN: optionalString,
  OPENROUTER_API_KEY: optionalString,
  FACECHECK_API_TOKEN: optionalString,
  FACECHECK_TESTING_MODE: boolFromString.default(false),

  YOOKASSA_SHOP_ID: optionalString,
  YOOKASSA_SECRET_KEY: optionalString,
  YOOKASSA_API_BASE_URL: z.string().url().default("https://api.yookassa.ru/v3"),
  YOOKASSA_TEST_MODE: boolFromString.default(true),
  YOOKASSA_RETURN_URL: optionalUrl,
  YOOKASSA_WEBHOOK_ALLOWED_IPS: optionalString,
  YOOKASSA_CAPTURE: boolFromString.default(true),
  YOOKASSA_USE_RECEIPTS: boolFromString.default(true),
  YOOKASSA_DEFAULT_VAT_CODE: optionalNumber(1),
  YOOKASSA_DEFAULT_TAX_SYSTEM_CODE: optionalString,
  YOOKASSA_PAYMENT_COMMISSION_RATE: optionalNumber(0.028),
  YOOKASSA_RECEIPT_COMMISSION_RATE: optionalNumber(0.01),
  YOOKASSA_COMMISSION_VAT_RATE: optionalNumber(0.2),

  TELEGRAM_STARS_TEST_MODE: boolFromString.default(true),
  TELEGRAM_STARS_DEFAULT_CURRENCY: z.literal("XTR").default("XTR"),
  TELEGRAM_STARS_REFUNDS_ENABLED: boolFromString.default(true),

  ECON_USD_TO_RUB_BUFFER: optionalNumber(90),
  ECON_PAYMENT_FEE_RESERVE: optionalNumber(0.2),
  ECON_STARS_USD_PER_STAR_PAYOUT_FLOOR: optionalNumber(0.01),
  ECON_STARS_PAYOUT_RESERVE: optionalNumber(0.2),
  ECON_TARGET_REVENUE_MULTIPLE: optionalNumber(3),
  ECON_COST_BASIS: z.enum(["p75", "worst_case"]).default("p75"),
  ECON_STANDARD_REPORT_COST_P75_RUB: optionalNumber(),
  ECON_PHOTO_SEARCH_COST_P75_RUB: optionalNumber(),
  ECON_CHAT_MESSAGE_COST_P75_RUB: optionalNumber(),
  ECON_APIFY_PROFILE_COST_RUB: optionalNumber(),
  ECON_FACECHECK_SEARCH_COST_RUB: optionalNumber(),
  ECON_SUPPORT_RESERVE_RUB: optionalNumber(),

  S3_ENDPOINT: optionalString,
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_PUBLIC_BASE_URL: optionalString,

  DEFAULT_LANGUAGE: z.enum(["ru", "en"]).default("ru"),
  ADMIN_DEFAULT_CREDITS: optionalNumber(100),
  REPORT_RETENTION_DAYS: optionalNumber(30),
  PHOTO_UPLOAD_MAX_MB: optionalNumber(10),
  ANALYSIS_POST_LIMIT: optionalNumber(30),
  VISION_BATCH_SIZE: optionalNumber(5),
  ANALYSIS_MAX_IMAGES_ANALYZED: optionalNumber(30),
  ANALYSIS_MAX_IMAGE_DOWNLOAD_MB: optionalNumber(8),
  LLM_FINAL_INPUT_TOKEN_BUDGET: optionalNumber(24000),
  LLM_FINAL_OUTPUT_TOKEN_BUDGET: optionalNumber(4096),
  LLM_CHAT_INPUT_TOKEN_BUDGET: optionalNumber(12000),
  LLM_CHAT_OUTPUT_TOKEN_BUDGET: optionalNumber(2048),
  FACECHECK_TIMEOUT_SECONDS: optionalNumber(90),
  FACECHECK_MAX_COST_RUB: optionalNumber(),
  PDF_RENDER_TIMEOUT_SECONDS: optionalNumber(60),
  FEATURE_HR_MODE: boolFromString.default(false),
  FEATURE_INFLUENCER_MODE: boolFromString.default(true),
  FEATURE_OSINT_COMPLIANCE_MODE: boolFromString.default(false),
  FEATURE_PHOTO_SEARCH: boolFromString.default(false),
  FEATURE_TELEGRAM_STARS: boolFromString.default(true),
  FEATURE_YOOKASSA_PAYMENTS: boolFromString.default(true),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SENTRY_DSN: optionalString,
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalString,

  MODEL_VISION: z.string().default("google/gemini-2.5-flash"),
  MODEL_REASONING: z.string().default("google/gemini-2.5-pro"),
  MODEL_CHAT: z.string().default("google/gemini-2.5-flash")
});

type ParsedEnv = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

assertProductionConfiguration(parsed.data);

const publicBaseUrl = parsed.data.APP_BASE_URL.replace(/\/+$/, "");

export const env = {
  ...parsed.data,
  YOOKASSA_RETURN_URL:
    parsed.data.YOOKASSA_RETURN_URL || `${publicBaseUrl}/payments/yookassa/return`
};

export type AppEnv = typeof env;

export const adminTelegramIds = env.TELEGRAM_ADMIN_IDS.split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => Number(value))
  .filter((value) => Number.isSafeInteger(value));

export const providerMode = {
  apify: env.APIFY_TOKEN ? "real" : "mock",
  openrouter: env.OPENROUTER_API_KEY ? "real" : "mock",
  facecheck: env.FACECHECK_API_TOKEN && !env.FACECHECK_TESTING_MODE ? "real" : "mock",
  yookassa: env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY ? "real" : "mock",
  storage: env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY ? "s3" : "local"
} as const;

function assertProductionConfiguration(data: ParsedEnv) {
  if (data.APP_ENV !== "production") return;

  const errors: string[] = [];
  const requireString = (
    key: keyof ParsedEnv,
    message = `${String(key)} is required in production`
  ) => {
    if (typeof data[key] !== "string" || !(data[key] as string).trim()) errors.push(message);
  };
  const requireNumber = (
    key: keyof ParsedEnv,
    message = `${String(key)} is required in production`
  ) => {
    if (
      typeof data[key] !== "number" ||
      !Number.isFinite(data[key] as number) ||
      (data[key] as number) <= 0
    )
      errors.push(message);
  };
  const requireUrl = (key: keyof ParsedEnv) => {
    requireString(key);
    const value = data[key];
    if (typeof value === "string" && value.trim()) {
      try {
        new URL(value);
      } catch {
        errors.push(`${String(key)} must be a valid URL in production`);
      }
    }
  };
  const requireConnectionUrl = (key: keyof ParsedEnv) => {
    requireString(key);
    const value = data[key];
    if (typeof value !== "string" || !value.trim()) return;
    try {
      const url = new URL(value);
      if (isLocalhost(url.hostname)) {
        errors.push(`${String(key)} must not point to localhost in production`);
      }
    } catch {
      errors.push(`${String(key)} must be a valid connection URL in production`);
    }
  };
  const forbidLocalhostUrl = (key: keyof ParsedEnv) => {
    const value = data[key];
    if (typeof value !== "string" || !value.trim()) return;
    try {
      const url = new URL(value);
      if (isLocalhost(url.hostname)) {
        errors.push(`${String(key)} must not point to localhost in production`);
      }
    } catch {
      // requireUrl/requireConnectionUrl reports the invalid URL.
    }
  };

  requireUrl("APP_BASE_URL");
  forbidLocalhostUrl("APP_BASE_URL");
  requireConnectionUrl("DATABASE_URL");
  requireConnectionUrl("DIRECT_URL");
  requireConnectionUrl("REDIS_URL");

  requireString("TELEGRAM_BOT_TOKEN");
  requireUrl("TELEGRAM_WEBHOOK_URL");
  requireString("TELEGRAM_WEBHOOK_SECRET");
  if (data.TELEGRAM_WEBHOOK_SECRET && data.TELEGRAM_WEBHOOK_SECRET.length < 16) {
    errors.push("TELEGRAM_WEBHOOK_SECRET must be at least 16 characters in production");
  }
  if (data.TELEGRAM_USE_LONG_POLLING) {
    errors.push("TELEGRAM_USE_LONG_POLLING must be false in production webhook mode");
  }

  requireString("APIFY_TOKEN");
  requireString("OPENROUTER_API_KEY");
  requireString("S3_BUCKET");
  requireString("S3_ACCESS_KEY_ID");
  requireString("S3_SECRET_ACCESS_KEY");

  requireNumber("ECON_STANDARD_REPORT_COST_P75_RUB");
  requireNumber("ECON_CHAT_MESSAGE_COST_P75_RUB");
  requireNumber("ECON_APIFY_PROFILE_COST_RUB");
  requireNumber("ECON_SUPPORT_RESERVE_RUB");

  if (data.FEATURE_YOOKASSA_PAYMENTS) {
    requireString("YOOKASSA_SHOP_ID");
    requireString("YOOKASSA_SECRET_KEY");
    requireString("YOOKASSA_WEBHOOK_ALLOWED_IPS");
  }

  if (data.FEATURE_PHOTO_SEARCH) {
    requireString("FACECHECK_API_TOKEN");
    requireNumber("ECON_PHOTO_SEARCH_COST_P75_RUB");
    requireNumber("ECON_FACECHECK_SEARCH_COST_RUB");
    requireNumber("FACECHECK_MAX_COST_RUB");
    // The declared cost cap must actually bound the budgeted per-search cost,
    // otherwise FACECHECK_MAX_COST_RUB is required but constrains nothing.
    if (
      typeof data.ECON_FACECHECK_SEARCH_COST_RUB === "number" &&
      typeof data.FACECHECK_MAX_COST_RUB === "number" &&
      data.ECON_FACECHECK_SEARCH_COST_RUB > data.FACECHECK_MAX_COST_RUB
    ) {
      errors.push("ECON_FACECHECK_SEARCH_COST_RUB must not exceed FACECHECK_MAX_COST_RUB");
    }
    if (data.FACECHECK_TESTING_MODE) {
      errors.push(
        "FACECHECK_TESTING_MODE must be false when photo search is enabled in production"
      );
    }
  }

  if (errors.length) {
    console.error({ productionConfigErrors: errors });
    throw new Error("Unsafe production environment configuration");
  }
}

function isLocalhost(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname.toLowerCase());
}
