# Phase 11: Mini App UX Polish

Дата: 2026-06-13 Asia/Novosibirsk

## Что изменено

Mini App получил более аккуратную RU/EN-локализацию, явные состояния оплаты и API-ошибок, безопасные guards для Telegram WebApp API и воспроизводимый visual smoke на локальных фикстурах.

## Deliverables

- `public/mini-app/app.js`
- `public/mini-app/styles.css`
- `scripts/smoke/mini-app-visual-smoke.ts`
- package script `smoke:mini-app-ui`
- screenshots under `docs/audit/2026-06-12-fix-all-problems/screenshots/phase-11/`

## UX / copy diff

- Русский режим больше не показывает hardcoded `credit`, `Followers`, `Posts`, `AI chat`, `Signal map`, `No sources`.
- Добавлены empty-state hints для задач, отчетов и недоступных способов оплаты.
- Добавлены user-facing сообщения для `EMAIL_REQUIRED`, `PAYMENT_METHOD_UNAVAILABLE`, `PAYMENT_PROVIDER_UNAVAILABLE`, `PAYMENT_REQUEST_CONFLICT`, `INSUFFICIENT_CREDITS`, `USERNAME_INVALID`, `REQUEST_IN_PROGRESS`, `QUESTION_INVALID`, `REPORT_NOT_FOUND`, `ARTIFACT_NOT_FOUND`, `LAWFUL_BASIS_REQUIRED`, `MODE_UNAVAILABLE`, `SUBSCRIPTION_REQUIRED`, `ACCOUNT_DELETED`, `CONSENT_REQUIRED`, `401`, `403`, `429` и `5xx`.
- Статусы задач (`queued`, `fetching_profile`, `analyzing_images`, `generating_exports`, `retrying`, `completed`, `failed`) теперь локализуются перед показом в карточке задачи.
- Payment UX теперь показывает persistent notice: подготовка платежа, счет открыт, ссылка открыта, ожидание подтверждения, отмена, ошибка, email required и retryable provider failure.

## Telegram WebApp guards

Optional WebApp calls теперь проверяются по методу и версии:

- `ready`
- `expand >= 6.0`
- `setHeaderColor >= 6.1`
- `setBackgroundColor >= 6.1`
- `openInvoice >= 6.1`
- `openLink >= 6.1`
- `HapticFeedback >= 6.1`

Visual smoke использует stub `version: "6.0"`, чтобы проверять fallback-safe поведение без реального Telegram WebView.

## Visual smoke

`pnpm smoke:mini-app-ui` поднимает локальный static/API fixture server, открывает Mini App через Playwright Chromium, проверяет отсутствие горизонтального overflow и сохраняет скриншоты:

- `docs/audit/2026-06-12-fix-all-problems/screenshots/phase-11/mini-app-mobile-empty-reports.png`
- `docs/audit/2026-06-12-fix-all-problems/screenshots/phase-11/mini-app-desktop-long-report.png`
- `docs/audit/2026-06-12-fix-all-problems/screenshots/phase-11/mini-app-mobile-payment-error.png`

Скриншоты просмотрены вручную: текст не налезает, длинный отчет читается, payment notice остается видимым без перекрытия toast.

## Validation

Command logs are under `docs/audit/2026-06-12-fix-all-problems/commands/phase-11/`.

| Command                                                                                                                            | Exit | Log                     |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---: | ----------------------- |
| `pnpm exec vitest run tests/unit/mini-app-api.test.ts tests/unit/mini-app-auth.test.ts tests/snapshots/messages.test.ts`           |    0 | `vitest-mini-app.log`   |
| `pnpm typecheck`                                                                                                                   |    0 | `typecheck.log`         |
| `pnpm lint`                                                                                                                        |    0 | `lint.log`              |
| `pnpm smoke:mini-app-ui`                                                                                                           |    0 | `smoke-mini-app-ui.log` |
| `pnpm exec prettier --check public/mini-app/app.js public/mini-app/styles.css scripts/smoke/mini-app-visual-smoke.ts package.json` |    0 | terminal check          |

## Cleanliness

- Focused phase scan: `no console.log/error or TODO/FIXME in phase-11 UI/smoke files`.
- Full baseline added-lines scan contains expected false positives from `.supergoal/PROTOCOL.md` text and earlier CLI scripts that print intentional stdout/stderr; no phase-11 UI debug output was found.
- Changed files since baseline: 247, including prior phases and generated audit evidence.
