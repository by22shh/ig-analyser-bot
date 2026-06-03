import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { InlineKeyboard } from "grammy";
import { InputFile } from "grammy";
import { ANALYSIS_MODES, CB, type AnalysisMode } from "../constants.js";
import type { MyContext } from "../context.js";
import { confirmAnalysisKeyboard } from "../keyboards/analysis.js";
import { sectionListKeyboard, reportActionsKeyboard } from "../keyboards/reports.js";
import { MODE_COST_UNITS } from "../../modules/billing/packages.js";
import { t } from "../locales/index.js";
import { sendHtml } from "./helpers.js";

export function registerHistoryHandlers(bot: import("grammy").Bot<MyContext>) {
  bot.command("history", async (ctx) => showHistory(ctx));
  bot.callbackQuery(CB.HISTORY, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showHistory(ctx);
  });

  bot.callbackQuery(new RegExp(`^${CB.REPORT_SECTIONS}:([0-9a-f-]+)$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    const report = await ctx.services.reports.getReportWithSections(ctx.match[1], ctx.user.id);
    if (!report) return;
    const messages = t(ctx.user.language);
    await ctx.answerCallbackQuery();
    await sendHtml(
      ctx,
      messages.sectionsIntro(report.analysisJob.targetUsername),
      sectionListKeyboard(
        messages,
        report.id,
        report.sections.map((section) => ({
          id: section.id,
          position: section.position,
          title: section.title
        }))
      )
    );
  });

  bot.callbackQuery(new RegExp(`^${CB.REPORT_SECTION}:([0-9a-f-]+)$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    const section = await ctx.services.prisma.reportSection.findUnique({
      where: { id: ctx.match[1] },
      include: { report: true }
    });
    if (!section || section.report.userId !== ctx.user.id) return;
    await ctx.answerCallbackQuery();
    await sendHtml(
      ctx,
      t(ctx.user.language).section(section.title, section.content),
      reportActionsKeyboard(t(ctx.user.language), section.reportId)
    );
  });

  bot.callbackQuery(new RegExp(`^${CB.REPORT_PDF}:([0-9a-f-]+)$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    await ctx.answerCallbackQuery();
    await sendArtifact(ctx, ctx.match[1], "pdf");
  });

  bot.callbackQuery(new RegExp(`^${CB.REPORT_MARKDOWN}:([0-9a-f-]+)$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    await ctx.answerCallbackQuery();
    await sendArtifact(ctx, ctx.match[1], "markdown");
  });

  bot.callbackQuery(new RegExp(`^${CB.REPORT_SOURCES}:([0-9a-f-]+)$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    const report = await ctx.services.reports.getReportWithSections(ctx.match[1], ctx.user.id);
    if (!report) return;
    const messages = t(ctx.user.language);
    await ctx.answerCallbackQuery();
    await sendHtml(
      ctx,
      messages.reportSources({
        username: report.analysisJob.targetUsername,
        sources: collectSources(report)
      }),
      reportActionsKeyboard(messages, report.id)
    );
  });

  bot.callbackQuery(new RegExp(`^${CB.REPORT_OPEN}:([0-9a-f-]+):repeat$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    const report = await ctx.services.reports.getReportWithSections(ctx.match[1], ctx.user.id);
    if (!report) return;
    const mode = isAnalysisMode(report.mode) ? report.mode : "standard";
    const messages = t(ctx.user.language);
    const requestId = randomUUID();
    await ctx.services.wizard.set(ctx.user.id, "confirming_analysis", {
      username: report.analysisJob.targetUsername,
      mode,
      requestId
    });
    await ctx.answerCallbackQuery();
    await sendHtml(
      ctx,
      `${messages.repeatAnalysis(report.analysisJob.targetUsername)}\n\n${messages.confirmAnalysis({
        username: report.analysisJob.targetUsername,
        mode,
        costUnits: MODE_COST_UNITS[mode]
      })}`,
      confirmAnalysisKeyboard(messages, mode, requestId)
    );
  });
}

