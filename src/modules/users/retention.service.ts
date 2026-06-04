import type { PrismaClient } from "@prisma/client";
import { childLogger } from "../../config/logger.js";
import type { StorageAdapter } from "../storage/storage.adapter.js";

const log = childLogger("retention.service");
const REPORT_CLEANUP_BATCH_SIZE = 100;

export class RetentionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageAdapter
  ) {}

  async cleanupExpiredReports(now = new Date(), batchSize = REPORT_CLEANUP_BATCH_SIZE) {
    const failedIds = new Set<string>();
    let cleaned = 0;

    while (true) {
      const expired = await this.prisma.report.findMany({
        where: {
          expiresAt: { lt: now },
          ...(failedIds.size ? { id: { notIn: [...failedIds] } } : {})
        },
        select: { id: true, userId: true, artifacts: { select: { storageKey: true } } },
        orderBy: { expiresAt: "asc" },
        take: batchSize
      });
      if (!expired.length) break;

      for (const report of expired) {
        try {
          await this.deleteReportObjects(
            report.id,
            report.artifacts.map((artifact) => artifact.storageKey)
          );
          await this.prisma.$transaction(async (tx) => {
            await tx.reportArtifact.deleteMany({ where: { reportId: report.id } });
            await tx.report.delete({ where: { id: report.id } });
            await tx.auditLog.create({
              data: {
                targetUserId: report.userId,
                action: "retention_report_deleted",
                entityType: "report",
                entityId: report.id
              }
            });
          });
          cleaned += 1;
        } catch (error) {
          // One bad report (a concurrent worker already deleted it, or a transient
          // storage/DB error) must not abort cleanup of the rest of the batch.
          failedIds.add(report.id);
          log.warn({ error, reportId: report.id }, "retention_report_cleanup_failed");
        }
      }

      if (expired.length < batchSize) break;
    }

    return cleaned;
  }

  private async deleteReportObjects(reportId: string, keys: string[]) {
    if (this.storage.deletePrefix) {
      await this.storage.deletePrefix(`reports/${reportId}/`);
      return;
    }
    if (keys.length) {
      await this.storage.deleteObjects(keys);
    }
  }

  async cleanupOldPhotoSearch(now = new Date()) {
    const olderThan = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const result = await this.prisma.photoSearchJob.deleteMany({
      where: {
        createdAt: { lt: olderThan },
        status: { in: ["completed", "failed"] }
      }
    });
    return result.count;
  }
}
