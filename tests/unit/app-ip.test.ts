import { describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
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

  it("ignores generic forwarded headers in production even behind an internal peer", () => {
    withAppEnv("production", () => {
      const ip = resolveRequestIp({
        ip: "10.0.0.5",
        headers: {
          "x-forwarded-for": "185.71.76.10, 10.0.0.5",
          "x-real-ip": "185.71.76.11"
        },
        raw: {
          socket: {
            remoteAddress: "10.0.0.5"
          }
        }
      } as never);

      expect(ip).toBe("10.0.0.5");
    });
  });

  it("accepts Fly's client IP header in production behind an internal peer", () => {
    withAppEnv("production", () => {
      const ip = resolveRequestIp({
        ip: "10.0.0.5",
        headers: {
          "fly-client-ip": "185.71.76.10",
          "x-forwarded-for": "203.0.113.99"
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
});

function withAppEnv(value: typeof env.APP_ENV, run: () => void): void {
  const previous = env.APP_ENV;
  env.APP_ENV = value;
  try {
    run();
  } finally {
    env.APP_ENV = previous;
  }
}
