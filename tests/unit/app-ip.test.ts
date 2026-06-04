import { describe, expect, it } from "vitest";
import { resolveRequestIp } from "../../src/app.js";

describe("resolveRequestIp", () => {
  it("ignores spoofed forwarded headers from a direct public client", () => {
    const ip = resolveRequestIp({
      ip: "203.0.113.9",
      headers: {
        "x-forwarded-for": "185.71.76.10"
      },
      raw: {
        socket: {
          remoteAddress: "203.0.113.9"
        }
      }
    } as never);

    expect(ip).toBe("203.0.113.9");
  });

  it("accepts forwarded headers when the immediate peer is a trusted internal proxy", () => {
    const ip = resolveRequestIp({
      ip: "10.0.0.5",
      headers: {
        "x-forwarded-for": "185.71.76.10, 10.0.0.5"
      },
      raw: {
        socket: {
          remoteAddress: "10.0.0.5"
        }
      }
    } as never);

    expect(ip).toBe("185.71.76.10");
  });
});
