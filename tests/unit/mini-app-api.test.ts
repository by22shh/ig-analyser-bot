import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";

const telegramBotToken = "123456:test-token";
const originalEnv = {
  APP_ENV: env.APP_ENV,
  FEATURE_MINI_APP: env.FEATURE_MINI_APP,
  FEATURE_REQUIRE_CHANNEL_SUB: env.FEATURE_REQUIRE_CHANNEL_SUB,
  REQUIRED_CHANNEL_ID: env.REQUIRED_CHANNEL_ID,
  TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN
};

afterEach(() => {
  Object.assign(env, originalEnv);
  vi.clearAllMocks();
});

describe("Mini App API", () => {
  it("serves bootstrap in local development mode", async () => {
    const services = makeServices();
    const bot = makeBot();
    const app = createApp({ services: services as never, bot: bot as never });

    const res = await app.inject({
      method: "GET",
      url: "/api/mini-app/bootstrap",
      headers: { "x-mini-app-dev-user": "900000001" }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().user.telegramId).toBe("900000001");
    expect(res.json().credits.available).toBe(1);
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

function signedInitData(user: { id: number }): string {
  const params = new URLSearchParams({
    auth_date: "1893456000",
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
