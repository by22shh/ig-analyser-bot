import { env } from "../../config/env.js";
import { InsufficientCreditsError } from "../../modules/billing/credits.service.js";
import { CB } from "../constants.js";
import type { MyContext } from "../context.js";
import { InlineKeyboard } from "grammy";
import { modeKeyboard } from "../keyboards/analysis.js";
import { backMenuKeyboard } from "../keyboards/main-menu.js";
import { paymentMethodsKeyboard } from "../keyboards/payments.js";
import { t } from "../locales/index.js";
import { sendHtml } from "./helpers.js";

export function registerPhotoHandlers(bot: import("grammy").Bot<MyContext>) {
  bot.command("photo", async (ctx) => openPhoto(ctx));
  bot.callbackQuery(CB.PHOTO, async (ctx) => {
    await ctx.answerCallbackQuery();
    await openPhoto(ctx);
  });
  bot.callbackQuery(CB.PHOTO_ACK, async (ctx) => {
    if (!ctx.user) return;
    await ctx.services.wizard.set(ctx.user.id, "waiting_photo");
    await ctx.answerCallbackQuery();
    await sendHtml(
      ctx,
      t(ctx.user.language).photoAsk(),
      new InlineKeyboard()
        .text(t(ctx.user.language).buttons.cancel, CB.CANCEL)
        .text(t(ctx.user.language).buttons.menu, CB.BACK_MAIN)
    );
  });
  bot.on(["message:photo", "message:document"], async (ctx, next) => {
    if (!ctx.user) {
      await next();
      return;
    }
    const state = await ctx.services.wizard.get(ctx.user.id);
    if (state?.state !== "waiting_photo") {
      await next();
      return;
    }
    const photo = ctx.message?.photo?.at(-1);
    const document = ctx.message?.document;
    const fileId = photo?.file_id ?? document?.file_id;
    const fileUniqueId = photo?.file_unique_id ?? document?.file_unique_id;
    const size = photo?.file_size ?? document?.file_size ?? 0;
    const mimeType = document?.mime_type ?? "image/jpeg";
    if (document && !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      await sendHtml(ctx, t(ctx.user.language).photoInvalidType());
      return;
    }
    if (!fileId || size > (env.PHOTO_UPLOAD_MAX_MB ?? 10) * 1024 * 1024) {
      await sendHtml(ctx, t(ctx.user.language).photoTooLarge(env.PHOTO_UPLOAD_MAX_MB ?? 10));
      return;
    }
    try {
      await ctx.services.photoSearch.createJob({
        userId: ctx.user.id,
        chatId: ctx.chat?.id,
        telegramFileId: fileId,
        telegramFileUniqueId: fileUniqueId,
        mimeType,
        sizeBytes: size
      });
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        await sendHtml(
          ctx,
          t(ctx.user.language).insufficientCredits(error),
          paymentMethodsKeyboard(t(ctx.user.language))
        );
        return;
      }
      throw error;
    }
    await ctx.services.wizard.clear(ctx.user.id);
    await sendHtml(ctx, t(ctx.user.language).photoAccepted());
  });
  bot.callbackQuery(new RegExp(`^${CB.PHOTO_ANALYZE}:([A-Za-z0-9._]+)$`), async (ctx) => {
    if (!ctx.user || !ctx.match?.[1]) return;
    await ctx.services.wizard.set(ctx.user.id, "selecting_mode", { username: ctx.match[1] });
    await ctx.answerCallbackQuery();
    await sendHtml(
      ctx,
      t(ctx.user.language).chooseMode(ctx.match[1]),
      modeKeyboard(t(ctx.user.language), ctx.services.users.isCompliance(ctx.user))
    );
  });
}

async function openPhoto(ctx: MyContext) {
  const messages = t(ctx.user?.language);
  if (!env.FEATURE_PHOTO_SEARCH) {
    await sendHtml(ctx, messages.photoDisabled(), backMenuKeyboard(messages));
    return;
  }
  await sendHtml(
    ctx,
    messages.photoIntro(),
    new InlineKeyboard()
      .text(messages.photoRightConfirm(), CB.PHOTO_ACK)
      .row()
      .text(messages.buttons.cancel, CB.CANCEL)
      .text(messages.buttons.menu, CB.BACK_MAIN)
  );
}
