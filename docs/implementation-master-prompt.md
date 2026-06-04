# Master prompt for full implementation

Ниже готовый промпт для coding agent / нейросети-разработчика, которая должна взять этот репозиторий и довести Telegram-бота для Instagram-анализа до production-ready реализации по имеющимся спецификациям.

Скопируй промпт целиком и передай агенту в корне репозитория `/Users/Bayramov_N/Desktop/Other/ig-analyser-telegram-bot`.

````text
Ты senior full-stack/backend engineer и coding agent. Твоя задача - полностью реализовать Telegram-бота для Instagram-анализа в репозитории:

/Users/Bayramov_N/Desktop/Other/ig-analyser-telegram-bot

Работай автономно, глубоко, последовательно и до конца. Не ограничивайся scaffold, заглушками или частичной реализацией. Итог должен быть production-ready MVP с тестами, документацией, миграциями, платежами, очередью, отчетами, экономическим аудитом и понятным локальным запуском. Если внешние API-ключи отсутствуют, реализуй реальные adapters behind interfaces и полноценные mock/stub режимы, чтобы весь end-to-end UX проходил локально без секретов.

## 0. Обязательное чтение перед кодом

Сначала полностью прочитай и законспектируй для себя эти документы:

1. `README.md`
2. `SPECIFICATION.md`
3. `docs/source-project-analysis.md`
4. `docs/financial-model.md`
5. `docs/sibling-bot-ux-reference.md`
6. `.env.example`

Также изучи sibling repo:

`/Users/Bayramov_N/Desktop/Other/ai-assistant-bot`

Из sibling repo перенеси только применимые UX/экономические практики, не копируй нерелевантный функционал. Особенно изучи:

- `app/texts/ru.py`
- `app/keyboards/inline.py`
- `app/handlers/start.py`
- `app/handlers/profile.py`
- `app/handlers/payments.py`
- `app/handlers/helpers.py`
- `app/billing.py`
- `app/economics.py`
- `scripts/audit_prices.py`
- `app/services/credits.py`
- `app/services/payments/yookassa.py`
- `app/web/yookassa.py`

Не изменяй `ig-analyser-site` и `ai-assistant-bot`. Они являются источниками анализа/reference, а не рабочими репозиториями.

## 1. Главная цель

Разработать Telegram-бота, который переносит содержательный функционал Instagram-аналитики в Telegram:

- анализ публичного Instagram username / profile URL;
- поиск возможного Instagram-профиля по фото;
- режимы: standard, influencer, HR behind feature flag, OSINT/compliance only role-gated;
- Apify profile/post fetch;
- анализ до 30 последних постов;
- vision-анализ изображений пачками;
- финальный LLM report с валидируемыми секциями;
- источники и source map;
- метрики, Digital Footprint, Digital Circle;
- Telegram summary, секции, PDF/Markdown export;
- HTML export for future dashboard/Mini App and shareable artifacts;
- чат по готовому отчету;
- история отчетов;
- RU/EN localization;
- retention settings and deletion jobs;
- credits ledger;
- Telegram Stars;
- YooKassa;
- refunds;
- admin tools;
- observability;
- safety/compliance;
- `audit-economics`.

Функциональная parity с сайтом обязательна содержательно, но UX должен быть Telegram-native. Визуальный web dashboard сайта не переносится один-в-один.

## 2. Обязательный tech stack

Используй стек из спецификации:

- TypeScript;
- Node.js 20+;
- Telegram framework: `grammy`;
- HTTP server: Fastify;
- ORM: Prisma;
- PostgreSQL;
- Redis;
- BullMQ;
- S3-compatible storage adapter;
- Playwright/Chromium for HTML-to-PDF;
- test runner: Vitest;
- lint/format: ESLint + Prettier;
- runtime env validation: Zod or equivalent.
- Dockerfile / production process definitions for server and worker.
- CI workflow or documented CI command set that runs lint, typecheck, tests and `audit-economics`.

Если выбираешь альтернативу внутри допустимых вариантов, зафиксируй причину в README/dev docs. Не меняй стек без крайней необходимости.

## 3. Непереговорные архитектурные правила

