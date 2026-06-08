import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const importEnvModule = "await import('./src/config/env.ts')";

const productionEnv = {
  APP_ENV: "production",
  APP_BASE_URL: "https://example.com",
  DATABASE_URL: "postgresql://ig_analyser:secret@db.example.com:5432/ig_analyser_bot",
  DIRECT_URL: "postgresql://ig_analyser:secret@db-direct.example.com:5432/ig_analyser_bot",
  JOB_QUEUE_DRIVER: "postgres",
  TELEGRAM_BOT_TOKEN: "123456:real-token-shaped-value",
  TELEGRAM_WEBHOOK_URL: "https://example.com/telegram/webhook",
  TELEGRAM_WEBHOOK_SECRET: "0123456789abcdef",
  TELEGRAM_STARS_TEST_MODE: "false",
  APIFY_TOKEN: "apify-real-token-shaped-value",
  OPENROUTER_API_KEY: "openrouter-real-token-shaped-value",
  S3_BUCKET: "ig-analyser-prod",
  S3_ACCESS_KEY_ID: "s3-real-key-shaped-value",
  S3_SECRET_ACCESS_KEY: "s3-real-secret-shaped-value",
  ECON_STANDARD_REPORT_COST_P75_RUB: "55",
  ECON_CHAT_MESSAGE_COST_P75_RUB: "2",
  ECON_APIFY_PROFILE_COST_RUB: "12",
  ECON_SUPPORT_RESERVE_RUB: "5",
  YOOKASSA_SHOP_ID: "123456",
  YOOKASSA_SECRET_KEY: "yookassa-real-secret-shaped-value",
  YOOKASSA_TEST_MODE: "false",
  YOOKASSA_WEBHOOK_ALLOWED_IPS: "185.71.76.0/27"
};

function importEnv(overrides: Record<string, string> = {}) {
  return spawnSync(process.execPath, ["--import", "tsx", "-e", importEnvModule], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...productionEnv,
      ...overrides
    },
    encoding: "utf8"
  });
}

describe("production env validation", () => {
  it("accepts a complete production-shaped configuration", () => {
    const result = importEnv();

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("rejects placeholder values for required production credentials", () => {
    const result = importEnv({ OPENROUTER_API_KEY: "TODO_OPENROUTER_API_KEY" });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "OPENROUTER_API_KEY must be replaced with a real value in production"
    );
  });
});
