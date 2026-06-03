import type { PrismaClient } from "@prisma/client";
import type { StorageAdapter } from "../storage/storage.adapter.js";

export class RetentionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageAdapter
  ) {}

  async cleanupExpiredReports(now = new Date()) {
    const expired = await this.prisma.report.findMany({
      where: { expiresAt: { lt: now } },
      select: { id: true, userId: true, artifacts: { select: { storageKey: true } } }
    });
    for (const report of expired) {
      await this.storage.deleteObjects(report.artifacts.map((artifact) => artifact.storageKey));
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
    }
    return expired.length;
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
