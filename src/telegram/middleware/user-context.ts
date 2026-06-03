import type { NextFunction } from "grammy";
import type { MyContext } from "../context.js";

export async function userContext(ctx: MyContext, next: NextFunction) {
  const from = ctx.from;
  if (from) {
    const result = await ctx.services.users.upsertTelegramUser({
      id: from.id,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      languageCode: from.language_code
    });
    ctx.user = result.user;
    ctx.isNewUser = result.isNew;
  }
  await next();
}
