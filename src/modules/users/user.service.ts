import type { PrismaClient, User } from "@prisma/client";
import { adminTelegramIds, env } from "../../config/env.js";
import type { Locale } from "../../telegram/constants.js";

export type TelegramIdentity = {
  id: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
};

export class UserService {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertTelegramUser(identity: TelegramIdentity): Promise<{ user: User; isNew: boolean }> {
    const telegramId = BigInt(identity.id);
    const existing = await this.prisma.user.findUnique({ where: { telegramId } });
    const language = identity.languageCode?.startsWith("en") ? "en" : env.DEFAULT_LANGUAGE;
    if (existing) {
      const user = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          telegramUsername: identity.username,
          firstName: identity.firstName,
          lastName: identity.lastName,
          language: existing.language || language,
          role: adminTelegramIds.includes(identity.id) && existing.role === "user" ? "admin" : existing.role
        }
      });
      await this.ensureSettingsAndAccount(user.id);
      return { user, isNew: false };
    }

    const user = await this.prisma.user.create({
      data: {
        telegramId,
        telegramUsername: identity.username,
        firstName: identity.firstName,
        lastName: identity.lastName,
        language,
        role: adminTelegramIds.includes(identity.id) ? "admin" : "user",
        referralCode: String(identity.id)
      }
    });
    await this.ensureSettingsAndAccount(user.id);
    return { user, isNew: true };
  }

  async ensureSettingsAndAccount(userId: string): Promise<void> {
    await this.prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        defaultReportLanguage: env.DEFAULT_LANGUAGE,
        reportRetentionDays: env.REPORT_RETENTION_DAYS ?? 30
      },
      update: {}
    });
    await this.prisma.creditAccount.upsert({
      where: { userId },
      create: { userId },
      update: {}
    });
  }

  async acceptConsent(userId: string, language?: "ru" | "en"): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        language,
        consentVersion: "zreti-mvp-2026-06-03",
        consentAcceptedAt: new Date()
      }
    });
  }

  async updateLanguage(userId: string, language: Locale): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      await tx.userSettings.upsert({
        where: { userId },
        create: {
          userId,
          defaultReportLanguage: language,
          reportRetentionDays: env.REPORT_RETENTION_DAYS ?? 30
        },
        update: { defaultReportLanguage: language }
      });
      return tx.user.update({ where: { id: userId }, data: { language } });
    });
  }

  async updateExportFormat(userId: string, format: "pdf" | "markdown" | "html") {
    return this.prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        defaultReportLanguage: env.DEFAULT_LANGUAGE,
        defaultExportFormat: format,
        reportRetentionDays: env.REPORT_RETENTION_DAYS ?? 30
      },
      update: { defaultExportFormat: format }
    });
  }

  async updateReportRetention(userId: string, days: number) {
    const allowed = [7, 30, 90];
    const reportRetentionDays = allowed.includes(days) ? days : env.REPORT_RETENTION_DAYS ?? 30;
    return this.prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        defaultReportLanguage: env.DEFAULT_LANGUAGE,
        defaultExportFormat: "pdf",
        reportRetentionDays
      },
      update: { reportRetentionDays }
    });
  }

  async updateEmail(userId: string, email: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { email }
    });
  }

  async profileStats(userId: string) {
    const [settings, account, completedReports, activeJobs] = await Promise.all([
      this.prisma.userSettings.findUnique({ where: { userId } }),
      this.prisma.creditAccount.findUnique({ where: { userId } }),
      this.prisma.report.count({ where: { userId } }),
      this.prisma.analysisJob.count({
        where: {
          userId,
          status: { in: ["queued", "fetching_profile", "analyzing_images", "generating_report", "generating_exports"] }
        }
      })
    ]);
    return {
      settings,
      account,
      completedReports,
      activeJobs
    };
  }

  isAdmin(user: Pick<User, "role">): boolean {
    return ["admin", "superadmin"].includes(user.role);
  }

  isCompliance(user: Pick<User, "role">): boolean {
    return ["compliance", "admin", "superadmin"].includes(user.role);
  }

  async deleteMe(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.reportArtifact.deleteMany({
        where: { report: { userId } }
      });
      await tx.report.deleteMany({ where: { userId } });
      await tx.photoSearchJob.deleteMany({ where: { userId } });
      await tx.telegramWizardState.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          status: "deleted",
          telegramUsername: null,
          firstName: null,
          lastName: null,
          email: null,
          deletedAt: new Date()
        }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          targetUserId: userId,
          action: "delete_me",
          entityType: "user",
          entityId: userId
        }
      });
    });
  }
}
