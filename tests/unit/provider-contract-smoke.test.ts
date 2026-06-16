import { describe, expect, it, vi } from "vitest";
import {
  formatSmokeReport,
  parseSmokeArgs,
  redactSmokeText,
  runProviderContractSmoke
} from "../../scripts/smoke/provider-contract-smoke.js";

describe("provider contract smoke", () => {
  it("defaults to a safe dry-run over every provider step", async () => {
    const options = parseSmokeArgs(["--dry-run"]);
    const result = await runProviderContractSmoke(options, {});
    const output = formatSmokeReport(result, {});

    expect(result.mode).toBe("dry-run");
    expect(result.results).toHaveLength(7);
    expect(result.results.every((item) => item.status === "pass")).toBe(true);
    expect(output).toContain("Provider contract smoke (mode=dry-run");
    expect(output).toContain("PASS telegram");
    expect(output).toContain("PASS yookassa");
    expect(output).toContain("PASS openrouter");
    expect(output).toContain("PASS apify");
    expect(output).toContain("PASS facecheck");
    expect(output).toContain("PASS s3");
    expect(output).toContain("PASS pdf");
    expect(output).toContain("Summary: pass=7 fail=0 skip=0");
  });

  it("refuses live mode without staging opt-in", () => {
    expect(() => parseSmokeArgs(["--live"])).toThrow("Live smoke requires explicit --staging");
  });

  it("fails live steps before network calls when required env is absent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await runProviderContractSmoke(
      {
        mode: "live",
        staging: true,
        steps: ["telegram", "openrouter"]
      },
      {}
    );

    expect(result.results).toEqual([
      {
        step: "telegram",
        status: "fail",
        summary: "Telegram webhook config refused before live call",
        details: ["missing env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_URL, TELEGRAM_WEBHOOK_SECRET"]
      },
      {
        step: "openrouter",
        status: "fail",
        summary: "OpenRouter structured/fallback contract refused before live call",
        details: ["missing env: OPENROUTER_API_KEY"]
      }
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redacts configured secrets and secret-shaped values from output", () => {
    const env = {
      TELEGRAM_BOT_TOKEN: "123456:very-secret-telegram-token",
      OPENROUTER_API_KEY: "sk-live-secret"
    };

    const output = redactSmokeText(
      "token=123456:very-secret-telegram-token openrouter=sk-live-secret",
      env
    );

    expect(output).not.toContain("very-secret");
    expect(output).not.toContain("sk-live-secret");
    expect(output).toContain("[REDACTED_TELEGRAM_BOT_TOKEN]");
    expect(output).toContain("[REDACTED_OPENROUTER_API_KEY]");
  });

  it("supports per-provider step selection", async () => {
    const options = parseSmokeArgs(["--", "--dry-run", "--step", "openrouter,s3"]);
    const result = await runProviderContractSmoke(options, {});

    expect(result.results.map((item) => item.step)).toEqual(["openrouter", "s3"]);
    expect(formatSmokeReport(result, {})).toContain("steps=2");
  });
});