1. Telegram handlers тонкие: parse input, validate, update FSM, call service, render response.
2. Business logic находится в services/modules, не в callback handlers.
3. Provider-specific code находится только в adapters:
   - Apify adapter;
   - LLM/OpenRouter adapter;
   - FaceCheck adapter;
   - YooKassa adapter;
   - Telegram Stars adapter;
   - S3/storage adapter;
   - PDF adapter.
4. Все секреты только на сервере, никогда в client/user messages/logs.
5. Long-running work только через BullMQ workers.
6. Telegram webhook/update должен отвечать быстро.
7. Все user-facing тексты через locale/message helpers.
8. Dynamic content HTML-escaped.
9. Long Telegram output chunked. Keyboard только на последнем chunk.
10. Все prompts версионированы в `src/prompts`.
11. Никакого raw base64 в БД/logs.
12. Не мутируй ledger rows задним числом. Все изменения баланса через transactions.
13. Любое начисление credits после платежа idempotent exactly once.
14. Любая внешняя стоимость пишется в `api_usage_events`.
15. Реальные providers включаются через env/feature flags, mock mode должен работать всегда.
16. Все money/credits mutations должны выполняться транзакционно. При списании credits используй row-level locking или эквивалентную защиту от гонок.
17. `idempotency_key`, provider IDs и event IDs должны иметь DB unique constraints, не только application-level checks.

## 4. UX должен быть похож на ai-assistant-bot

Соблюдай `docs/sibling-bot-ux-reference.md`.

Обязательно:

- HTML parse mode для bot-authored formatted messages.
- `/start` сразу показывает account state + главное меню.
- Главное меню inline-keyboard based.
- `Назад`, `Отменить`, `В меню` есть во всех wizard-сценариях.
- `/balance`, `/credits`, `/buy`, `/topup`, `/cancel`, `/reset`.
- `/settings` для языка, report format и retention.
- Profile screen похож на sibling bot: name, ID, settings, credits, referral/share if enabled.
- Paywall Stars-first.
- Если включены Stars + YooKassa, сначала method picker.
- Если включен только Stars, сразу Stars packages.
- Insufficient credits -> объяснение + top-up keyboard.
- `/help` показывает support, terms, privacy, `/delete_me`.
- Snapshot tests должны защищать формат `/start`, profile, paywall, insufficient credits, report actions.

Не переносить напрямую:

- свободный выбор LLM-модели пользователем;
- daily free expensive reports;
- бесплатный regenerate отчета;
- TTS/image-generation/general chat ассистента;
- arbitrary custom credits в MVP.

## 5. Safety/compliance

Соблюдай спецификацию:

- анализируем только публичные данные;
- private profiles не анализируем;
- OSINT/compliance не публичный режим MVP;
- HR mode behind feature flag and disclaimer;
- нельзя помогать преследованию, доксингу, угрозам, давлению, обходу приватности;
- photo search требует подтверждения права использовать изображение;
- photo search results показываются как possible matches, not identity certainty;
- sensitive outputs формулируются как hypotheses/signals/checks;
- `/delete_me` удаляет/анонимизирует данные по retention policy;
- uploaded photos deleted after photo search completes or within configured TTL;
- report retention defaults to `.env.example` value and can be changed only within allowed policy;
- audit trail для risky modes.

Если требование UX конфликтует с compliance, compliance важнее.

## 6. Финансовая модель и no-loss guardrails

Соблюдай `docs/financial-model.md`.

Обязательные переменные и defaults:

- `ECON_USD_TO_RUB_BUFFER=90`
- `ECON_PAYMENT_FEE_RESERVE=0.20`
- `ECON_STARS_USD_PER_STAR_PAYOUT_FLOOR=0.01`
- `ECON_STARS_PAYOUT_RESERVE=0.20`
- `ECON_TARGET_REVENUE_MULTIPLE=3`
- `ECON_COST_BASIS=p75`

Обязательно реализуй:

- `src/modules/economics`;
- `scripts/audit-economics.ts`;
- `pnpm audit-economics`;
- CI/npm script that fails on economics drift.

`audit-economics` должен падать, если:

