# User journeys, Telegram flows and Mini App audit

Дата: 2026-06-12  
Phase: 3 — Audit User Journeys  
Scope: Telegram bot flows, RU/EN copy, Mini App local/mock visual smoke, empty/error/payment states.

## Verdict

Нормальный paid-analysis путь продуман и тестируем: onboarding gates, consent, subscription, username -> mode -> goal -> confirm -> job, credits/paywall, report history, sections, artifacts and report chat are all represented in handlers/tests/UI. Targeted Telegram/Mini App tests passed.

Главный UX вывод: продукт уже выглядит рабочим, но не "best-in-class" по полировке. Mini App в RU режиме местами показывает hardcoded English labels (`1 CREDIT · PDF · AI CHAT`, `Followers`, `Posts`), payment failure UX mostly falls back to a generic toast, and screenshots were taken through a local mock server because the in-app Browser blocked localhost while standalone Chrome worked. None of these blocked the paid path in tests, but they are launch-polish gaps.

## Test and screenshot setup

- Backend tests: real Vitest targeted suite.
- Visual smoke: local mock server on `127.0.0.1:4317` serving the real `public/mini-app` assets and fake `/api/mini-app/*` responses.
- Browser engine: system Google Chrome via Playwright. The Codex in-app Browser plugin was attempted first but returned `net::ERR_BLOCKED_BY_CLIENT` for localhost/127.0.0.1 in this session.
- No production provider calls were made during this phase.

## Screenshots

| File                                           | Viewport | State                                                       |
| ---------------------------------------------- | -------: | ----------------------------------------------------------- |
| `screenshots/01-mobile-analyze.png`            |  390x844 | Mobile analyze tab with active/recent jobs                  |
| `screenshots/02-desktop-analyze.png`           | 1280x800 | Desktop/wide analyze layout                                 |
| `screenshots/03-mobile-report-detail-chat.png` |  390x844 | Report detail, metrics, sections, exports/sources/chat area |
| `screenshots/04-mobile-credits-payment.png`    |  390x844 | Credits and Telegram Stars payment package                  |
| `screenshots/05-mobile-consent-gate.png`       |  390x844 | Consent/rules gate                                          |
| `screenshots/06-mobile-subscription-gate.png`  |  390x844 | Required channel subscription gate                          |
| `screenshots/07-mobile-empty-reports.png`      |  390x844 | Empty report history                                        |
| `screenshots/08-mobile-en-settings.png`        |  390x844 | English settings/profile tab                                |

Console diagnostics from the mock run:

- Telegram WebApp warnings: `Header color is not supported in version 6.0` and `Background color is not supported in version 6.0`; these come from the local browser's Telegram stub/version and are non-blocking.
- One 404 resource in the first run, consistent with favicon/static incidental lookup; no pageerror or app fatal error was captured.

## Telegram journey checklist

