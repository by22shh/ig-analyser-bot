import { describe, expect, it, vi } from "vitest";
import { recordUsageSafe } from "../../src/modules/observability/usage.js";

function fakePrisma(create: () => Promise<unknown>) {
  return { apiUsageEvent: { create: vi.fn(create) } } as never;
}

describe("recordUsageSafe", () => {
  it("returns the created usage event on success", async () => {
    const created = { id: "evt-1" };
    const prisma = fakePrisma(() => Promise.resolve(created));

    const result = await recordUsageSafe(prisma, {
      provider: "openrouter",
      operation: "generate_report",
      status: "success"
    });

    expect(result).toBe(created);
  });

  it("swallows a logging failure instead of throwing, and reports it via onError", async () => {
    const error = new Error("db connection lost");
    const prisma = fakePrisma(() => Promise.reject(error));
    const onError = vi.fn();

    // The whole point: a usage-logging hiccup on a paid success path must NOT
    // propagate (it would fail the job and trigger a costly re-run).
    const result = await recordUsageSafe(
      prisma,
      { provider: "apify", operation: "fetch_profile", status: "success" },
      onError
    );

    expect(result).toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("does not throw even when no onError handler is supplied", async () => {
    const prisma = fakePrisma(() => Promise.reject(new Error("db down")));

    await expect(
      recordUsageSafe(prisma, { provider: "mock_llm", operation: "report_chat", status: "success" })
    ).resolves.toBeUndefined();
  });
});
