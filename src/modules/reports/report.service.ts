import type { PrismaClient } from "@prisma/client";
import { addDays } from "./time.js";
import type { StrategicReportView } from "./types.js";
import { renderReportHtml, renderReportMarkdown } from "./export.js";
import type { StorageAdapter } from "../storage/storage.adapter.js";
import type { PdfAdapter } from "../pdf/pdf.adapter.js";

export class ReportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageAdapter,
    private readonly pdf: PdfAdapter
  ) {}

  async persist(jobId: string, userId: string, report: StrategicReportView, retentionDays: number) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.report.create({
        data: {
          analysisJobId: jobId,
          userId,
          mode: report.mode,
          language: report.language,
          rawText: report.rawText,
          summary: report.summary,
          metrics: report.metrics as never,
          sourceMap: report.sourceMap as never,
          model: report.model,
          promptVersion: report.promptVersion,
          expiresAt: addDays(new Date(), retentionDays)
        }
      });
      await tx.reportSection.createMany({
        data: report.sections.map((section, index) => ({
          reportId: created.id,
          position: index + 1,
          title: section.title,
          content: section.content,
          kind: section.kind,
          sources: section.sources as never
        }))
      });
      return created;
    });
  }

  async createArtifacts(reportId: string, report: StrategicReportView, expiresAt: Date) {
    const markdown = Buffer.from(renderReportMarkdown(report), "utf8");
    const html = Buffer.from(renderReportHtml(report), "utf8");
    const objects: Array<{
      type: string;
      contentType: string;
      key: string;
      bytes: Buffer<ArrayBufferLike>;
    }> = [
      {
        type: "markdown",
        contentType: "text/markdown",
        key: `reports/${reportId}/report.md`,
        bytes: markdown
      },
      {
        type: "html",
        contentType: "text/html",
        key: `reports/${reportId}/report.html`,
        bytes: html
      }
    ];
    const pdf = await this.tryRenderPdf(html.toString("utf8"));
    if (pdf) {
      objects.push({
        type: "pdf",
        contentType: "application/pdf",
        key: `reports/${reportId}/report.pdf`,
        bytes: pdf
      });
    }
    const storedObjects: Array<{
      type: string;
      key: string;
      publicUrl?: string;
      sizeBytes: number;
    }> = [];
    try {
      for (const object of objects) {
        const stored = await this.storage.putObject({
          key: object.key,
          bytes: object.bytes,
          contentType: object.contentType
        });
        storedObjects.push({
          type: object.type,
          key: stored.key,
          publicUrl: stored.publicUrl,
          sizeBytes: stored.sizeBytes
        });
      }
      await this.prisma.$transaction(async (tx) => {
        for (const stored of storedObjects) {
          await tx.reportArtifact.create({
            data: {
              reportId,
              type: stored.type,
              storageKey: stored.key,
              publicUrl: stored.publicUrl,
              expiresAt,
              sizeBytes: stored.sizeBytes
            }
          });
        }
      });
    } catch (error) {
      await this.storage
        .deleteObjects(storedObjects.map((stored) => stored.key))
        .catch(() => undefined);
      throw error;
    }
  }

  async cleanupByAnalysisJob(analysisJobId: string) {
    const report = await this.prisma.report.findUnique({
      where: { analysisJobId },
      include: { artifacts: { select: { storageKey: true } } }
    });
    if (!report) return false;
    const keys = report.artifacts.map((artifact) => artifact.storageKey);
    if (keys.length) {
      await this.storage.deleteObjects(keys).catch(() => undefined);
    }
    await this.prisma.report.delete({ where: { id: report.id } });
    return true;
  }

  async getReportWithSections(reportId: string, userId: string) {
    return this.prisma.report.findFirst({
      where: { id: reportId, userId },
      include: {
        sections: { orderBy: { position: "asc" } },
        artifacts: true,
        analysisJob: true
      }
    });
  }

  async latestReports(userId: string, take = 10) {
    return this.prisma.report.findMany({
      where: { userId },
      include: { analysisJob: true, artifacts: true },
      orderBy: { createdAt: "desc" },
      take
    });
  }

  private async tryRenderPdf(html: string): Promise<Buffer | undefined> {
    try {
      return await this.pdf.renderPdf(html);
    } catch {
      return undefined;
    }
  }
}
