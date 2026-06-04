import type { NextFunction } from "grammy";
import type { MyContext } from "../context.js";

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
    if (ctx.user.status === "deleted" && !allowReactivate) {
      await ctx.reply(
        "Аккаунт удален. Чтобы начать заново, отправьте /start.\n\nYour account is deleted. Send /start to begin again."
      );
      return;
    }
  }
  await next();
}