| Journey                  | Status                                            | Evidence                                                                          | Notes                                                                                                              |
| ------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/start` onboarding      | PASS                                              | `src/telegram/handlers/start.ts`, consent/language keyboards, snapshots           | Language selection precedes consent for new users; consent decline soft-blocks.                                    |
| Main menu                | PASS                                              | `renderMainMenu()` in `src/telegram/handlers/helpers.ts`; snapshot tests          | Shows balance, report capabilities, Mini App button, payment/history/profile/settings routes.                      |
| Analyze by username/link | PASS                                              | `src/telegram/handlers/analyze.ts`; targeted analysis tests                       | Wizard states cover username, mode, HR position, goal, confirmation and stale request id.                          |
| Photo search consent     | PASS when feature enabled; SKIPPED in prod config | `src/telegram/handlers/photo.ts`; `FEATURE_PHOTO_SEARCH=false` in `fly.toml`      | Disabled state is explicit; when enabled it requires right-to-use-image acknowledgement and file type/size checks. |
| Report history           | PASS                                              | `src/telegram/handlers/history.ts`; report keyboards                              | Empty history and section navigation exist; artifacts have Telegram file-id reuse/link fallback.                   |
| Report chat              | PASS                                              | `src/telegram/handlers/chat.ts`                                                   | Uses report_chat wizard state and update-id idempotency to avoid duplicate paid chat charges.                      |
| Credits/paywall          | PASS                                              | `src/telegram/handlers/payments.ts`; `tests/snapshots/messages.test.ts`           | Insufficient credits routes to payment methods; package visibility tests cover hidden packages.                    |
| Telegram Stars           | PASS                                              | `pre_checkout_query`, `message:successful_payment`, invoice reuse                 | Provider contract audited further in phase 5.                                                                      |
| YooKassa                 | PASS when enabled; SKIPPED in current Fly config  | `FEATURE_YOOKASSA_PAYMENTS=false`; handler has email receipt gate and return page | Not a launch blocker if product intentionally uses Stars first.                                                    |
| Settings                 | PASS                                              | `src/telegram/handlers/profile.ts`, locale settings copy                          | Language/export/retention settings exist; Mini App settings also available.                                        |
| Cancellation/reset       | PASS                                              | `CB.CANCEL`, `CB.BACK_MAIN`, `/start`, wizard clear                               | Cancels active wizard and returns to menu.                                                                         |
| Admin boundaries         | PASS                                              | `src/telegram/handlers/admin.ts`, `src/telegram/commands.ts`                      | Admin commands are scoped; audit logs attempted for grant/refund paths.                                            |

## Mini App state checklist

| State                           | Status                | Evidence                                                                                               | Notes                                                                                      |
| ------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Loading                         | PASS                  | `renderLoading()` and initial `index.html` loading state                                               | The static shell shows loading before bootstrap.                                           |
| Consent gate                    | PASS                  | screenshot `05-mobile-consent-gate.png`, `/api/mini-app/bootstrap` pre-consent data minimization test  | Bootstrap before consent returns gate data only.                                           |
| Unauthorized/missing initData   | PASS                  | `tests/unit/mini-app-api.test.ts` asserts `INIT_DATA_MISSING` outside local runtime                    | Local dev can use `x-mini-app-dev-user`; production requires signed initData.              |
| Expired auth                    | PASS                  | `AUTH_DATE_EXPIRED` test and `renderSessionExpired()`                                                  | Distinct session-expired UI exists.                                                        |
| Subscription required           | PASS                  | screenshot `06-mobile-subscription-gate.png`; subscription tests                                       | API blocks direct analysis when channel subscription is required and missing.              |
| Analyze form                    | PASS                  | screenshots `01`/`02`; `/api/mini-app/analysis` tests                                                  | Username, goal, mode, HR position, OSINT lawful basis are present.                         |
| Active/recent jobs              | PASS                  | screenshot `01-mobile-analyze.png`                                                                     | Active and completed job items render in local mock.                                       |
| Empty reports                   | PASS                  | screenshot `07-mobile-empty-reports.png`                                                               | Empty state exists and is concise.                                                         |
| Report detail/chat              | PASS                  | screenshot `03-mobile-report-detail-chat.png`                                                          | Sections, metrics, artifacts, sources and chat UI render.                                  |
| Credits/payment packages        | PASS with copy caveat | screenshot `04-mobile-credits-payment.png`; package DTO reviewed                                       | Real API provides `starsAmount`; mock fixture issue produced `undefined`, not code defect. |
| Payment pending/success/failure | PASS/POLISH GAP       | API paths and Telegram handlers exist; YooKassa return HTML exists; Mini App API failures map to toast | Failure UI is generic for several payment failures; consider dedicated copy.               |
| Long content                    | PASS with watch item  | report detail screenshot fullPage 1626px; CSS has wrapping/scrolling blocks                            | Need real long report visual regression before declaring best-in-class.                    |

## RU/EN copy and HTML safety

| Check                     | Status     | Evidence                                                                                     | Notes                                                                                 |
| ------------------------- | ---------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| RU/EN locale coverage     | PASS       | `src/telegram/locales/ru.ts`, `src/telegram/locales/en.ts`; snapshot tests passed            | Major bot flows have both locales.                                                    |
| HTML escaping             | PASS       | `escapeHtml()` used through dynamic locale methods; handlers use `sendHtml`/`editOrSendHtml` | Dynamic username, goal, report sections, links and email are escaped.                 |
| Telegram chunking         | PASS       | `src/telegram/handlers/helpers.ts` uses `chunkText()` before HTML send/edit                  | Long reports avoid Telegram message length limits.                                    |
| Broken placeholders       | PASS       | Snapshot tests and static review                                                             | No obvious raw template placeholders in sampled surfaces.                             |
| Mini App localization     | POLISH GAP | screenshots `01`, `03`; `public/mini-app/app.js`                                             | RU UI contains hardcoded English labels: `1 CREDIT`, `AI CHAT`, `Followers`, `Posts`. |
| Unsafe frontend injection | PASS       | `esc()`/`escAttr()` used in report items, section body, sources and chat bubbles             | `innerHTML` is used, but dynamic content is escaped in reviewed paths.                |

## UX blockers and severity

| Severity | Finding                                                         | Impact                                                                                   | Recommendation                                                                                                      |
| -------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| P1       | No P0/P1 blocker found in normal paid analysis path             | Users can proceed from onboarding to paid analysis in tested flows                       | Keep as launch condition: targeted tests and CI must stay green.                                                    |
| P2       | Mini App RU copy has English hardcoded labels                   | Lowers perceived polish in a Russian-first product                                       | Move `CREDIT`, `PDF · AI CHAT`, `Followers`, `Posts` into `copy` and localize.                                      |
| P2       | Mini App payment/API failure feedback is often generic          | Users may not understand whether payment failed, is pending, unavailable, or needs retry | Add explicit UI states/copy for payment pending, payment unavailable, invoice open, invoice failed, email required. |
| P2       | Visual smoke used mock data, not a full app server with real DB | Good UI confidence, weaker end-to-end confidence                                         | Add Playwright smoke tests against `createApp` + test DB/service fixtures in CI.                                    |
| P3       | Telegram WebApp API warnings in standalone browser              | Not visible in real Telegram shell, but noisy in local smoke logs                        | Guard `setHeaderColor`/`setBackgroundColor` by WebApp version or ignore in browser tests.                           |

## Mandatory command summary

Logs: `docs/audit/2026-06-12-deep-product-audit/commands/phase-3/`

| Exit | Duration | Command                                          | Log                       |
| ---: | -------: | ------------------------------------------------ | ------------------------- |
|    0 |       3s | targeted Telegram/Mini App/snapshot Vitest suite | `commands/phase-3/01.log` |
|    0 |       4s | `pnpm typecheck`                                 | `commands/phase-3/02.log` |
|    0 |       3s | `pnpm lint`                                      | `commands/phase-3/03.log` |

Targeted Vitest result: 7 files passed, 34 tests passed.

## Patch summary

No production code patch was applied in phase 3. Findings are UX polish gaps rather than blockers that prevent a normal user from completing the paid analysis path.
