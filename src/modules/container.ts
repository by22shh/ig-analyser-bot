import { env, providerMode } from "../config/env.js";
import { prisma } from "../db/client.js";
import { CreditsService } from "./billing/credits.service.js";
import { UserService } from "./users/user.service.js";
import { WizardStateService } from "./users/wizard-state.service.js";
import { AnalysisService } from "./analysis/analysis.service.js";
import { ApifyInstagramProfileProvider, MockInstagramProfileProvider } from "./instagram/apify.adapter.js";
import { MockLlmProvider, OpenRouterLlmProvider } from "./llm/openrouter.adapter.js";
import { createStorageAdapter } from "./storage/storage.adapter.js";
import { MockPdfAdapter, PlaywrightPdfAdapter } from "./pdf/pdf.adapter.js";
import { ReportService } from "./reports/report.service.js";
import { MockYooKassaAdapter, RealYooKassaAdapter } from "./payments/adapters/yookassa.adapter.js";
import { PaymentService } from "./payments/payment.service.js";
import { MockFaceCheckAdapter, RealFaceCheckAdapter } from "./photo-search/adapters/facecheck.adapter.js";
import { PhotoSearchService } from "./photo-search/photo-search.service.js";
import { ReportChatService } from "./chat/report-chat.service.js";
import { RetentionService } from "./users/retention.service.js";

export function createServices() {
  const credits = new CreditsService(prisma);
  const users = new UserService(prisma);
  const wizard = new WizardStateService(prisma);
  const instagram = providerMode.apify === "real" ? new ApifyInstagramProfileProvider() : new MockInstagramProfileProvider();
  const llm = providerMode.openrouter === "real" ? new OpenRouterLlmProvider() : new MockLlmProvider();
  const storage = createStorageAdapter();
  const pdf = env.APP_ENV === "test" ? new MockPdfAdapter() : new PlaywrightPdfAdapter();
  const reports = new ReportService(prisma, storage, pdf);
  const yookassa = providerMode.yookassa === "real" ? new RealYooKassaAdapter() : new MockYooKassaAdapter();
  const payments = new PaymentService(prisma, credits, yookassa);
  const facecheck = providerMode.facecheck === "real" ? new RealFaceCheckAdapter() : new MockFaceCheckAdapter();
  const photoSearch = new PhotoSearchService(prisma, credits);
  const analysis = new AnalysisService(prisma, credits);
  const chat = new ReportChatService(prisma, llm);
  const retention = new RetentionService(prisma);
  return {
    prisma,
    credits,
    users,
    wizard,
    instagram,
    llm,
    storage,
    pdf,
    reports,
    yookassa,
    payments,
    facecheck,
    photoSearch,
    analysis,
    chat,
    retention
  };
}

export type Services = ReturnType<typeof createServices>;
