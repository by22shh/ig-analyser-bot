import { env } from "../../config/env.js";
import { childLogger } from "../../config/logger.js";
import { CB } from "../constants.js";
import type { MyContext } from "../context.js";
import { t } from "../locales/index.js";
import { editOrSendHtml, sendHtml } from "./helpers.js";
import { InlineKeyboard } from "grammy";

const log = childLogger("telegram.admin");

export function registerAdminHandlers(bot: import("grammy").Bot<MyContext>) {
  bot.command(["admin", "admin_stats"], async (ctx) => showAdmin(ctx));
  bot.callbackQuery(CB.ADMIN, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showAdmin(ctx);
  });
  bot.command("admin_grant", async (ctx) => {
    if (!ctx.user || !ctx.services.users.isAdmin(ctx.user)) return;
    const parts = ctx.message?.text?.split(/\s+/) ?? [];
    const telegramId = Number(parts[1]);
    const credits = Number(parts[2] ?? env.ADMIN_DEFAULT_CREDITS ?? 100);
    const messages = t(ctx.user.language);
    if (!Number.isSafeInteger(telegramId) || !Number.isFinite(credits) || credits <= 0) {
      await sendHtml(ctx, messages.adminGrantUsage());
      return;
    }
    const target = await ctx.services.prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) }
    });
    if (!target) {
      await sendHtml(ctx, messages.adminUserNotFound());
      return;
    }
    const transaction = await ctx.services.credits.grant({
      userId: target.id,
      amountUnits: Math.round(credits * 100),
      type: "grant",
      provider: "admin",
      metadata: { adminUserId: ctx.user.id }
    });
    await ctx.services.prisma.auditLog
      .create({
        data: {
          actorUserId: ctx.user.id,
          targetUserId: target.id,
          action: "admin_grant_credits",
          entityType: "credit_transaction",
          entityId: transaction.id,
          metadata: {
            telegramId,
            credits,
            amountUnits: Math.round(credits * 100)
          }
        }
      })
      .catch((error) =>
        log.warn(
          {
            error,
            adminUserId: ctx.user?.id,
            targetUserId: target.id,
            transactionId: transaction.id
          },
          "admin_grant_audit_log_failed"
        )
      );
    await sendHtml(ctx, messages.adminGrantDone({ credits, telegramId }));
  });

  bot.command("admin_refund_stars", async (ctx) => {
    if (!ctx.user || !ctx.services.users.isAdmin(ctx.user)) return;
    const orderId = ctx.message?.text?.split(/\s+/)[1];
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      await sendHtml(ctx, "Usage: /admin_refund_stars <paymentOrderId>");
      return;
    }
    const order = await ctx.services.prisma.paymentOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        provider: true,
        status: true,
        amountMinor: true,
        creditsUnits: true
      }
    });
    try {
      const result = await ctx.services.payments.refundTelegramStarsPayment({
        api: ctx.api,
        paymentOrderId: orderId,
        adminUserId: ctx.user.id,
        reason: "admin_manual_refund"
      });
      await ctx.services.prisma.auditLog
        .create({
          data: {
            actorUserId: ctx.user.id,
            targetUserId: order?.userId,
            action: "admin_refund_stars",
            entityType: "payment_order",
            entityId: orderId,
            metadata: {
              refundId: result.refundId,
              status: result.status,
              alreadyProcessed:
                "alreadyProcessed" in result ? Boolean(result.alreadyProcessed) : false,
              orderStatus: order?.status ?? null,
              amountMinor: order?.amountMinor ?? null,
              creditsUnits: order?.creditsUnits ?? null
            }
          }
        })
        .catch((error) =>
          log.warn({ error, adminUserId: ctx.user?.id, orderId }, "admin_refund_audit_log_failed")
        );
      const note =
        "alreadyProcessed" in result && result.alreadyProcessed ? " (already processed)" : "";
      await sendHtml(ctx, `Refund ${result.status}${note}: ${result.refundId}`);
    } catch (error) {
      await ctx.services.prisma.auditLog
        .create({
          data: {
            actorUserId: ctx.user.id,
            targetUserId: order?.userId,
            action: "admin_refund_stars_failed",
            entityType: "payment_order",
            entityId: orderId,
            metadata: {
              error: error instanceof Error ? error.message : String(error),
              orderStatus: order?.status ?? null,
              provider: order?.provider ?? null,
              amountMinor: order?.amountMinor ?? null,
              creditsUnits: order?.creditsUnits ?? null
            }
          }
        })
        .catch((auditError) =>
          log.warn(
            { error: auditError, originalError: error, adminUserId: ctx.user?.id, orderId },
            "admin_refund_failed_audit_log_failed"
          )
        );
      await sendHtml(
        ctx,
        `Refund failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

async function showAdmin(ctx: MyContext) {
  if (!ctx.user || !ctx.services.users.isAdmin(ctx.user)) return;
  const [users, jobs, failed, payments] = await Promise.all([
    ctx.services.prisma.user.count(),
    ctx.services.prisma.analysisJob.count({
      where: {
        status: {
          in: ["queued", "fetching_profile", "analyzing_images", "generating_exports", "retrying"]
        }
      }
    }),
    ctx.services.prisma.analysisJob.count({ where: { status: "failed" } }),
    ctx.services.prisma.paymentOrder.count({ where: { status: "paid" } })
  ]);
  await editOrSendHtml(
    ctx,
    t(ctx.user.language).adminStats({ users, jobs, failed, payments }),
    new InlineKeyboard().text(t(ctx.user.language).buttons.menu, CB.BACK_MAIN)
  );
}