- provider costs missing;
- runtime caps exceed modeled caps;
- public package reduces net RUB-equivalent/credit floor too low;
- any enabled public mode does not cover p75/worst-case provider cost by 3x;
- Stars payout floor/reserve not modeled;
- YooKassa reserve not modeled;
- free/admin grants counted as revenue.

Pricing:

- Stars Start: 690 XTR / 3 credits.
- Stars Pro: 2300 XTR / 10 credits.
- Stars Agency: 6900 XTR / 30 credits.
- Stars Scale hidden.
- YooKassa Start: 690 RUB / 3 credits public only if audit passes.
- YooKassa Pro/Agency/Scale hidden or feature-gated until audit passes or repriced.

At `C_standard=55 RUB`, Stars at `230 XTR/credit` barely passes. Do not discount Stars in MVP.

## 7. Payments

### 7.1. Telegram Stars

Implement first-class Stars support:

- package catalog in XTR;
- `sendInvoice(currency=XTR, provider_token="", prices=[one item])`;
- `pre_checkout_query` handler;
- `successful_payment` handler;
- `refundStarPayment`;
- `telegram_star_payments` persistence;
- idempotent grant by `telegram_payment_charge_id`;
- no credits on pre-checkout;
- duplicate successful_payment is no-op;
- Stars finance/export fields.

### 7.2. YooKassa

Implement YooKassa:

- create internal order first;
- create YooKassa payment with idempotency key;
- redirect confirmation URL;
- receipt email collection if receipts enabled;
- webhook endpoint;
- server-to-server payment/refund status fetch before credit mutation;
- idempotent credit grant on `payment.succeeded`;
- `payment.canceled` no grant;
- refund flow for unused credits;
- chargeback/dispute admin flow: freeze account/balance and write manual adjustment, never mutate historical ledger rows;
- duplicate webhook no double credit;
- raw event persisted with redaction;
- YooKassa IP allowlist/status reconciliation where configured;
- 54-FZ receipt payload preparation and receipt status storage when receipts are enabled;
- YooKassa fees in finance exports.

## 8. Data model

Implement Prisma schema matching `SPECIFICATION.md` section 11, including at least:

- users;
- user_settings;
- credit_accounts;
- credit_transactions;
- credit_packages;
- credit_package_prices;
- payment_orders;
- payment_events;
- yookassa_payments;
- telegram_star_payments;
- payment_refunds;
- fiscal_receipts;
- analysis_jobs;
- instagram_profile_snapshots;
- instagram_post_snapshots;
- vision_analysis_items;
- reports;
- report_sections;
- report_artifacts;
- photo_search_jobs;
- photo_search_matches;
- report_chat_sessions;
- report_chat_messages;
- api_usage_events;
- audit_logs.

Use integer minor units for credits: `1 credit = 100 credit_units`.

Use unique constraints for payment/provider IDs and event idempotency.

Add migrations, seed data for initial package catalog, and repeatable local reset/dev seed commands.

## 9. Analysis pipeline

Implement pipeline:

1. Normalize username.
2. Create/reserve analysis job.
3. Enqueue BullMQ job.
4. Fetch Instagram profile/posts via Apify adapter.
5. Persist profile/post snapshots.
6. Fetch/process images with caps.
7. Run vision analysis in batches.
8. Build metadata context.
9. Generate final report through LLM adapter.
10. Parse/validate required sections.
11. Compute metrics and Digital Circle.
12. Persist report/sections/source map.
13. Generate Markdown export.
14. Generate HTML export.
15. Generate PDF via Playwright worker.
16. Capture credits only when policy says operation succeeded.
17. Notify user with summary and action buttons.

Default caps:

- `ANALYSIS_POST_LIMIT=30`
- `VISION_BATCH_SIZE=5`
- `ANALYSIS_MAX_IMAGES_ANALYZED=30`
- `ANALYSIS_MAX_IMAGE_DOWNLOAD_MB=8`
- configured LLM token budgets;
- `FACECHECK_TIMEOUT_SECONDS=90`
- `PDF_RENDER_TIMEOUT_SECONDS=60`

Mock worker must allow full flow from `/start` -> analysis -> report ready without external APIs.