async function showHistory(ctx: MyContext) {
  if (!ctx.user) return;
  const reports = await ctx.services.reports.latestReports(ctx.user.id, 10);
  const kb = new InlineKeyboard();
  for (const report of reports) {
    const mode = isAnalysisMode(report.mode)
      ? t(ctx.user.language).modeTitle(report.mode)
      : report.mode;
    kb.text(
      `@${report.analysisJob.targetUsername} · ${mode}`,
      `${CB.REPORT_SECTIONS}:${report.id}`
    ).row();
  }
  kb.text(t(ctx.user.language).buttons.menu, CB.BACK_MAIN);
  await sendHtml(
    ctx,
    reports.length ? t(ctx.user.language).historyTitle() : t(ctx.user.language).historyEmpty(),
    kb
  );
}

type ArtifactType = "pdf" | "markdown" | "html";

async function sendArtifact(ctx: MyContext, reportId: string, type: ArtifactType) {
  if (!ctx.user) return;
  const messages = t(ctx.user.language);
  const report = await ctx.services.reports.getReportWithSections(reportId, ctx.user.id);
  if (!report) return;
  const artifact = report.artifacts.find((item) => item.type === type);
  if (!artifact) {
    await sendHtml(ctx, messages.artifactMissing(type), reportActionsKeyboard(messages, report.id));
    return;
  }
  if (artifact.telegramFileId) {
    await ctx.replyWithDocument(artifact.telegramFileId, {
      caption: messages.artifactCaption(type),
      parse_mode: "HTML",
      reply_markup: reportActionsKeyboard(messages, report.id)
    });
    return;
  }
  const url =
    artifact.publicUrl && !artifact.publicUrl.startsWith("file://")
      ? artifact.publicUrl
      : await ctx.services.storage.signedUrl(artifact.storageKey);
  const fileUrl = [artifact.publicUrl, url].find((value) => value?.startsWith("file://"));
  const localPath = fileUrl ? fileURLToPath(fileUrl) : undefined;
  const document = localPath ? new InputFile(localPath, artifactFileName(type)) : url;
  if (!document) {
    await sendHtml(ctx, messages.artifactMissing(type), reportActionsKeyboard(messages, report.id));
    return;
  }
  try {
    const sent = await ctx.replyWithDocument(document, {
      caption: messages.artifactCaption(type),
      parse_mode: "HTML",
      reply_markup: reportActionsKeyboard(messages, report.id)
    });
    const fileId = sent.document?.file_id;
    if (fileId) {
      await ctx.services.prisma.reportArtifact.update({
        where: { id: artifact.id },
        data: { telegramFileId: fileId }
      });
    }
  } catch {
    if (url)
      await sendHtml(
        ctx,
        messages.artifactLinkFallback(type, url),
        reportActionsKeyboard(messages, report.id)
      );
    else
      await sendHtml(
        ctx,
        messages.artifactMissing(type),
        reportActionsKeyboard(messages, report.id)
      );
  }
}

function artifactFileName(type: ArtifactType): string {
  const extensions = { pdf: "pdf", markdown: "md", html: "html" };
  return `zreti-report.${extensions[type]}`;
}

function collectSources(
  report: Awaited<ReturnType<MyContext["services"]["reports"]["getReportWithSections"]>>
): Array<{ label: string; url?: string }> {
  if (!report) return [];
  const sources: Array<{ label: string; url?: string }> = [];
  const append = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const item = value as { label?: unknown; url?: unknown; postId?: unknown };
    const label =
      typeof item.label === "string"
        ? item.label
        : typeof item.postId === "string"
          ? `Post ${item.postId}`
          : "Source";
    const url = typeof item.url === "string" ? item.url : undefined;
    sources.push({ label, url });
  };
  if (Array.isArray(report.sourceMap)) report.sourceMap.forEach(append);
  for (const section of report.sections) {
    if (Array.isArray(section.sources)) section.sources.forEach(append);
  }
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.label}:${source.url ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isAnalysisMode(value: string): value is AnalysisMode {
  return (ANALYSIS_MODES as readonly string[]).includes(value);
}
