import type { Prisma, User } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Bot } from "grammy";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { env, isLocalRuntimeEnv } from "../config/env.js";
import { InsufficientCreditsError } from "../modules/billing/credits.service.js";
import { ChatRequestInProgressError } from "../modules/chat/report-chat.service.js";
import {
  CREDIT_UNIT,
  MODE_COST_UNITS,
  creditsFromUnits,
  packageCredits
} from "../modules/billing/packages.js";
import { normalizeInstagramUsername } from "../modules/instagram/normalize.js";
import type { Services } from "../modules/container.js";
import type { MyContext } from "../telegram/context.js";
import { ANALYSIS_MODES, type AnalysisMode } from "../telegram/constants.js";
import { telegramUserIsSubscribed } from "../telegram/middleware/subscription-gate.js";
import { MiniAppAuthError, validateMiniAppInitData } from "./auth.js";

type MiniAppSession = {
  user: User;
  telegramUserId: number;
  chatId: number;
};

type MiniAppInput = {
  services: Services;
  bot: Bot<MyContext>;
};

const activeJobStatuses = [
  "queued",
  "fetching_profile",
  "analyzing_images",
  "generating_exports",
  "retrying"
];

const staticRoot = resolve(process.cwd(), "public", "mini-app");

export function registerMiniAppRoutes(app: FastifyInstance, input: MiniAppInput) {
  if (!env.FEATURE_MINI_APP) return;

  app.get("/mini-app", async (_request, reply) => serveMiniAppFile("index.html", reply));
  app.get("/mini-app/*", async (request, reply) => {
    const params = request.params as { "*": string };
    return serveMiniAppFile(params["*"] || "index.html", reply);
  });

  app.get("/api/mini-app/bootstrap", async (request, reply) => {
    const session = await authenticateMiniApp(request, reply, input.services);
    if (!session) return;
    return miniAppBootstrap(session, input.services, input.bot);
  });

  app.post("/api/mini-app/consent", async (request, reply) => {
    const session = await authenticateMiniApp(request, reply, input.services);
    if (!session) return;
    const body = bodyObject(request);
    const language = body.language === "en" ? "en" : "ru";
    const user = await input.services.users.acceptConsent(session.user.id, language);
    return { ok: true, user: userDto(user) };
  });

  app.patch("/api/mini-app/settings", async (request, reply) => {
    const session = await authenticateMiniApp(request, reply, input.services, {
      requireConsent: true
    });
    if (!session) return;
    if (!(await ensureMiniAppSubscription(session, input.services, input.bot, reply))) return;
    const body = bodyObject(request);
    let user = session.user;
    if (body.language === "ru" || body.language === "en") {
      user = await input.services.users.updateLanguage(user.id, body.language);
    }
    if (
      body.exportFormat === "pdf" ||
      body.exportFormat === "markdown" ||
      body.exportFormat === "html"
    ) {
      await input.services.users.updateExportFormat(user.id, body.exportFormat);
    }
    if (typeof body.retentionDays === "number") {
      await input.services.users.updateReportRetention(user.id, body.retentionDays);
    }
    return miniAppBootstrap({ ...session, user }, input.services, input.bot);
  });

  app.get("/api/mini-app/jobs", async (request, reply) => {
    const session = await authenticateMiniApp(request, reply, input.services, {
      requireConsent: true
    });
    if (!session) return;
    if (!(await ensureMiniAppSubscription(session, input.services, input.bot, reply))) return;
    return {
      jobs: await latestJobs(input.services, session.user.id),
      credits: await creditsDto(input.services, session.user.id)
    };
  });

  app.post("/api/mini-app/analysis", async (request, reply) => {
    const session = await authenticateMiniApp(request, reply, input.services, {
      requireConsent: true
    });
    if (!session) return;
    if (!(await ensureMiniAppSubscription(session, input.services, input.bot, reply))) return;
    const body = bodyObject(request);
    const mode = typeof body.mode === "string" && isAnalysisMode(body.mode) ? body.mode : undefined;
    if (!mode) return apiError(reply, 400, "MODE_INVALID");
    if (!modeAvailable(mode, session.user)) return apiError(reply, 403, "MODE_UNAVAILABLE");
    if (mode === "osint_compliance" && body.lawfulBasisAccepted !== true) {
      return apiError(reply, 403, "LAWFUL_BASIS_REQUIRED");
    }

    let username: string;
    try {
      username = normalizeInstagramUsername(String(body.username ?? ""));
    } catch {
      return apiError(reply, 400, "USERNAME_INVALID");
    }

    const targetPosition =
      mode === "hr" && typeof body.targetPosition === "string"
        ? body.targetPosition.trim().slice(0, 120)
        : undefined;
    const goal =
      typeof body.goal === "string" && body.goal.trim()
        ? body.goal.trim().replace(/\s+/g, " ").slice(0, 500)
        : undefined;
    const requestId =
      typeof body.requestId === "string" && body.requestId.length <= 80
        ? body.requestId
        : randomUUID();

    try {
      const result = await input.services.analysis.startAnalysis({
        userId: session.user.id,
        chatId: session.chatId,
        inputType: "username",
        username,
        mode,
        language: session.user.language === "en" ? "en" : "ru",
        targetPosition,
        goal,
        idempotencyKey: `miniapp:analysis:${session.user.id}:${requestId}`
      });
      return {
        ok: true,
        result,
        jobs: await latestJobs(input.services, session.user.id),
        credits: await creditsDto(input.services, session.user.id)
      };
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return apiError(reply, 402, "INSUFFICIENT_CREDITS", {
          costUnits: error.costUnits,
          availableUnits: error.availableUnits
        });
      }
      throw error;
    }
  });

  app.get("/api/mini-app/reports", async (request, reply) => {
    const session = await authenticateMiniApp(request, reply, input.services, {
      requireConsent: true
    });
    if (!session) return;
    if (!(await ensureMiniAppSubscription(session, input.services, input.bot, reply))) return;
    const take = Math.min(Math.max(Number((request.query as { take?: string }).take ?? 12), 1), 30);
    const reports = await input.services.reports.latestReports(session.user.id, take);
    return { reports: reports.map(reportListItemDto) };
  });

  app.get("/api/mini-app/reports/:id", async (request, reply) => {
    const session = await authenticateMiniApp(request, reply, input.services, {
      requireConsent: true
    });
    if (!session) return;
    if (!(await ensureMiniAppSubscription(session, input.services, input.bot, reply))) return;
    const params = request.params as { id: string };
    const report = await input.services.reports.getReportWithSections(params.id, session.user.id);
    if (!report) return apiError(reply, 404, "REPORT_NOT_FOUND");
    return { report: reportDetailDto(report) };
  });

  app.get("/api/mini-app/reports/:id/artifacts/:type", async (request, reply) => {
    const session = await authenticateMiniApp(request, reply, input.services, {
      requireConsent: true
    });
    if (!session) return;
    if (!(await ensureMiniAppSubscription(session, input.services, input.bot, reply))) return;
    const params = request.params as { id: string; type: string };
    const type = params.type;
    if (!["pdf", "markdown", "html"].includes(type))
      return apiError(reply, 400, "ARTIFACT_INVALID");
    const report = await input.services.reports.getReportWithSections(params.id, session.user.id);
    if (!report) return apiError(reply, 404, "REPORT_NOT_FOUND");
    const artifact = report.artifacts.find((item) => item.type === type);
    if (!artifact) return apiError(reply, 404, "ARTIFACT_NOT_FOUND");
    const wantsLink = (request.query as { link?: string }).link === "1";
    const url =
      artifact.publicUrl && !artifact.publicUrl.startsWith("file://")
        ? artifact.publicUrl
        : await input.services.storage.signedUrl(artifact.storageKey);
    if (wantsLink) {
      return {
        url: url && !url.startsWith("file://") ? url : null,
        downloadPath: `/api/mini-app/reports/${report.id}/artifacts/${artifact.type}`
      };
    }
    if (url?.startsWith("file://")) {
      const path = fileURLToPath(url);
      reply.type(contentTypeForArtifact(type));
      reply.header("Content-Disposition", `attachment; filename="${artifactFileName(type)}"`);
      return reply.send(createReadStream(path));
    }
    if (!url) return apiError(reply, 404, "ARTIFACT_NOT_FOUND");
    return reply.redirect(url);
  });

  app.post("/api/mini-app/reports/:id/chat", async (request, reply) => {
    const session = await authenticateMiniApp(request, reply, input.services, {
      requireConsent: true
    });
    if (!session) return;
    if (!(await ensureMiniAppSubscription(session, input.services, input.bot, reply))) return;
    const params = request.params as { id: string };
    const body = bodyObject(request);
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";
    if (question.length < 2) return apiError(reply, 400, "QUESTION_INVALID");
    const requestId =
      typeof body.requestId === "string" && body.requestId.length <= 80
        ? body.requestId
        : randomUUID();
    try {
      const answer = await input.services.chat.ask({
        userId: session.user.id,
        reportId: params.id,
        question,
        language: session.user.language === "en" ? "en" : "ru",
        requestId
      });
      return {
        ok: true,
        answer,
        credits: await creditsDto(input.services, session.user.id)
      };
    } catch (error) {
      if (error instanceof ChatRequestInProgressError) {
        return apiError(reply, 409, "REQUEST_IN_PROGRESS");
      }
      if (error instanceof InsufficientCreditsError) {
        return apiError(reply, 402, "INSUFFICIENT_CREDITS", {
          costUnits: error.costUnits,
          availableUnits: error.availableUnits
        });
      }
      throw error;
    }
  });

  app.post("/api/mini-app/payments/stars", async (request, reply) => {
    const session = await authenticateMiniApp(request, reply, input.services, {
      requireConsent: true
    });
    if (!session) return;
    if (!(await ensureMiniAppSubscription(session, input.services, input.bot, reply))) return;
    if (!miniAppTelegramStarsAvailable()) return apiError(reply, 403, "PAYMENT_METHOD_UNAVAILABLE");
    const body = bodyObject(request);
    const packageCode = typeof body.packageCode === "string" ? body.packageCode : "";
    const requestId = paymentRequestId(body);
    await input.services.payments.ensureCatalog();
    const invoice = await input.services.payments.createTelegramStarsInvoiceLink({
      api: input.bot.api,
      userId: session.user.id,
      telegramUserId: session.telegramUserId,
      chatId: session.chatId,
      packageCode,
      idempotencyKey: `miniapp:stars:${session.user.id}:${packageCode}:${requestId}`
    });
    return { ok: true, invoice };
  });

  app.post("/api/mini-app/payments/yookassa", async (request, reply) => {
    const session = await authenticateMiniApp(request, reply, input.services, {
      requireConsent: true
    });
    if (!session) return;
    if (!(await ensureMiniAppSubscription(session, input.services, input.bot, reply))) return;
    if (!miniAppYooKassaAvailable()) return apiError(reply, 403, "PAYMENT_METHOD_UNAVAILABLE");
    const body = bodyObject(request);
    const packageCode = typeof body.packageCode === "string" ? body.packageCode : "";
    const requestId = paymentRequestId(body);
    const email =
      typeof body.email === "string" && isValidEmail(body.email)
        ? body.email.trim().toLowerCase()
        : (session.user.email ?? undefined);
    if (env.YOOKASSA_USE_RECEIPTS && !email) return apiError(reply, 400, "EMAIL_REQUIRED");
    let user = session.user;
    if (email && email !== session.user.email) {
      user = await input.services.users.updateEmail(session.user.id, email);
    }
    await input.services.payments.ensureCatalog();
    const order = await input.services.payments.createYooKassaOrder({
      userId: user.id,
      chatId: session.chatId,
      packageCode,
      userEmail: email,
      idempotencyKey: `miniapp:yk:${user.id}:${packageCode}:${requestId}`
    });
    return { ok: true, order, user: userDto(user) };
  });
}

