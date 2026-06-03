import type { Bot } from "grammy";
import type { MyContext } from "../context.js";
import { registerAdminHandlers } from "./admin.js";
import { registerAnalyzeHandlers } from "./analyze.js";
import { registerChatHandlers } from "./chat.js";
import { registerHistoryHandlers } from "./history.js";
import { registerPaymentHandlers } from "./payments.js";
import { registerPhotoHandlers } from "./photo.js";
import { registerProfileHandlers } from "./profile.js";
import { registerStartHandlers } from "./start.js";

export function registerHandlers(bot: Bot<MyContext>) {
  registerStartHandlers(bot);
  registerProfileHandlers(bot);
  registerPaymentHandlers(bot);
  registerAnalyzeHandlers(bot);
  registerHistoryHandlers(bot);
  registerPhotoHandlers(bot);
  registerChatHandlers(bot);
  registerAdminHandlers(bot);
}
