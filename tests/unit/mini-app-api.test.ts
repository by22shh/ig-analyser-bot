import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { clearMembershipCache } from "../../src/telegram/middleware/subscription-gate.js";

const telegramBotToken = "123456:test-token";
const originalEnv = {
  APP_ENV: env.APP_ENV,
  BRAND_NAME: env.BRAND_NAME,
  FEATURE_MINI_APP: env.FEATURE_MINI_APP,
  FEATURE_TELEGRAM_STARS: env.FEATURE_TELEGRAM_STARS,
  FEATURE_YOOKASSA_PAYMENTS: env.FEATURE_YOOKASSA_PAYMENTS,
  FEATURE_OSINT_COMPLIANCE_MODE: env.FEATURE_OSINT_COMPLIANCE_MODE,
  FEATURE_REQUIRE_CHANNEL_SUB: env.FEATURE_REQUIRE_CHANNEL_SUB,
  REQUIRED_CHANNEL_ID: env.REQUIRED_CHANNEL_ID,
  TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
  RATE_LIMIT_MINI_APP_MAX: env.RATE_LIMIT_MINI_APP_MAX
};

afterEach(() => {
  Object.assign(env, originalEnv);
  clearMembershipCache();
  vi.clearAllMocks();
});

describe("Mini App API", () => {
  it("serves bootstrap in local development mode", async () => {
    env.BRAND_NAME = "AuditBot";
    const services = makeServices();
    const bot = makeBot();
    const app = createApp({ services: services as never, bot: bot as never });

    const res = await app.inject({
      method: "GET",
      url: "/api/mini-app/bootstrap",
      headers: { "x-mini-app-dev-user": "900000001" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().brandName).toBe("AuditBot");
    expect(res.json().user.telegramId).toBe("900000001");
    expect(res.json().credits.available).toBe(1);
    await app.close();
  });

  it("requires signed init data in staging instead of dev headers", async () => {
    env.APP_ENV = "staging";
    env.TELEGRAM_BOT_TOKEN = telegramBotToken;
    const services = makeServices();
    const app = createApp({ services: services as never, bot: makeBot() as never });

    const res = await app.inject({
      method: "GET",
      url: "/api/mini-app/bootstrap",
      headers: { "x-mini-app-dev-user": "900000001" }
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INIT_DATA_MISSING");
    expect(services.users.upsertTelegramUser).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns a distinct code when Telegram init data is expired", async () => {
    env.APP_ENV = "production";
    env.TELEGRAM_BOT_TOKEN = telegramBotToken;
    const services = makeServices();
    const app = createApp({ services: services as never, bot: makeBot() as never });

    const res = await app.inject({
      method: "GET",
      url: "/api/mini-app/bootstrap",
      headers: { authorization: `tma ${signedInitData({ id: 900000001, authDate: "1000" })}` }
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("AUTH_DATE_EXPIRED");
    expect(services.users.upsertTelegramUser).not.toHaveBeenCalled();
    await app.close();
  });

  it("does not register local mock payment routes in staging", async () => {
    env.APP_ENV = "staging";
    const app = createApp({ services: makeServices() as never, bot: makeBot() as never });

    const res = await app.inject({
      method: "GET",
      url: "/mock/yookassa/pay/test-payment"
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("does not register Mini App routes when the feature flag is disabled", async () => {
    env.FEATURE_MINI_APP = false;
    const app = createApp({ services: makeServices() as never, bot: makeBot() as never });

    const apiRes = await app.inject({
      method: "GET",
      url: "/api/mini-app/bootstrap",
      headers: { "x-mini-app-dev-user": "900000001" }
    });
    const pageRes = await app.inject({ method: "GET", url: "/mini-app" });

    expect(apiRes.statusCode).toBe(404);
    expect(pageRes.statusCode).toBe(404);
    await app.close();
  });

  it("serves Mini App HTML with a strict CSP", async () => {
    const app = createApp({ services: makeServices() as never, bot: makeBot() as never });

    const res = await app.inject({ method: "GET", url: "/mini-app" });

    expect(res.statusCode).toBe(200);
    const csp = res.headers["content-security-policy"];
    expect(csp).toContain("style-src 'self'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).not.toContain("img-src 'self' data: https:");
    await app.close();
  });

  it("rate limits Mini App API requests by Telegram user", async () => {
    env.RATE_LIMIT_MINI_APP_MAX = 1;
    const app = createApp({ services: makeServices() as never, bot: makeBot() as never });

    const first = await app.inject({
      method: "GET",
      url: "/api/mini-app/bootstrap",
      headers: { "x-mini-app-dev-user": "900000001" }
    });
    const second = await app.inject({
      method: "GET",
      url: "/api/mini-app/bootstrap",
      headers: { "x-mini-app-dev-user": "900000001" }
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.json().code).toBe("RATE_LIMITED");
    await app.close();
  });

  it("returns only gate data from bootstrap before consent is accepted", async () => {
    const services = makeServices(makeUser({ consentAcceptedAt: null }));
    const app = createApp({ services: services as never, bot: makeBot() as never });

    const res = await app.inject({
      method: "GET",
      url: "/api/mini-app/bootstrap",
      headers: { "x-mini-app-dev-user": "900000001" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      credits: null,
      stats: null,
      reports: [],
      jobs: []
    });
    expect(services.reports.latestReports).not.toHaveBeenCalled();
    expect(services.payments.ensureCatalog).not.toHaveBeenCalled();
    await app.close();
  });

  it("blocks direct analysis requests when channel subscription is required and missing", async () => {
    env.FEATURE_REQUIRE_CHANNEL_SUB = true;
    env.REQUIRED_CHANNEL_ID = "@required";
    const services = makeServices();
    const bot = makeBot({ status: "left" });
    const app = createApp({ services: services as never, bot: bot as never });

    const res = await app.inject({
      method: "POST",
      url: "/api/mini-app/analysis",
      headers: {
        "content-type": "application/json",
        "x-mini-app-dev-user": "900000001"
      },
      payload: JSON.stringify({ username: "alice", mode: "standard", requestId: "r1" })
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("SUBSCRIPTION_REQUIRED");
    expect(services.analysis.startAnalysis).not.toHaveBeenCalled();
    await app.close();
  });

  it("blocks production analysis requests when the subscription check fails", async () => {
    env.APP_ENV = "production";
    env.TELEGRAM_BOT_TOKEN = telegramBotToken;
    env.FEATURE_REQUIRE_CHANNEL_SUB = true;
    env.REQUIRED_CHANNEL_ID = "@required";
    const services = makeServices();
    const bot = makeBot(new Error("CHAT_ADMIN_REQUIRED"));
    const app = createApp({ services: services as never, bot: bot as never });

    const res = await app.inject({
      method: "POST",
      url: "/api/mini-app/analysis",
      headers: {
        authorization: `tma ${signedInitData({ id: 900000001 })}`,
        "content-type": "application/json"
      },
      payload: JSON.stringify({ username: "alice", mode: "standard", requestId: "r1" })
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("SUBSCRIPTION_REQUIRED");
    expect(bot.api.getChatMember).toHaveBeenCalledWith("@required", 900000001);
    expect(services.analysis.startAnalysis).not.toHaveBeenCalled();
    await app.close();
  });

  it("passes optional analysis goal to the analysis service", async () => {
    const services = makeServices();
    const app = createApp({ services: services as never, bot: makeBot() as never });

    const res = await app.inject({
      method: "POST",
      url: "/api/mini-app/analysis",
      headers: {
        "content-type": "application/json",
        "x-mini-app-dev-user": "900000001"
      },
      payload: JSON.stringify({
        username: "alice",
        mode: "standard",
        goal: "  проверить партнерство\nи риски  ",
        requestId: "r1"
      })
    });

    expect(res.statusCode).toBe(200);
    expect(services.analysis.startAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "alice",
        mode: "standard",
        goal: "проверить партнерство и риски"
      })
    );
    await app.close();
  });

  it("uses the Mini App chat context when one is available", async () => {
    const services = makeServices();
    const app = createApp({ services: services as never, bot: makeBot() as never });

    const res = await app.inject({
      method: "POST",
      url: "/api/mini-app/analysis",
      headers: {
        "content-type": "application/json",
        "x-mini-app-dev-user": "900000001",
        "x-mini-app-dev-chat": "-1001234567890"
      },
      payload: JSON.stringify({ username: "alice", mode: "standard", requestId: "r2" })
    });

    expect(res.statusCode).toBe(200);
    expect(services.analysis.startAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: -1001234567890 })
    );
    await app.close();
  });

  it("passes OSINT lawful-basis metadata to the analysis service", async () => {
    env.FEATURE_OSINT_COMPLIANCE_MODE = true;
    const services = makeServices(makeUser({ role: "compliance" }));
    const app = createApp({ services: services as never, bot: makeBot() as never });

    const res = await app.inject({
      method: "POST",
      url: "/api/mini-app/analysis",
      headers: {
        "content-type": "application/json",
        "x-mini-app-dev-user": "900000001"
      },
      payload: JSON.stringify({
        username: "alice",
        mode: "osint_compliance",
        requestId: "osint-request-1",
        lawfulBasisAccepted: true
      })
    });

    expect(res.statusCode).toBe(200);
    expect(services.analysis.startAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "osint_compliance",
        source: "mini_app",
        requestId: "osint-request-1",
        lawfulBasisAccepted: true,
        idempotencyKey: "miniapp:analysis:user-id:osint-request-1"
      })
    );
    await app.close();
  });

  it("strips raw section markers from Mini App report details", async () => {
    const services = makeServices();
    services.reports.getReportWithSections.mockResolvedValue({
      id: "report-1",
      mode: "standard",
      language: "ru",
      summary: { bullets: ["[[SECTION]] Bullet"] },
      metrics: {},
      artifacts: [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      expiresAt: null,
      model: "model",
      promptVersion: "prompt",
      rawText: "[[SECTION]]\nОсновные темы\nConfidence: medium.",
      analysisJob: { targetUsername: "alice" },
      sections: [
        {
          id: "section-1",
          position: 1,
          title: "[[SECTION]] Основные темы",
          content: "[[SECTION]] Confidence: medium.",
          kind: null,
          sources: []
        }
      ]
    } as never);
    const app = createApp({ services: services as never, bot: makeBot() as never });

    const res = await app.inject({
      method: "GET",
      url: "/api/mini-app/reports/report-1",
      headers: { "x-mini-app-dev-user": "900000001" }
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.json())).not.toContain("[[SECTION]]");
    expect(res.json().report.rawText).toContain("Основные темы");
    expect(res.json().report.sections[0].title).toBe("Основные темы");
    expect(res.json().report.summary.bullets).toEqual(["Bullet"]);
    await app.close();
  });

  it("treats a restricted chat member as subscribed only when is_member is true", async () => {
    env.FEATURE_REQUIRE_CHANNEL_SUB = true;
    env.REQUIRED_CHANNEL_ID = "@required";
    const services = makeServices();
    const bot = makeBot({ status: "restricted", is_member: true });
    const app = createApp({ services: services as never, bot: bot as never });

    const res = await app.inject({
      method: "GET",
      url: "/api/mini-app/jobs",
      headers: { "x-mini-app-dev-user": "900000001" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().jobs).toEqual([]);
    expect(bot.api.getChatMember).toHaveBeenCalledWith("@required", 900000001);
    await app.close();
  });

  it("caches channel membership across Mini App polling requests", async () => {
    env.FEATURE_REQUIRE_CHANNEL_SUB = true;
    env.REQUIRED_CHANNEL_ID = "@required";
    const services = makeServices();
    const bot = makeBot({ status: "member" });
    const app = createApp({ services: services as never, bot: bot as never });

    const first = await app.inject({
      method: "GET",
      url: "/api/mini-app/jobs",
      headers: { "x-mini-app-dev-user": "900000001" }
    });
    const second = await app.inject({
      method: "GET",
      url: "/api/mini-app/jobs",
      headers: { "x-mini-app-dev-user": "900000001" }
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(bot.api.getChatMember).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("uses the Mini App payment request id as the order idempotency key", async () => {
    env.FEATURE_YOOKASSA_PAYMENTS = true;
    const services = makeServices();
    services.payments.createYooKassaOrder.mockResolvedValue({
      orderId: "order-id",
      confirmationUrl: "https://pay.example/order",
      amountMinor: 69000,
      creditsUnits: 300,
      reused: false
    });
    const app = createApp({ services: services as never, bot: makeBot() as never });

    const res = await app.inject({
      method: "POST",
      url: "/api/mini-app/payments/yookassa",
      headers: {
        "content-type": "application/json",
        "x-mini-app-dev-user": "900000001"
      },
      payload: JSON.stringify({
        packageCode: "pro",
        email: "buyer@example.com",
        requestId: "request-1"
      })
    });

    expect(res.statusCode).toBe(200);
    expect(services.payments.createYooKassaOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        packageCode: "pro",
        idempotencyKey: "miniapp:yk:user-id:pro:request-1"
      })
    );
    await app.close();
  });

  it("hides Mini App Stars packages and rejects invoice creation without a bot token", async () => {
    env.FEATURE_TELEGRAM_STARS = true;
    env.TELEGRAM_BOT_TOKEN = "";
    const services = makeServices();
    services.payments.packages.mockReturnValue([
      {
        code: "start",
        title: "Start",
        creditsUnits: 300,
        isPublic: true,
        starsAmount: 690
      }
    ] as never);
    const app = createApp({ services: services as never, bot: makeBot() as never });

    const bootstrap = await app.inject({
      method: "GET",
      url: "/api/mini-app/bootstrap",
      headers: { "x-mini-app-dev-user": "900000001" }
    });
    const invoice = await app.inject({
      method: "POST",
      url: "/api/mini-app/payments/stars",
      headers: {
        "content-type": "application/json",
        "x-mini-app-dev-user": "900000001"
      },
      payload: JSON.stringify({ packageCode: "start" })
    });

    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json().features.telegramStars).toBe(false);
    expect(bootstrap.json().packages.stars).toEqual([]);
    expect(invoice.statusCode).toBe(403);
    expect(invoice.json().error.code).toBe("PAYMENT_METHOD_UNAVAILABLE");
    expect(invoice.json().error.paymentFailure).toMatchObject({
      category: "configuration",
      retryable: false,
      userAction: "choose_other_method"
    });
    expect(services.payments.createTelegramStarsInvoiceLink).not.toHaveBeenCalled();
    await app.close();
  });
});

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-id",
    telegramId: 900000001n,
    telegramUsername: "local_mini_app",
    firstName: "Local",
    lastName: "Tester",
    language: "ru",
    role: "user",
    status: "active",
    timezone: null,
    consentVersion: "v",
    consentAcceptedAt: new Date("2026-01-01T00:00:00.000Z"),
    email: null,
    referralCode: null,
    referredByUserId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides
  };
}

function makeServices(user = makeUser()) {
  return {
    users: {
      upsertTelegramUser: vi.fn(async () => ({ user, isNew: false })),
      profileStats: vi.fn(async () => ({
        settings: { defaultExportFormat: "pdf", reportRetentionDays: 30 },
        account: null,
        completedReports: 0,
        activeJobs: 0
      })),
      acceptConsent: vi.fn(async () => user),
      updateLanguage: vi.fn(async () => user),
      updateExportFormat: vi.fn(async () => undefined),
      updateReportRetention: vi.fn(async () => undefined),
      updateEmail: vi.fn(async () => user),
      isAdmin: vi.fn(() => false)
    },
    credits: {
      grant: vi.fn(async () => undefined),
      snapshot: vi.fn(async () => ({
        balanceUnits: 100,
        reservedUnits: 0,
        availableUnits: 100,
        purchasedUnits: 0,
        grantedUnits: 100
      }))
    },
    reports: {
      latestReports: vi.fn(async () => []),
      getReportWithSections: vi.fn(async () => null)
    },
    payments: {
      ensureCatalog: vi.fn(async () => undefined),
      packages: vi.fn(() => []),
      createTelegramStarsInvoiceLink: vi.fn(),
      createYooKassaOrder: vi.fn(),
      handleYooKassaWebhook: vi.fn()
    },
    storage: { signedUrl: vi.fn() },
    analysis: { startAnalysis: vi.fn() },
    chat: { ask: vi.fn() },
    prisma: {
      telegramUpdate: { findUnique: vi.fn() },
      analysisJob: { findMany: vi.fn(async () => []) }
    }
  };
}

function makeBot(member: Record<string, unknown> | Error = { status: "member" }) {
  const getChatMember =
    member instanceof Error
      ? vi.fn(async () => {
          throw member;
        })
      : vi.fn(async () => member);
  return {
    handleUpdate: vi.fn(),
    api: { getChatMember }
  };
}

function signedInitData(user: { id: number; authDate?: string }): string {
  const params = new URLSearchParams({
    auth_date: user.authDate ?? "1893456000",
    user: JSON.stringify({
      id: user.id,
      first_name: "Local",
      username: "local_mini_app",
      language_code: "ru"
    })
  });
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(telegramBotToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}