async function serveMiniAppFile(relativePath: string, reply: FastifyReply) {
  const normalized = relativePath.replace(/^\/+/, "") || "index.html";
  const target = resolve(staticRoot, normalized);
  if (!isInsideStaticRoot(target)) {
    reply.code(404);
    return "Not found";
  }
  try {
    await access(target);
  } catch {
    reply.code(404);
    return "Not found";
  }
  const extension = extname(target).toLowerCase();
  reply.type(staticContentType(extension));
  reply.header("X-Content-Type-Options", "nosniff");
  if (basename(target) === "index.html") {
    reply.header("Cache-Control", "no-store");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org"
    );
  } else {
    reply.header("Cache-Control", "public, max-age=3600");
  }
  return reply.send(await readFile(target));
}

function isInsideStaticRoot(target: string): boolean {
  return target === staticRoot || target.startsWith(`${staticRoot}${sep}`);
}

function staticContentType(extension: string): string {
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml"
  };
  return types[extension] ?? "application/octet-stream";
}

async function authenticateMiniApp(
  request: FastifyRequest,
  reply: FastifyReply,
  services: Services,
  options: { requireConsent?: boolean } = {}
): Promise<MiniAppSession | undefined> {
  const initData = readInitData(request);
  let telegramUser: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
    language_code?: string;
  };
  let chatId: number | undefined;
  try {
    if (initData) {
      const validated = validateMiniAppInitData(initData, env.TELEGRAM_BOT_TOKEN);
      if (!validated.user) {
        apiError(reply, 401, "TELEGRAM_USER_MISSING");
        return undefined;
      }
      telegramUser = validated.user;
      chatId = validated.chat?.id;
    } else if (isLocalRuntimeEnv(env.APP_ENV)) {
      telegramUser = devTelegramUser(request);
      chatId = devTelegramChatId(request, telegramUser.id);
    } else {
      apiError(reply, 401, "INIT_DATA_MISSING");
      return undefined;
    }
  } catch (error) {
    if (error instanceof MiniAppAuthError) {
      apiError(reply, 401, error.code);
      return undefined;
    }
    throw error;
  }

  const result = await services.users.upsertTelegramUser({
    id: telegramUser.id,
    username: telegramUser.username,
    firstName: telegramUser.first_name,
    lastName: telegramUser.last_name,
    languageCode: telegramUser.language_code
  });
  if (result.isNew) await grantWelcomeBonus(services, result.user.id);
  if (result.user.status === "deleted") {
    apiError(reply, 403, "ACCOUNT_DELETED");
    return undefined;
  }
  if (options.requireConsent && !result.user.consentAcceptedAt) {
    apiError(reply, 403, "CONSENT_REQUIRED");
    return undefined;
  }

  return {
    user: result.user,
    telegramUserId: telegramUser.id,
    chatId: chatId ?? telegramUser.id
  };
}