## 10. Reports

Telegram summary must be compact:

- username;
- mode;
- metrics;
- short conclusion;
- action buttons.

Full report:

- sections from spec;
- sources;
- source map;
- HTML export;
- PDF;
- Markdown fallback;
- report chat.

Required standard sections include all 17 sections from `SPECIFICATION.md`.

Influencer and HR sections must match spec. OSINT/compliance must be role-gated.

## 11. Photo search

Implement:

- `/photo`;
- photo/document upload validation;
- Telegram `getFile`;
- size/mime checks;
- FaceCheck adapter behind feature flag;
- mock mode;
- matches list with candidate username, confidence, source/domain;
- buttons: analyze, open Instagram, not this person;
- safe wording: possible matches, not certainty;
- selected candidate starts username analysis confirmation.

## 12. Chat by report

Implement:

- report chat sessions;
- quick questions;
- context from completed report only;
- daily/message limits;
- paid/included message policy;
- no raw prompt leakage;
- safety restrictions;
- action buttons after answer.

## 13. Admin

Implement admin tools:

- admin identity from env;
- stats;
- active/failed jobs;
- user lookup;
- grant/revoke/adjust credits;
- retry failed jobs;
- inspect payment orders;
- reconcile YooKassa by provider payment ID;
- reconcile Stars by `telegram_payment_charge_id`;
- initiate refunds for unused credits;
- export CSV/JSON finance and usage data.

All admin actions must be audit-logged.

## 14. Observability

Implement:

- structured logs;
- request/update/job correlation IDs;
- Sentry optional;
- OpenTelemetry optional;
- metrics for:
  - webhook latency;
  - queue wait/duration;
  - provider success/failure;
  - LLM tokens;
  - Apify/FaceCheck calls;
  - payment conversion;
  - Stars/YooKassa failures;
  - provider costs;
  - gross margin.

Logs must never contain:

- bot token;
- YooKassa secret;
- API keys;
- full raw payment credentials;
- raw base64 images;
- full report content in info logs.

## 15. Project structure

Use structure close to:

```text
src/
  app.ts
  server.ts
  config/
  telegram/
  modules/
    users/
    billing/
    economics/
    payments/
    analysis/
    instagram/
    vision/
    llm/
    photo-search/
    reports/
    chat/
    admin/
    observability/
  jobs/
  prompts/
  db/
  tests/
scripts/
  audit-economics.ts
prisma/
docker-compose.yml
````

Add/update README with exact local commands.

## 16. Implementation order

Work in phases, but continue until the full MVP is complete.

### Phase 0 - Foundation

- package.json;
- TypeScript config;
- lint/format/test;
- Docker Compose PostgreSQL/Redis;
- Dockerfile for app image;
- env validation;
- logger;
- Prisma schema/migrations;
- Fastify server;
- health checks;
- basic app bootstrap.

### Phase 1 - Telegram UX

- grammy bot;
- webhook and long polling mode;
- duplicate update protection;
- user middleware;
- locale/message catalog;
- inline keyboards;
- `/start`;
- `/menu`;
- `/profile`;
- `/balance`;
- `/credits`;
- `/buy`;
- `/topup`;
- `/help`;
- `/settings`;
- `/cancel`;
- `/reset`;
- consent;
- RU/EN locale coverage for all implemented screens;
- sibling-like snapshots.

### Phase 2 - Credits/economics

- credit accounts;
- ledger;
- admin grants;
- package catalog;
- economics module;
- `audit-economics`;
- insufficient credits flow.

### Phase 3 - Mock analysis E2E

- username normalization;
- analysis wizard;
- job queue;
- mocked analysis worker;
- mocked report;
- history;
- report browsing;
- `/settings` for language/report format/retention;
- Markdown export.

### Phase 4 - Real analysis adapters

- Apify adapter;
- image fetch/resize;
- LLM/vision adapter;
- prompt registry;
- report parser/validator;
- metrics/Digital Circle;
- provider usage cost tracking.

### Phase 5 - PDF and report chat

- Playwright PDF worker;
- report artifacts/storage;
- report chat;
- quick questions;
- chat limits and costs.
- HTML export template.
- PDF template.
- artifact lifecycle/retention.

### Phase 6 - Photo search

- upload validation;
- FaceCheck adapter;
- mock mode;
- candidate selection;
- analysis from selected candidate.

### Phase 7 - Payments

- Telegram Stars;
- YooKassa;
- refunds;
- receipts email;
- reconciliation;
- finance exports;
- payment idempotency tests.

### Phase 8 - Admin/hardening

- admin panel/commands;
- audit logs;
- retention jobs;
- delete_me;
- settings screen;
- RU/EN localization completeness check;
- Dockerfile/server-worker production run commands;
- CI workflow or equivalent documented automation;
- backup/restore notes;
- observability;
- rate limits;
- load tests;
- production checklist.

## 17. Testing requirements

Implement and run:

- unit tests;
- integration tests;
- e2e/mock tests;
- economics audit;
- lint;
- typecheck.

Minimum test coverage areas:

- username normalization;
- Telegram callback routing;
- message snapshots;
- keyboard snapshots;
- chunking <= 4096;
- HTML escaping;
- report parser;
- required report sections validation for standard/HR/influencer/OSINT modes;
- Digital Circle scoring;
- Digital Footprint extraction;
- credit reserve/capture/refund;
- ledger invariants;
- economics formulas;
- `audit-economics`;
- Stars pre-checkout/successful-payment/refund/idempotency;
- YooKassa create/webhook/refund/idempotency;
- mock analysis E2E;
- PDF smoke;
- `/delete_me`;
- provider error mapping.

Every command must be documented. Expected scripts:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm audit-economics
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
pnpm worker
pnpm build
pnpm start
```

