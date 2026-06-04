import { Prisma, type PrismaClient, type User } from "@prisma/client";
import { createHash } from "node:crypto";
import { adminTelegramIds, env } from "../../config/env.js";
import type { Locale } from "../../telegram/constants.js";
import type { StorageAdapter } from "../storage/storage.adapter.js";

export type TelegramIdentity = {
  id: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  allowReactivate?: boolean;
};

export class UserService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage?: Pick<StorageAdapter, "deleteObjects">
  ) {}

  async upsertTelegramUser(identity: TelegramIdentity): Promise<{ user: User; isNew: boolean }> {
    const telegramId = BigInt(identity.id);
    const existing = await this.prisma.user.findUnique({ where: { telegramId } });
    const language = identity.languageCode?.startsWith("en") ? "en" : env.DEFAULT_LANGUAGE;
    if (existing) {
      if (existing.status === "deleted" && !identity.allowReactivate) {
        return { user: existing, isNew: false };
      }
      const user = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          telegramUsername: identity.username,
          firstName: identity.firstName,
          lastName: identity.lastName,
          language: existing.language || language,
          role:
            adminTelegramIds.includes(identity.id) && existing.role === "user"
              ? "admin"
              : existing.role,
          ...(existing.status === "deleted"
            ? {
                status: "active",
                deletedAt: null,
                consentVersion: null,
                consentAcceptedAt: null
              }
            : {})
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
    const reportRetentionDays = allowed.includes(days) ? days : (env.REPORT_RETENTION_DAYS ?? 30);
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
          status: {
            in: ["queued", "fetching_profile", "analyzing_images", "generating_exports", "retrying"]
          }
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
    const now = new Date();
    const artifacts = await this.prisma.reportArtifact.findMany({
      where: { report: { userId } },
      select: { storageKey: true }
    });
    if (this.storage) {
      await this.storage.deleteObjects(artifacts.map((artifact) => artifact.storageKey));
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.reportArtifact.deleteMany({ where: { report: { userId } } });
      await tx.reportChatSession.deleteMany({ where: { userId } });
      await tx.analysisJob.deleteMany({ where: { userId } });
      await tx.report.deleteMany({ where: { userId } });
      await tx.photoSearchJob.deleteMany({ where: { userId } });
      await tx.telegramWizardState.deleteMany({ where: { userId } });
      await tx.telegramUpdate.updateMany({ where: { userId }, data: { userId: null } });
      await tx.creditTransaction.updateMany({
        where: { userId },
        data: { metadata: Prisma.JsonNull }
      });
      await tx.paymentOrder.updateMany({
        where: {
          userId,
          OR: [
            { provider: { not: "telegram_stars" } },
            { status: { not: "pending_payment" } },
            { expiresAt: null },
            { expiresAt: { lte: now } }
          ]
        },
        data: {
          userEmail: null,
          telegramChatId: null,
          telegramInvoiceMessageId: null
        }
      });
      await tx.paymentEvent.updateMany({
        where: { paymentOrder: { userId } },
        data: { payload: Prisma.JsonNull }
      });
      await tx.telegramStarPayment.updateMany({
        where: {
          paymentOrder: {
            userId,
            OR: [
              { status: { not: "pending_payment" } },
              { expiresAt: null },
              { expiresAt: { lte: now } }
            ]
          }
        },
        data: {
          telegramChatId: BigInt(0),
          invoiceMessageId: null,
          preCheckoutQueryId: null,
          successfulPayment: Prisma.JsonNull,
          rawPreCheckoutQuery: Prisma.JsonNull,
          rawSuccessfulPayment: Prisma.JsonNull
        }
      });
      await tx.telegramStarPayment.updateMany({
        where: {
          paymentOrder: {
            userId,
            status: "pending_payment",
            expiresAt: { gt: now }
          }
        },
        data: {
          invoiceMessageId: null,
          preCheckoutQueryId: null,
          successfulPayment: Prisma.JsonNull,
          rawPreCheckoutQuery: Prisma.JsonNull,
          rawSuccessfulPayment: Prisma.JsonNull
        }
      });
      await tx.yooKassaPayment.updateMany({
        where: { paymentOrder: { userId } },
        data: { metadata: Prisma.JsonNull, raw: Prisma.JsonNull }
      });
      await tx.fiscalReceipt.updateMany({
        where: { paymentOrder: { userId } },
        data: {
          customerEmail: null,
          payload: Prisma.JsonNull,
          raw: Prisma.JsonNull
        }
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          status: "deleted",
          telegramId: anonymizedTelegramId(userId),
          telegramUsername: null,
          firstName: null,
          lastName: null,
          email: null,
          referralCode: null,
          consentVersion: null,
          consentAcceptedAt: null,
          deletedAt: now
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

function anonymizedTelegramId(userId: string): bigint {
  const digest = createHash("sha256").update(userId).digest("hex");
  const positiveSigned64 = BigInt(`0x${digest.slice(0, 16)}`) & ((1n << 63n) - 1n);
  return -(positiveSigned64 || 1n);
}