function readInitData(request: FastifyRequest): string {
  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (value?.startsWith("tma ")) return value.slice(4).trim();
  const initDataHeader = request.headers["x-telegram-init-data"];
  return typeof initDataHeader === "string" ? initDataHeader.trim() : "";
}

function devTelegramUser(request: FastifyRequest) {
  const raw = request.headers["x-mini-app-dev-user"];
  const id = typeof raw === "string" && Number.isSafeInteger(Number(raw)) ? Number(raw) : 900000001;
  return {
    id,
    username: "local_mini_app",
    first_name: "Local",
    last_name: "Tester",
    language_code: env.DEFAULT_LANGUAGE
  };
}

function devTelegramChatId(request: FastifyRequest, fallback: number): number {
  const raw = request.headers["x-mini-app-dev-chat"];
  const id = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isSafeInteger(id) ? id : fallback;
}

async function grantWelcomeBonus(services: Services, userId: string) {
  const bonusCredits = env.WELCOME_BONUS_CREDITS ?? 0;
  if (bonusCredits <= 0) return;
  await services.credits
    .grant({
      userId,
      amountUnits: Math.round(bonusCredits * CREDIT_UNIT),
      type: "grant",
      provider: "welcome_bonus",
      metadata: { reason: "welcome_bonus", source: "mini_app" }
    })
    .catch(() => undefined);
}