If you cannot run a test because external credentials are missing, the test must be either mock-based or explicitly skipped only for live-provider mode. The default local test suite must pass without external credentials.

## 18. Definition of done

Do not declare completion until all are true:

1. Fresh clone can install dependencies.
2. Docker Compose starts PostgreSQL and Redis.
3. Migrations run.
4. Bot starts in long polling locally.
5. `/start` works.
6. User can pass onboarding/consent.
7. User can see sibling-like main menu/profile/balance/paywall.
8. Admin can grant credits.
9. User can start standard analysis by username.
10. Mock worker produces completed report.
11. Real adapters exist behind env flags.
12. Apify adapter can run in staging when token is present.
13. LLM adapter can run in staging when key is present.
14. Report sections are parsed and stored.
15. PDF/Markdown export works.
16. HTML export works.
17. User can browse history.
18. User can chat by completed report.
19. Photo search works in mock mode and adapter mode behind flag.
20. Stars purchase works in test/mock mode.
21. YooKassa purchase works in test/mock mode.
22. Duplicate payment events cannot double-credit.
23. Refunds adjust credits through ledger.
24. `audit-economics` passes for enabled public packages/modes.
25. RU/EN localization is complete for user-facing MVP flows.
26. Retention jobs and artifact cleanup work.
27. Safety/compliance guardrails are implemented.
28. `/delete_me` works.
29. Admin tools exist.
30. Logs do not leak secrets.
31. Tests, lint, typecheck and audit pass.
32. README documents local run, env, test, deploy basics.
33. Production checklist is either completed or has explicit remaining external/business blockers.

## 19. Working style

- Start by creating a concrete implementation checklist from the docs.
- Keep the checklist updated as you implement.
- Prefer small, coherent commits or at least coherent file changes.
- Do not rewrite specs unless implementation discovers a necessary correction; if so, update docs.
- Do not ask the user for decisions that are already answered in specs.
- Make conservative assumptions when blocked by missing credentials.
- Use mocks to keep development moving.
- Never claim "done" while tests are failing.
- Never hide known gaps. Create explicit TODOs only for external/business blockers, not for core code.
- If context gets long, write progress notes in repo docs so another agent can resume.

## 20. Final response expected from you

When finished, report:

- what was implemented;
- how to run locally;
- which tests/audits passed;
- which external credentials are needed for live providers;
- any open launch blockers from the spec;
- current git status.

The final answer must be concise, factual and in Russian.

```

```
