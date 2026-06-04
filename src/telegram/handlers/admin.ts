import { env } from "../../config/env.js";
import { CB } from "../constants.js";
import type { MyContext } from "../context.js";
import { t } from "../locales/index.js";
import { sendHtml } from "./helpers.js";
import { InlineKeyboard } from "grammy";

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
    await ctx.services.credits.grant({
      userId: target.id,
      amountUnits: Math.round(credits * 100),
      type: "grant",
      provider: "admin",
      metadata: { adminUserId: ctx.user.id }
    });
    await sendHtml(ctx, messages.adminGrantDone({ credits, telegramId }));
  });

  bot.command("admin_refund_stars", async (ctx) => {
    if (!ctx.user || !ctx.services.users.isAdmin(ctx.user)) return;
    const orderId = ctx.message?.text?.split(/\s+/)[1];
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      await sendHtml(ctx, "Usage: /admin_refund_stars <paymentOrderId>");
      return;
    }
    try {
      const result = await ctx.services.payments.refundTelegramStarsPayment({
        api: ctx.api,
        paymentOrderId: orderId,
        adminUserId: ctx.user.id,
        reason: "admin_manual_refund"
      });
      const note =
        "alreadyProcessed" in result && result.alreadyProcessed ? " (already processed)" : "";
      await sendHtml(ctx, `Refund ${result.status}${note}: ${result.refundId}`);
    } catch (error) {
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
  await sendHtml(
    ctx,
    t(ctx.user.language).adminStats({ users, jobs, failed, payments }),
    new InlineKeyboard().text(t(ctx.user.language).buttons.menu, CB.BACK_MAIN)
  );
}
