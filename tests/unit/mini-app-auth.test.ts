import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MiniAppAuthError, validateMiniAppInitData } from "../../src/mini-app/auth.js";

const token = "123456:test-token";

describe("validateMiniAppInitData", () => {
  it("accepts Telegram-signed init data", () => {
    const initData = sign({
      auth_date: "1893456000",
      query_id: "query-1",
      user: JSON.stringify({ id: 42, first_name: "Ada", username: "ada" })
    });

    const result = validateMiniAppInitData(initData, token, 0);

    expect(result.user?.id).toBe(42);
    expect(result.user?.first_name).toBe("Ada");
    expect(result.queryId).toBe("query-1");
  });

  it("rejects tampered data", () => {
    const initData = sign({
      auth_date: "1893456000",
      user: JSON.stringify({ id: 42, first_name: "Ada" })
    }).replace("Ada", "Eve");

    expect(() => validateMiniAppInitData(initData, token, 0)).toThrow(MiniAppAuthError);
  });

  it("rejects expired auth_date", () => {
    const initData = sign({
      auth_date: "100",
      user: JSON.stringify({ id: 42, first_name: "Ada" })
    });

    expect(() => validateMiniAppInitData(initData, token, 60, new Date(200_000))).toThrow(
      "AUTH_DATE_EXPIRED"
    );
  });
});

function sign(fields: Record<string, string>): string {
  const params = new URLSearchParams(fields);
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}