async function miniAppBootstrap(session: MiniAppSession, services: Services, bot: Bot<MyContext>) {
  const subscription = await subscriptionDto(session, services, bot);
  const base = {
    brandName: env.BRAND_NAME,
    user: userDto(session.user),
    features: miniAppFeatures(session.user),
    subscription,
    costs: miniAppCosts()
  };

  if (!session.user.consentAcceptedAt || !subscription.ok) {
    return {
      ...base,
      credits: null,
      stats: null,
      packages: { stars: [], yookassa: [] },
      reports: [],
      jobs: []
    };
  }

  const [credits, stats, reports, jobs] = await Promise.all([
    creditsDto(services, session.user.id),
    services.users.profileStats(session.user.id),
    services.reports.latestReports(session.user.id, 10),
    latestJobs(services, session.user.id)
  ]);
  await services.payments.ensureCatalog();
  return {
    ...base,
    credits,
    stats: {
      completedReports: stats.completedReports,
      activeJobs: stats.activeJobs,
      retentionDays: stats.settings?.reportRetentionDays ?? env.REPORT_RETENTION_DAYS ?? 30,
      exportFormat: stats.settings?.defaultExportFormat ?? "pdf"
    },
    packages: {
      stars: miniAppTelegramStarsAvailable()
        ? services.payments.packages("telegram_stars").map(packageDto)
        : [],
      yookassa: miniAppYooKassaAvailable()
        ? services.payments.packages("yookassa").map(packageDto)
        : []
    },
    reports: reports.map(reportListItemDto),
    jobs
  };
}

