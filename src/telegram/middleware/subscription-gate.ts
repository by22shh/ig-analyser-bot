import type { NextFunction } from "grammy";
import { env, isLocalRuntimeEnv } from "../../config/env.js";
import { childLogger } from "../../config/logger.js";
import { CB } from "../constants.js";
import type { MyContext } from "../context.js";
import { editOrSendHtml, renderMainMenu } from "../handlers/helpers.js";
import { subscriptionGateKeyboard } from "../keyboards/main-menu.js";
import { t } from "../locales/index.js";

const log = childLogger("subscription-gate");

// Membership is cached briefly so we do not call getChatMember on every update.
// A short TTL still detects an unsubscribe within a few minutes.
const CACHE_TTL_MS = 5 * 60 * 1000;
const membershipCache = new Map<string, { subscribed: boolean; checkedAt: number }>();

type MembershipApi = {
  getChatMember(chatId: string, userId: number): Promise<{ status: string; is_member?: boolean }>;
};

/** True when the channel-subscription gate is configured and turned on. */
export function subscriptionGateEnabled(): boolean {
  return env.FEATURE_REQUIRE_CHANNEL_SUB && Boolean(env.REQUIRED_CHANNEL_ID);
}

/** Telegram member statuses that count as an active subscription. */
export function memberStatusIsSubscribed(status: string): boolean {
  return status === "creator" || status === "administrator" || status === "member";
}

export function chatMemberIsSubscribed(member: { status: string; is_member?: boolean }): boolean {
  // A "restricted" member is still in the chat only when is_member is true.
  if (member.status === "restricted") return member.is_member === true;
  return memberStatusIsSubscribed(member.status);
}

function subscriptionCheckFailsOpen(): boolean {
  return isLocalRuntimeEnv(env.APP_ENV);
}

/** Test helper: drop the in-memory membership cache between cases. */
export function clearMembershipCache(): void {
  membershipCache.clear();
}

export async function telegramUserIsSubscribed(
  api: MembershipApi,
  telegramUserId: number | undefined,
  opts: { force?: boolean } = {}
): Promise<boolean> {
  const channelId = env.REQUIRED_CHANNEL_ID;
  // Dev/test stay permissive so local setup mistakes do not lock the app. In
  // production, a missing channel id is treated as unsafe misconfiguration.
  if (!channelId || telegramUserId === undefined) return subscriptionCheckFailsOpen();

  const key = `${channelId}:${telegramUserId}`;
  const now = Date.now();
  if (!opts.force) {
    const cached = membershipCache.get(key);
    if (cached && now - cached.checkedAt < CACHE_TTL_MS) return cached.subscribed;
  }

  try {
    const member = await api.getChatMember(channelId, telegramUserId);
    const subscribed = chatMemberIsSubscribed(member);
    membershipCache.set(key, { subscribed, checkedAt: now });
    return subscribed;
  } catch (error) {
    // Do not cache failures: the next action should retry the check after a
    // transient Telegram error or after bot admin rights are fixed.
    log.warn({ error, channelId, telegramUserId }, "channel_membership_check_failed");
    return subscriptionCheckFailsOpen();
  }
}

export async function userIsSubscribed(
  ctx: MyContext,
  opts: { force?: boolean } = {}
): Promise<boolean> {
  return telegramUserIsSubscribed(ctx.api, ctx.from?.id, opts);
}

export async function renderSubscriptionGate(
  ctx: MyContext,
  opts: { note?: boolean } = {}
): Promise<void> {
  if (!ctx.user) return;
  const messages = t(ctx.user.language);
  const body = messages.subscriptionRequired(env.CHANNEL_URL);
  const text = opts.note ? `${messages.subscriptionStillMissing()}\n\n${body}` : body;
  await editOrSendHtml(ctx, text, subscriptionGateKeyboard(messages));
}

/**
 * After consent, send the user to the main menu when the gate is disabled, they
 * are an admin, or they are subscribed; otherwise show the subscription gate.
 */
export async function proceedAfterConsent(
  ctx: MyContext,
  opts: { force?: boolean } = {}
): Promise<void> {
  if (!ctx.user) return;
  const bypass = !subscriptionGateEnabled() || ctx.services.users.isAdmin(ctx.user);
  if (bypass || (await userIsSubscribed(ctx, { force: opts.force }))) {
    await renderMainMenu(ctx);
    return;
  }
  await renderSubscriptionGate(ctx);
}

const EXEMPT_COMMANDS = new Set(["/start", "/menu"]);
const EXEMPT_CALLBACKS = new Set<string>([
  CB.ACCEPT_RULES,
  CB.DECLINE_RULES,
  CB.RESTART_ONBOARDING,
  CB.CHECK_SUB
]);

/** Onboarding and payment actions that must work without an active subscription. */
export function isSubscriptionExemptAction(ctx: MyContext): boolean {
  if (ctx.preCheckoutQuery || ctx.message?.successful_payment) return true;
  const command = ctx.message?.text?.trim().split(/\s+/, 1)[0];
  if (command && EXEMPT_COMMANDS.has(command)) return true;
  const data = ctx.callbackQuery?.data;
  if (data && (EXEMPT_CALLBACKS.has(data) || data.startsWith(`${CB.LANG}:`))) return true;
  return false;
}

export async function subscriptionGate(ctx: MyContext, next: NextFunction): Promise<void> {
  if (
    !ctx.user ||
    !ctx.user.consentAcceptedAt || // pre-consent is handled by consentGate
    !subscriptionGateEnabled() ||
    ctx.services.users.isAdmin(ctx.user) ||
    isSubscriptionExemptAction(ctx)
  ) {
    await next();
    return;
  }

  if (await userIsSubscribed(ctx)) {
    await next();
    return;
  }

  if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => undefined);
  await renderSubscriptionGate(ctx);
}
