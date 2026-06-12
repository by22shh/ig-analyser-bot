import { describe, expect, it } from "vitest";
import { yookassaIdempotenceKey } from "../../src/modules/payments/adapters/yookassa.adapter.js";

describe("yookassaIdempotenceKey", () => {
  it("keeps short keys and hashes keys longer than YooKassa allows", () => {
    const shortKey = "yk:user:pro:update:123";
    const longKey = `miniapp:yk:${"u".repeat(36)}:pro:${"r".repeat(80)}`;

    expect(yookassaIdempotenceKey(shortKey)).toBe(shortKey);

    const normalized = yookassaIdempotenceKey(longKey);
    expect(normalized).toMatch(/^yk:[0-9a-f]+$/);
    expect(normalized.length).toBeLessThanOrEqual(64);
    expect(yookassaIdempotenceKey(longKey)).toBe(normalized);
  });
});