function miniAppFeatures(user: User) {
  return {
    hrMode: env.FEATURE_HR_MODE,
    influencerMode: env.FEATURE_INFLUENCER_MODE,
    osintMode: env.FEATURE_OSINT_COMPLIANCE_MODE && isCompliance(user),
    photoSearch: env.FEATURE_PHOTO_SEARCH,
    telegramStars: miniAppTelegramStarsAvailable(),
    yookassa: miniAppYooKassaAvailable(),
    yookassaReceipts: miniAppYooKassaAvailable() && env.YOOKASSA_USE_RECEIPTS,
    requireChannelSubscription: env.FEATURE_REQUIRE_CHANNEL_SUB
  };
}

function miniAppTelegramStarsAvailable(): boolean {
  return env.FEATURE_TELEGRAM_STARS && Boolean(env.TELEGRAM_BOT_TOKEN);
}

function miniAppYooKassaAvailable(): boolean {
  return env.FEATURE_YOOKASSA_PAYMENTS;
}

function miniAppCosts() {
  return {
    standard: MODE_COST_UNITS.standard,
    influencer: MODE_COST_UNITS.influencer,
    hr: MODE_COST_UNITS.hr,
    osint_compliance: MODE_COST_UNITS.osint_compliance,
    chat_message: MODE_COST_UNITS.chat_message
  };
}

async function ensureMiniAppSubscription(
  session: MiniAppSession,
  services: Services,
  bot: Bot<MyContext>,
  reply: FastifyReply
): Promise<boolean> {
  const subscription = await subscriptionDto(session, services, bot);
  if (subscription.ok) return true;
  apiError(reply, 403, "SUBSCRIPTION_REQUIRED", {
    channelUrl: subscription.channelUrl
  });
  return false;
}

async function creditsDto(services: Services, userId: string) {
  const snapshot = await services.credits.snapshot(userId);
  return {
    ...snapshot,
    balance: creditsFromUnits(snapshot.balanceUnits),
    available: creditsFromUnits(snapshot.availableUnits),
    reserved: creditsFromUnits(snapshot.reservedUnits),
    purchased: creditsFromUnits(snapshot.purchasedUnits),
    granted: creditsFromUnits(snapshot.grantedUnits)
  };
}

