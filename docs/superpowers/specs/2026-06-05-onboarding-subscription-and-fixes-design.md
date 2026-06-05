# Onboarding, channel-subscription gate & UX fixes — design

Date: 2026-06-05
Status: approved (chat brainstorming)

Three changes to the Telegram bot, bundled in one branch
(`feat/onboarding-subscription-and-back-fix`).

## 1. Bug: "Назад" in the Telegram Stars screen loops

**Symptom.** Opening "💎 Пополнить кредиты" shows the Stars package screen;
tapping "⬅️ Назад" does not return to the main menu — it re-renders the same
Stars screen.

**Root cause.** When only one payment method is enabled
(`FEATURE_TELEGRAM_STARS && !FEATURE_YOOKASSA_PAYMENTS`), `showPaywall`
(`handlers/profile.ts`) skips the method-chooser and renders the package list
directly. But `packageKeyboard` (`keyboards/payments.ts`) always wires
"⬅️ Назад" → `CB.PAYWALL` → `showPaywall` → the same Stars screen. Infinite
back-loop / dead end.

**Fix.** `packageKeyboard` chooses the back target by the number of enabled
payment methods:

- **2+ methods** → "⬅️ Назад" → `CB.PAYWALL` (method chooser) + "🏠 В меню"
  → `CB.BACK_MAIN` (unchanged).
- **1 method** → single "⬅️ Назад" → `CB.BACK_MAIN` (main menu); the redundant
  menu button is dropped.

Extract a pure helper `packageBackTarget(enabledMethodCount)` for unit testing.

## 2. Main-menu marketing hooks

Add an emoji question block to the top of `welcome()` (the main-menu text) in
both locales, framed to hook the user immediately:

RU:

- 💘 Понравилась девушка — хочешь узнать, чем она живёт и как лучше начать диалог?
- 🕵️ Познакомился с человеком и хочешь проверить, тот ли он, за кого себя выдаёт?
- 🤝 Есть бизнес-партнёр — хочешь понять, что он за человек?

EN:

- 💘 Like someone and want to know what they're into and how to break the ice?
- 🕵️ Just met someone and want to check who they really are?
- 🤝 Got a business partner and want to read them as a person?

The rest of `welcome()` (bonus line, "Вы получите", balance, language) is kept.
Snapshot `messages.test.ts` is regenerated.

## 3. Onboarding flow + channel-subscription gate

Today language + consent share one screen, there is no decline button, and there
is no channel-subscription enforcement. Rebuild as a linear wizard and add a gate.

### Step 1 — Language (first thing on `/start` for users without consent)

`chooseLanguage()` + `languageKeyboard()` → [🇷🇺 Русский] [🇬🇧 English]
(`CB.LANG:ru|en`). Picking a language advances to step 2.

### Step 2 — Agreement

`startNeedsConsent()` (trailing "choose language" line removed) +
`consentKeyboard()` → [✅ Принимаю] (`CB.ACCEPT_RULES`) [❌ Отказаться]
(`CB.DECLINE_RULES`), plus a "☑️ Правила" link to `TOS_URL`.

- **Accept** → `acceptConsent` → proceed to step 3 (subscription) or main menu.
- **Decline** → `consentDeclined()` + [🔁 Начать заново] (`CB.RESTART_ONBOARDING`).
  Soft block: consent stays unset so everything else remains gated; `/start` or
  the restart button reopens the wizard from step 1. No DB migration.

### Step 3 — Channel subscription

After consent, if not subscribed: `subscriptionRequired()` +
`subscriptionGateKeyboard()` → [📢 Подписаться](`CHANNEL_URL`)
[✅ Я подписался] (`CB.CHECK_SUB`). "Я подписался" forces a fresh check
(bypassing cache): subscribed → main menu; otherwise re-show the gate.

### Ongoing enforcement (detect unsubscribe)

New middleware `subscriptionGate`, registered after `consentGate`. On each
non-exempt action it verifies membership via `ctx.api.getChatMember(channelId,
userId)` with a **~5-minute in-memory cache** keyed by Telegram id, so a user who
unsubscribes is re-gated within ~5 minutes.

- **Subscribed statuses:** creator, administrator, member, restricted (only when
  `is_member`).
- **Not subscribed:** left, kicked → gate.
- **API error** (transient / bot lacks admin): **fail-open** (allow) and do not
  cache, so we never lock everyone out on misconfig; logged at warn.
- **Exempt from the gate:** `/start`, `/menu`, `LANG:*`, `ACCEPT_RULES`,
  `DECLINE_RULES`, `RESTART_ONBOARDING`, `CHECK_SUB`, pre-checkout / successful
  payment, and **admins**.

`ACCEPT_RULES`, `CHECK_SUB`, and `/start` (when already consented) route through
a shared `proceedAfterConsent(ctx, {force})` that renders the menu when
subscribed/exempt or the subscription gate otherwise.

### Config

- `FEATURE_REQUIRE_CHANNEL_SUB` (bool, **default false** → inert in dev/tests).
- `REQUIRED_CHANNEL_ID` (string, optional). Effective channel id =
  `REQUIRED_CHANNEL_ID` || `@username` parsed from `CHANNEL_URL`
  (→ `@homie_tech`).
- Enabled in `.env.production.local`; documented in `.env.example`.
- Requires the bot to be an **administrator** of the channel (confirmed).

## Testing

- `packageBackTarget` (1 vs 2+ methods) + single-method `packageKeyboard` row.
- `memberStatusIsSubscribed` classification, channel-id resolution, and the gate
  middleware allow/block decision with a stubbed `getChatMember` (incl.
  fail-open on error and the 5-min cache).
- Updated `consent-gate` expectations and regenerated `messages.test.ts`
  snapshots.
- `pnpm lint` + `pnpm test` green.
