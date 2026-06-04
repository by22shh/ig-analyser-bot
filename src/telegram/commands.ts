import type { Bot } from "grammy";
import { adminTelegramIds, env } from "../config/env.js";
import { childLogger } from "../config/logger.js";
import type { MyContext } from "./context.js";

const log = childLogger("commands");

type Cmd = { command: string; description: string };

const USER_COMMANDS_RU: Cmd[] = [
  { command: "start", description: "Главное меню" },
  { command: "analyze", description: "Анализ профиля Instagram" },
  { command: "photo", description: "Поиск профиля по фото" },
  { command: "history", description: "История отчётов" },
  { command: "balance", description: "Баланс и тарифы" },
  { command: "buy", description: "Пополнить кредиты" },
  { command: "settings", description: "Настройки" },
  { command: "help", description: "Помощь" },
  { command: "cancel", description: "Отменить текущий шаг" },
  { command: "delete_me", description: "Удалить мои данные" }
];

const USER_COMMANDS_EN: Cmd[] = [
  { command: "start", description: "Main menu" },
  { command: "analyze", description: "Analyze an Instagram profile" },
  { command: "photo", description: "Find a profile by photo" },
  { command: "history", description: "Report history" },
  { command: "balance", description: "Balance & pricing" },
  { command: "buy", description: "Top up credits" },
  { command: "settings", description: "Settings" },
  { command: "help", description: "Help" },
  { command: "cancel", description: "Cancel the current step" },
  { command: "delete_me", description: "Delete my data" }
];

const ADMIN_COMMANDS: Cmd[] = [
  { command: "admin", description: "Админка: статистика" },
  { command: "admin_grant", description: "Начислить кредиты пользователю" },
  { command: "admin_refund_stars", description: "Возврат оплаты Telegram Stars" }
];

function userCommands(list: Cmd[]): Cmd[] {
  // Hide the photo command from the menu when the feature is disabled.
  return list.filter((cmd) => cmd.command !== "photo" || env.FEATURE_PHOTO_SEARCH);
}

/**
 * Registers the Telegram command menu (the "/" autocomplete and the Menu
 * button). Without this, none of the bot's commands are discoverable. Localized
 * per language, with an extended set scoped to each admin's private chat.
 * Best-effort: a failure here must not prevent the bot from starting.
 */
export async function configureCommands(bot: Bot<MyContext>): Promise<void> {
  try {
    // Default (fallback for every locale without a specific list).
    await bot.api.setMyCommands(userCommands(USER_COMMANDS_RU));
    await bot.api.setMyCommands(userCommands(USER_COMMANDS_EN), { language_code: "en" });

    const adminMenu = [...userCommands(USER_COMMANDS_RU), ...ADMIN_COMMANDS];
    for (const id of adminTelegramIds) {
      // Per-admin chat scope; fails if the admin has never opened the bot — which
      // is fine and must not abort the rest of the setup.
      await bot.api
        .setMyCommands(adminMenu, { scope: { type: "chat", chat_id: id } })
        .catch((error) => log.warn({ error, adminId: id }, "set_admin_commands_failed"));
    }
    log.info("telegram_commands_registered");
  } catch (error) {
    log.warn({ error }, "set_commands_failed");
  }
}
