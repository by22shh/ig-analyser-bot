import type { NextFunction } from "grammy";
import { env } from "../../config/env.js";
import { childLogger } from "../../config/logger.js";
import type { MyContext } from "../context.js";

const log = childLogger("user-context");

export async function userContext(ctx: MyContext, next: NextFunction) {
  if (ctx.preCheckoutQuery || ctx.message?.successful_payment) {
    await next();
    return;
  }

  const from = ctx.from;
  if (from) {
    const allowReactivate = ctx.message?.text?.trim().startsWith("/start") ?? false;
    const result = await ctx.services.users.upsertTelegramUser({
      id: from.id,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      languageCode: from.language_code,
      allowReactivate
    });
    ctx.user = result.user;
    ctx.isNewUser = result.isNew;
    // One-time welcome bonus for brand-new accounts. `isNew` is true only on the
    // update that created the user row, so this grants at most once per account.
    // Best-effort: a grant hiccup must never block the user's first interaction.
    const bonusCredits = env.WELCOME_BONUS_CREDITS ?? 0;
    if (result.isNew && bonusCredits > 0) {
      try {
        await ctx.services.credits.grant({
          userId: result.user.id,
          amountUnits: Math.round(bonusCredits * 100),
          type: "grant",
          provider: "welcome_bonus",
          metadata: { reason: "welcome_bonus" }
        });
      } catch (error) {
        log.warn({ error, userId: result.user.id }, "welcome_bonus_grant_failed");
      }
    }
    if (ctx.user.status === "deleted" && !allowReactivate) {
      await ctx.reply(
        "Аккаунт удален. Чтобы начать заново, отправьте /start.\n\nYour account is deleted. Send /start to begin again."
      );
      return;
    }
  }
  await next();
}