async function latestJobs(services: Services, userId: string) {
  const jobs = await services.prisma.analysisJob.findMany({
    where: { userId },
    include: { report: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
    take: 12
  });
  return jobs.map((job) => ({
    id: job.id,
    username: job.targetUsername,
    mode: job.mode,
    status: job.status,
    stage: job.stage,
    progressCurrent: job.progressCurrent,
    progressTotal: job.progressTotal,
    progressPercent: Number(job.progressPercent),
    costCreditUnits: job.costCreditUnits,
    reportId: job.report?.id,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString(),
    finishedAt: job.finishedAt?.toISOString(),
    active: activeJobStatuses.includes(job.status)
  }));
}

async function subscriptionDto(session: MiniAppSession, services: Services, bot: Bot<MyContext>) {
  if (!env.FEATURE_REQUIRE_CHANNEL_SUB) {
    return { required: false, ok: true, channelUrl: env.CHANNEL_URL };
  }
  if (!env.REQUIRED_CHANNEL_ID) {
    return {
      required: true,
      ok: isLocalRuntimeEnv(env.APP_ENV),
      channelUrl: env.CHANNEL_URL,
      misconfigured: true
    };
  }
  if (miniAppUserIsAdmin(services, session.user)) {
    return { required: true, ok: true, channelUrl: env.CHANNEL_URL, bypass: "admin" };
  }
  try {
    return {
      required: true,
      ok: await telegramUserIsSubscribed(bot.api, session.telegramUserId),
      channelUrl: env.CHANNEL_URL
    };
  } catch {
    return {
      required: true,
      ok: isLocalRuntimeEnv(env.APP_ENV),
      channelUrl: env.CHANNEL_URL,
      failOpen: isLocalRuntimeEnv(env.APP_ENV)
    };
  }
}

function miniAppUserIsAdmin(services: Services, user: User): boolean {
  const users = services.users as Services["users"] & {
    isAdmin?: (candidate: User) => boolean;
  };
  return typeof users.isAdmin === "function" && users.isAdmin(user);
}

function userDto(user: User) {
  return {
    id: user.id,
    telegramId: user.telegramId.toString(),
    username: user.telegramUsername,
    firstName: user.firstName,
    lastName: user.lastName,
    name:
      [user.firstName, user.lastName].filter(Boolean).join(" ") || user.telegramUsername || "user",
    language: user.language,
    role: user.role,
    status: user.status,
    email: user.email,
    consentAccepted: Boolean(user.consentAcceptedAt),
    createdAt: user.createdAt.toISOString()
  };
}

function packageDto(pkg: ReturnType<Services["payments"]["packages"]>[number]) {
  return {
    code: pkg.code,
    title: pkg.title,
    creditsUnits: pkg.creditsUnits,
    credits: packageCredits(pkg),
    starsAmount: pkg.starsAmount,
    rubAmount: pkg.rubAmount
  };
}

function reportListItemDto(
  report: Prisma.ReportGetPayload<{ include: { analysisJob: true; artifacts: true } }>
) {
  return {
    id: report.id,
    username: report.analysisJob.targetUsername,
    mode: report.mode,
    language: report.language,
    summary: report.summary,
    metrics: report.metrics,
    artifactTypes: report.artifacts.map((item) => item.type),
    createdAt: report.createdAt.toISOString(),
    expiresAt: report.expiresAt?.toISOString()
  };
}

function reportDetailDto(
  report: Prisma.ReportGetPayload<{
    include: { sections: true; artifacts: true; analysisJob: true };
  }>
) {
  return {
    ...reportListItemDto(report),
    model: report.model,
    promptVersion: report.promptVersion,
    rawText: report.rawText,
    sections: report.sections.map((section) => ({
      id: section.id,
      position: section.position,
      title: section.title,
      content: section.content,
      kind: section.kind,
      sources: section.sources
    })),
    artifacts: report.artifacts.map((artifact) => ({
      id: artifact.id,
      type: artifact.type,
      sizeBytes: artifact.sizeBytes,
      available: true,
      downloadPath: `/api/mini-app/reports/${report.id}/artifacts/${artifact.type}`
    }))
  };
}

function modeAvailable(mode: AnalysisMode, user: User): boolean {
  if (mode === "standard") return true;
  if (mode === "influencer") return env.FEATURE_INFLUENCER_MODE;
  if (mode === "hr") return env.FEATURE_HR_MODE;
  if (mode === "osint_compliance") return env.FEATURE_OSINT_COMPLIANCE_MODE && isCompliance(user);
  return false;
}

function isAnalysisMode(value: string): value is AnalysisMode {
  return (ANALYSIS_MODES as readonly string[]).includes(value);
}

function isCompliance(user: Pick<User, "role">): boolean {
  return ["compliance", "admin", "superadmin"].includes(user.role);
}

function bodyObject(request: FastifyRequest): Record<string, unknown> {
  return request.body && typeof request.body === "object"
    ? (request.body as Record<string, unknown>)
    : {};
}

function paymentRequestId(body: Record<string, unknown>): string {
  return typeof body.requestId === "string" && body.requestId.trim().length <= 80
    ? body.requestId.trim()
    : randomUUID();
}

function apiError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  details?: Record<string, unknown>
) {
  return reply.code(statusCode).send({ ok: false, error: { code, ...details } });
}

function contentTypeForArtifact(type: string): string {
  if (type === "pdf") return "application/pdf";
  if (type === "markdown") return "text/markdown; charset=utf-8";
  return "text/html; charset=utf-8";
}

function artifactFileName(type: string): string {
  const extensions: Record<string, string> = { pdf: "pdf", markdown: "md", html: "html" };
  return `instagram-report.${extensions[type] ?? "txt"}`;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value.trim()) && value.length <= 254;
}
