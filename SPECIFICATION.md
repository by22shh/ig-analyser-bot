# Спецификация Telegram-бота ZRETI

Версия: 0.3.

Дата: 2026-06-03.

Основание: глубокий разбор проекта `/Users/Bayramov_N/Desktop/Other/ig-analyser-site`.

## 1. Краткое резюме

Нужно разработать Telegram-бота, который переносит ключевую ценность сайта ZRETI в формат Telegram:

- анализ публичного Instagram-профиля по username;
- поиск возможного Instagram-профиля по фото;
- несколько режимов отчета: standard, HR, influencer, compliance-safe OSINT;
- структурированный отчет с секциями, источниками, метриками, PDF/HTML-экспортом;
- чат по готовому отчету;
- история анализов;
- роли, лимиты, тарифы, аудит и защита от злоупотреблений.

Главное архитектурное отличие от сайта: бот должен быть backend-first системой. Веб-сайт мог держать состояние в браузере и ждать долгие запросы, а Telegram-бот обязан быстро отвечать на webhook/update, выносить анализ в очередь, сохранять состояние и отправлять прогресс пользователю отдельными сообщениями.

### 1.1. Development readiness verdict

Эта спецификация достаточна, чтобы спокойно начинать разработку Phase 0 и Phase 1: репозиторий, инфраструктуру, БД, Telegram webhook, onboarding, меню, wizard анализа, очередь, моковый worker и первые тесты.

Она пока не является финальным launch contract для публичного релиза. До production/beta нужно закрыть open questions из раздела 24, особенно pricing, публичную доступность HR/OSINT-режимов, retention, юрисдикции privacy/compliance и финальный платежный способ.

Чтобы команда могла начинать без ожидания ответов на все бизнес-вопросы, для разработки фиксируются стартовые решения:

1. Интерфейс MVP: чистый Telegram-бот без обязательного Mini App.
2. Стек MVP: TypeScript, Node.js 20+, `grammy`, Fastify, Prisma, PostgreSQL, Redis, BullMQ, S3-compatible storage, Playwright для PDF.
3. Первый end-to-end режим: `standard`.
4. Второй режим после standard: `influencer`.
5. `hr` включать только за feature flag и с отдельным disclaimer.
6. `osint_compliance` не показывать публично в MVP; доступ только admin/compliance role и только после отдельного подтверждения lawful basis.
7. Billing в ранней разработке: credit ledger + admin grants; затем ЮKassa как основной платежный агрегатор для RUB-покупок credit packages. Telegram Stars оставить отдельным optional-каналом, не основным.
8. Провайдеры сначала подключаются через интерфейсы и моки; реальные Apify/OpenRouter/FaceCheck включаются после прохождения локальных integration tests.
9. Историю сайта не мигрировать в MVP: бот начинает со своей БД.
10. PDF является обязательным для MVP, но Markdown export можно сделать раньше как fallback для первых тестов.
11. Финансовая модель MVP: prepaid credits/packages, не постоплата. Рекуррентные подписки и автоплатежи не входят в первый платежный релиз.

Стартовый engineering cut:

1. Сначала построить shell: config, logger, DB schema, migrations, Telegram webhook, Redis queue.
2. Затем сделать mocked analysis pipeline, чтобы весь UX прошел от `/start` до "отчет готов" без внешних API.
3. Затем заменить моки реальными adapters по одному: Apify, image fetch/vision, final report, PDF, FaceCheck.
4. Только после этого включать credits capture/refund и admin инструменты.

### 1.2. Functional parity with the source site

Целевой Telegram-бот должен повторить весь содержательный функционал сайта, но не обязан повторять его визуальный web-интерфейс один-в-один. Иными словами: возможности, данные, отчеты, режимы анализа и AI-чат должны быть сохранены; dashboard, графики, PDF и управление отчетом должны быть адаптированы под Telegram, серверный PDF и, при необходимости, будущий Mini App.

Feature parity target:

| Функция сайта | Должна быть в боте | Как переносится в Telegram |
| --- | --- | --- |
| Анализ по Instagram username / ссылке | Да | `/analyze`, прямой ввод `@username` или URL, wizard выбора режима |
| Очистка username из `@name` и `instagram.com/name` | Да | `normalizeInstagramUsername` с unit tests |
| Поиск по фото | Да | `/photo`, загрузка фото/document, FaceCheck adapter, список кандидатов кнопками |
| Выбор найденного username после photo search | Да | Inline-кнопки `Анализировать`, `Открыть Instagram`, `Не тот человек` |
| Standard profile analysis | Да | Первый end-to-end режим MVP |
| Debt/collector mode сайта | Частично, с изменением | Не переносится как "коллекторский прессинг"; заменяется на role-gated `OSINT / Compliance` без давления, доксинга и контакта с третьими лицами |
| HR candidate analysis | Да | Feature flag, target position, disclaimer, отчет как гипотезы для проверки |
| Influencer audit | Да | Второй режим после standard или отдельный feature flag |
| Apify-сбор публичных Instagram-постов | Да | Server-side Apify adapter, jobs, retries, snapshots в БД |
| Анализ до 30 последних постов | Да | `ANALYSIS_POST_LIMIT`, по умолчанию 30 |
| Vision-анализ изображений пачками | Да | Worker pipeline, batch size 5, model config |
| Финальный LLM-отчет с `[[SECTION]]` | Да | Prompt registry, parser, validation required sections |
| Источники-ссылки на посты | Да | Source map в report sections, ссылки в Telegram/PDF/Markdown |
| Метрики: avg likes, comments, ER, frequency | Да | Telegram summary + report metrics |
| График лайков/комментариев | Да, но не как web chart в MVP | В MVP таблица/summary; в PDF можно рендерить chart image; Mini App может вернуть интерактивный график |
| Digital footprint: locations, music, related profiles, pinned posts | Да | Отдельная секция Telegram/PDF |
| Digital Circle / близкие связи | Да | Перенос алгоритма scoring из сайта, top 8 связей |
| Копирование секций | Да, в другой форме | Пользователь получает секцию отдельным сообщением/document; Telegram-клиент сам позволяет копировать текст |
| White-label PDF settings | Да, но не обязательно в первом MVP | Server-side PDF, title/logo settings для pro/admin или v1.1 |
| `window.print()` PDF сайта | Нет как механизм | Заменяется server-side HTML-to-PDF через Playwright |
| AI Chat по готовому отчету | Да | `Чат по отчету`, quick questions, сохранение chat history |
| Recent searches из localStorage | Да, в улучшенной форме | `/history` в PostgreSQL, не localStorage |
| RU/EN language switcher | Да | Onboarding/settings, locale middleware |
| Ошибки private profile / credits / retry | Да | Error mapping, refunds/retries, progress messages |
| Cyber UI, анимации, sticky dashboard | Нет как обязательная parity | Telegram UX + PDF/Markdown; visual parity возможна только в Mini App |

Parity definition:

1. Если пользователь мог получить определенный аналитический результат на сайте, бот должен уметь выдать тот же тип результата.
2. Если функция сайта была чисто визуальной, бот может заменить ее Telegram-native или PDF-native представлением.
3. Если функция сайта была рискованной с точки зрения безопасности или права, бот должен сохранить законную аналитическую ценность, но изменить формулировки, доступ и guardrails.
4. Если функция сайта была client-only, бот должен перенести ее на backend: БД вместо localStorage, server-side secrets вместо Vite-injected keys, workers вместо долгих browser requests.

## 2. Цели продукта

### 2.1. Пользовательские цели

Пользователь должен уметь:

1. Отправить `@username`, ссылку Instagram или фото.
2. Выбрать тип анализа.
3. Понять стоимость/лимит до запуска.
4. Видеть понятный прогресс анализа.
5. Получить короткое summary в Telegram.
6. Открыть подробные секции отчета.
7. Скачать PDF/HTML/Markdown-отчет.
8. Задать вопросы AI-ассистенту по конкретному отчету.
9. Вернуться к истории анализов.
10. Повторить анализ старого профиля.
11. Удалить свои данные.
12. Сменить язык интерфейса.

### 2.2. Бизнес-цели

Бот должен:

1. Упростить доступ к ZRETI без веб-интерфейса.
2. Поддерживать платную модель: credits, packages, subscription или Telegram Stars.
3. Дать управляемый backend для затратных AI/API операций.
4. Снизить риск злоупотреблений OSINT-функциями.
5. Собирать аналитику использования и стоимости запросов.
6. Поддержать будущую интеграцию с веб-дашбордом или Telegram Mini App.

### 2.3. Технические цели

1. Секреты только на сервере.
2. Все долгие задачи через очередь.
3. Состояние пользователя и анализов в PostgreSQL.
4. Повторяемый pipeline анализа.
5. Наблюдаемость: structured logs, metrics, traces.
6. Возможность менять модели/промпты без переписывания бизнес-логики.
7. Поддержка RU/EN с возможностью добавлять новые языки.
8. Четкая изоляция Telegram transport от domain services.

## 3. Не-цели MVP

В MVP не нужно:

1. Полностью переносить визуальный React dashboard.
2. Делать Telegram Mini App как обязательный интерфейс.
3. Реализовывать real-time streaming ответа в Telegram посимвольно.
4. Анализировать private Instagram-профили.
5. Обходить ограничения Instagram, Apify, FaceCheck или Telegram.
6. Хранить бесконечную историю отчетов.
7. Делать multi-tenant enterprise admin panel.
8. Генерировать юридические заключения или решения о найме/кредите.

## 4. Продуктовые принципы

1. Факты важнее догадок.
2. Каждый вывод должен иметь источник: пост, метаданные, комментарии или visual analysis.
3. Telegram-сообщения должны быть короткими; полный отчет уходит в PDF/HTML/Markdown.
4. Пользователь всегда понимает, что происходит: очередь, этап, прогресс, ошибка.
5. Рискованные режимы доступны только с ограничениями и явным подтверждением правил.
6. Бот не должен помогать преследованию, доксингу, угрозам, давлению на третьих лиц, обходу приватности.
7. Любой внешний API может упасть; система должна деградировать понятно.

## 5. Персоны пользователей

### 5.1. Networking / Sales user

Задача: быстро понять человека перед встречей, перепиской, партнерством или продажей.

Ключевые функции:

- standard report;
- готовые фразы для входа в диалог;
- триггеры и анти-триггеры;
- краткое summary;
- чат "как лучше написать?".

### 5.2. HR / Recruiter

Задача: получить дополнительный контекст по публичному профилю кандидата.

Ключевые функции:

- HR mode;
- поле target position;
- cultural fit;
- риски;
- вопросы для интервью.

Ограничение: бот должен явно говорить, что это дополнительный публичный контекст, а не финальное решение о кандидате.

### 5.3. Influencer marketer

Задача: оценить блогера перед покупкой рекламы.

Ключевые функции:

- influencer audit;
- brand safety;
- audience quality;
- ER;
- рекламный fit;
- PDF для команды/клиента.

### 5.4. Compliance / Legal collections user

Задача: оценить публичные признаки активов/контактов/рисков только в законных рамках.

Ключевые функции:

- compliance-safe OSINT report;
- публичные источники;
- audit trail;
- запрет на рекомендации по давлению, угрозам, социальному стыду и контакту с третьими лицами.

## 6. Режимы анализа

### 6.1. Standard Profile

Назначение: персональный стратегический анализ профиля для общения, делового контакта или понимания контекста.

Вход:

- Instagram username или profile URL.
- Язык отчета.
- Опционально: цель контакта, если добавить в v1.1.

Выход:

- summary;
- основные метрики;
- 17 секций отчета;
- источники по секциям;
- готовые фразы;
- PDF/HTML/Markdown;
- чат по отчету.

Обязательные секции:

1. Основные темы и приоритеты.
2. Повторяющиеся визуальные и текстовые паттерны.
3. Поведение и вовлеченность.
4. Аудитория и комментарии.
5. Стиль общения.
6. Профессия и статус.
7. Отличие от типичных аккаунтов.
8. Отсутствия как сигнал.
9. Потенциальная польза от контакта.
10. Триггеры и зацепки.
11. Коммуникационные рекомендации.
12. Готовые фразы для входа в диалог.
13. Неочевидные наблюдения.
14. Общая оценка ценности профиля.
15. Поведенческие сигналы.
16. Ошибки, слепые зоны, барьеры.
17. Образ как у бренда.

### 6.2. HR Candidate

Назначение: дополнительный публичный контекст по кандидату.

Вход:

- username;
- target position;
- язык отчета.

Выход:

- fit summary;
- риски;
- вопросы для интервью;
- итоговый вердикт: `рекомендую`, `с осторожностью`, `не рекомендую`, но только как "сигнал для проверки", а не финальное решение.

Обязательные секции:

1. Cultural fit.
2. Красные флаги и риски.
3. Soft skills.
4. Digital reputation.
5. Motivation and energy.
6. Hidden insights.
7. Interview recommendations.
8. Verdict.

Защитные требования:

- Перед запуском HR mode пользователь принимает дисклеймер.
- В отчете нельзя делать выводы о защищенных характеристиках и чувствительных признаках.
- Нельзя рекомендовать дискриминационные решения.
- Все формулировки должны быть "что проверить на интервью", а не "человек точно такой".

### 6.3. Influencer Audit

Назначение: оценка блогера перед рекламной интеграцией.

Вход:

- username;
- опционально: категория бренда/ниша в будущей версии;
- язык отчета.

Выход:

- brand safety score;
- audience quality;
- ad saturation;
- visual production;
- recommended ad format;
- verdict.

Обязательные секции:

1. Brand safety.
2. Audience quality.
3. Authenticity check.
4. Advertising blindness / ad saturation.
5. Visual and production value.
6. Hidden insights.
7. Effectiveness forecast.
8. Marketer verdict.

### 6.4. Compliance OSINT

Название в интерфейсе не должно звучать как "коллекторский скоринг" в MVP. Рекомендуемое название: `OSINT / Compliance`.

Назначение: структурировать публично доступные факты для легальной проверки.

Вход:

- username;
- подтверждение правового основания;
- цель проверки из ограниченного списка: `due diligence`, `fraud risk`, `legal case support`, `other lawful basis`.

Выход:

- публичные признаки активов без инструкций по давлению;
- публичные локационные сигналы без точного stalking-маршрута;
- контакты, если они явно опубликованы самим владельцем профиля;
- риски и несоответствия;
- рекомендации "передать юристу/комплаенсу/проверить документально".

Запрещено:

- инструкции по преследованию;
- советы писать родственникам, друзьям, коллегам;
- угрозы, давление, стыд, шантаж;
- обход приватности;
- поиск скрытых адресов;
- деанонимизация вне публичных данных;
- анализ несовершеннолетних;
- сохранение фото-поиска без retention policy.

## 7. Telegram UX

### 7.1. Команды

MVP commands:

- `/start` - onboarding, язык, согласие, главное меню.
- `/menu` - главное меню.
- `/analyze` - начать анализ по username.
- `/photo` - поиск username по фото.
- `/history` - история отчетов.
- `/credits` - баланс/тариф.
- `/settings` - язык, формат отчета, retention.
- `/help` - помощь.
- `/delete_me` - удалить пользовательские данные.

Admin commands:

- `/admin` - панель администратора.
- `/admin_stats` - usage/cost/errors.
- `/admin_user` - поиск пользователя.
- `/admin_jobs` - активные/failed jobs.
- `/admin_grant` - начислить credits.
- `/admin_broadcast` - рассылка, только после отдельного подтверждения.

### 7.2. Главное меню

Кнопки:

- `Анализ по username`.
- `Поиск по фото`.
- `История`.
- `Баланс`.
- `Настройки`.
- `Помощь`.

Если пользователь admin, добавляется:

- `Admin`.

### 7.3. Onboarding flow

1. `/start`.
2. Бот определяет Telegram language code.
3. Показывает выбор языка: `Русский`, `English`.
4. Показывает краткое описание:
   - анализируем только публичные данные;
   - не анализируем private profiles;
   - пользователь отвечает за законность цели;
   - фото-поиск требует права на использование изображения.
5. Пользователь нажимает `Принимаю правила`.
6. Создается/обновляется user record.
7. Показывается главное меню.

### 7.4. Username analysis flow

1. Пользователь нажимает `Анализ по username` или отправляет username напрямую.
2. Бот нормализует ввод:
   - `@name`;
   - `name`;
   - `https://instagram.com/name`;
   - `https://www.instagram.com/name/?...`.
3. Если username невалидный, бот просит повторить.
4. Бот показывает выбор режима:
   - Standard;
   - HR;
   - Influencer;
   - OSINT / Compliance, если доступно.
5. Если выбран HR, бот спрашивает target position.
6. Если выбран OSINT, бот показывает compliance confirmation.
7. Бот показывает confirmation:
   - username;
   - режим;
   - примерная длительность;
   - сколько credits будет списано;
   - кнопки `Запустить`, `Изменить`, `Отмена`.
8. После `Запустить` создается `AnalysisJob`.
9. Бот отвечает: `Задача принята`.
10. Worker выполняет pipeline.
11. Бот редактирует progress message или отправляет stage updates.
12. После завершения бот отправляет:
   - краткое summary;
   - метрики;
   - кнопки секций;
   - `PDF`;
   - `Задать вопрос`;
   - `Новый анализ`;
   - `Повторить позже`.

### 7.5. Photo search flow

1. Пользователь нажимает `Поиск по фото`.
2. Бот просит отправить фото как image или document.
3. Бот проверяет:
   - есть ли photo/document;
   - mime type;
   - размер;
   - доступность скачивания через Telegram `getFile`.
4. Бот скачивает файл.
5. Создает `PhotoSearchJob`.
6. FaceCheck adapter выполняет upload + polling.
7. Бот показывает candidates:
   - `@username`;
   - confidence;
   - source URL domain;
   - кнопки `Анализировать`, `Открыть Instagram`, `Не тот человек`.
8. После выбора кандидата запускается username analysis flow с confirmation.
9. Если кандидатов нет, бот предлагает:
   - загрузить другое фото;
   - ввести username вручную.

### 7.6. Report browsing flow

После анализа пользователь получает короткий message:

```text
Отчет по @username готов.

Метрики:
Подписчики: 14 502
Постов в анализе: 30
Средние лайки: 780
Средние комментарии: 42
ER: 5.67%
Частота: раз в 3 дн.

Короткий вывод:
...
```

Inline buttons:

- `Секции`.
- `Готовые фразы`.
- `Инсайты`.
- `Digital circle`.
- `PDF`.
- `Чат по отчету`.

Telegram text message limit требует разбивать длинные секции на части. Правило:

- chunk max 3500 chars для безопасного места под заголовок и links;
- формат HTML parse mode, а не MarkdownV2, чтобы проще экранировать спецсимволы;
- если section > 3 chunks, отправлять section как document `.txt/.md` плюс short preview.

### 7.7. Chat by report flow

1. Пользователь нажимает `Чат по отчету`.
2. Бот привязывает active chat session к последнему report или выбранному report.
3. Бот показывает quick buttons:
   - `Как начать разговор?`;
   - `Оцени искренность`;
   - `Психологический портрет`;
   - `Что спросить на интервью?` для HR;
   - `Стоит ли покупать рекламу?` для influencer.
4. Пользователь пишет вопрос.
5. Бот отправляет `typing`.
6. Chat service отвечает на основе report context.
7. Ответ сохраняется в `report_chat_messages`.

Ограничения:

- chat доступен только по завершенному report;
- каждый пользователь имеет лимит chat messages per day;
- чат не должен раскрывать raw prompts;
- чат не должен генерировать вредные инструкции.

### 7.8. History flow

`/history` показывает последние N отчетов.

MVP:

- по умолчанию 10 последних;
- фильтр по режиму;
- кнопка `Открыть`;
- кнопка `Скачать PDF`;
- кнопка `Удалить`.

Расширение:

- поиск по username;
- pinned reports;
- folders/tags.

## 8. Системная архитектура

### 8.1. Рекомендуемый стек

Backend:

- TypeScript 5.
- Node.js 20+ или 22 LTS.
- Telegram framework: `grammy`.
- HTTP server: Fastify или NestJS.
- ORM: Prisma или Drizzle.
- PostgreSQL.
- Redis.
- Queue: BullMQ.
- Object storage: S3-compatible.
- PDF: Playwright/Chromium HTML-to-PDF или `puppeteer-core` в отдельном worker image.

Почему TypeScript:

- исходный проект уже TypeScript;
- можно переиспользовать типы, prompt constants и часть нормализации;
- удобно держать Telegram handlers, services и schemas в одном языке.

### 8.2. Модули

`telegram`

- webhook endpoint;
- command handlers;
- callback query router;
- message router;
- locale middleware;
- auth/user middleware;
- rate limit middleware.

`users`

- регистрация Telegram user;
- language;
- settings;
- consent;
- deletion.

`billing`

- credits;
- plans;
- transactions;
- YooKassa orders/payments/refunds;
- Telegram Stars/payment provider as optional future channel;
- admin grants.

`payments`

- YooKassa API client;
- payment package catalog;
- order creation;
- payment confirmation URL flow;
- YooKassa webhook endpoint;
- payment status reconciliation;
- refunds;
- fiscal receipt data preparation;
- payment audit logs.

`analysis`

- orchestration;
- job state machine;
- progress;
- retries;
- report persistence.

`instagram`

- Apify adapter;
- username normalization;
- profile/post mapping;
- error mapping.

`vision`

- image fetcher;
- image proxy/resizer;
- image batch preparation;
- vision LLM requests.

`llm`

- OpenRouter client;
- model registry;
- prompt templates;
- response parser;
- safety wrapper.

`photo-search`

- Telegram file download;
- validation;
- FaceCheck adapter;
- match extraction.

`reports`

- report sections;
- summaries;
- metrics;
- digital circle;
- export to PDF/HTML/Markdown;
- artifact storage.

`chat`

- report chat sessions;
- context building;
- LLM streaming/internal buffering;
- message limits.

`admin`

- stats;
- users;
- jobs;
- credits;
- prompt/template version management.

`observability`

- structured logger;
- metrics;
- error reporting;
- audit logs.

### 8.3. Deployment topology

MVP production:

1. Web/API process:
   - receives Telegram webhook;
   - receives YooKassa webhooks;
   - handles commands/callbacks;
   - enqueues jobs;
   - creates YooKassa payments and returns confirmation links;
   - serves report files if needed.
2. Worker process:
   - executes Apify/FaceCheck/OpenRouter jobs;
   - generates reports and PDFs;
   - sends completion messages.
3. PostgreSQL.
4. Redis.
5. S3/R2 storage.

Do not run heavy analysis inside webhook request.

### 8.4. Webhook behavior

Telegram sends HTTPS POST updates to webhook URL and retries on non-2XX responses. Therefore:

- webhook handler must validate request quickly;
- enqueue job and return 200 fast;
- all long work happens in worker;
- unhandled exceptions in webhook must be caught and logged;
- duplicate updates must be idempotent by `update_id`.

### 8.5. State machine for analysis

Statuses:

- `draft`;
- `queued`;
- `fetching_profile`;
- `profile_fetched`;
- `analyzing_images`;
- `generating_report`;
- `generating_exports`;
- `completed`;
- `failed`;
- `cancelled`;
- `expired`.

Progress fields:

- `stage`;
- `current`;
- `total`;
- `percent`;
- `message_key`;
- `updated_at`.

Transitions:

```text
draft -> queued
queued -> fetching_profile
fetching_profile -> profile_fetched
profile_fetched -> analyzing_images
analyzing_images -> generating_report
generating_report -> generating_exports
generating_exports -> completed
any_running_state -> failed
queued/running -> cancelled
completed -> expired
```

## 9. Analysis pipeline

### 9.1. Username normalization

Function: `normalizeInstagramUsername(input: string): string`.

Rules:

- trim;
- lowercase optional, but preserve original separately;
- remove leading `@`;
- extract from:
  - `instagram.com/{username}`;
  - `www.instagram.com/{username}`;
  - `https://instagram.com/{username}/?hl=...`;
- reject reserved paths:
  - `p`;
  - `reel`;
  - `tv`;
  - `stories`;
  - `explore`;
  - `accounts`;
- reject spaces;
- allow `[A-Za-z0-9._]`;
- length: 1..30 for Instagram username.

### 9.2. Profile fetch

Adapter: `ApifyInstagramClient`.

Input:

```ts
type FetchInstagramProfileInput = {
  username: string;
  postLimit: number; // default 30
  includeParentData: boolean; // true
};
```

Actor:

- `apify/instagram-scraper`.

Request baseline from source project:

```json
{
  "directUrls": ["https://www.instagram.com/{username}"],
  "resultsLimit": 35,
  "resultsType": "posts",
  "searchType": "hashtag",
  "enhanceUserSearchWithFacebookPage": false,
  "isUserReelFeedURL": false,
  "addParentData": true,
  "isUserTaggedFeedURL": false
}
```

Implementation notes:

- Re-evaluate `searchType: "hashtag"` during development; it is inherited from current code and may be semantically odd for direct URL scraping.
- Use server-side token only.
- Poll run status with backoff and max timeout.
- Store raw first item for debugging only if admin/debug enabled.
- Never expose raw provider response to end user.

Error mapping:

- 401 -> `APIFY_INVALID_TOKEN`.
- 402/quota-like -> `APIFY_CREDITS_EXHAUSTED`.
- empty dataset -> `PROFILE_NOT_FOUND_OR_PRIVATE`.
- owner mismatch -> `IDENTITY_MISMATCH`.
- timeout -> `APIFY_TIMEOUT`.
- network -> `APIFY_NETWORK_ERROR`.

### 9.3. Profile mapping

Persist both:

- normalized snapshot used by app;
- provider metadata for debugging with retention and access restrictions.

Post selection:

- sort by timestamp desc;
- take latest 30;
- preserve pinned flag;
- preserve post URL;
- preserve image URL;
- preserve latest comments;
- preserve tagged users, mentions, hashtags, music, location.

### 9.4. Image fetching

Source project uses `wsrv.nl` as image proxy/resizer. Bot backend should prefer:

1. direct fetch with safe timeout;
2. fallback proxy/resizer if configured;
3. skip image if unavailable;
4. store failure reason per post.

Rules:

- timeout: 8 seconds per image;
- max downloaded bytes configurable;
- convert to JPEG/WebP as needed;
- resize max width 800;
- strip metadata before sending to LLM;
- never store base64 in DB;
- store temporary files in object storage with short TTL if needed.

### 9.5. Vision analysis

Input:

- up to 30 images;
- batch size 5;
- each image has post ID and source URL.

Output:

```ts
type VisionAnalysisItem = {
  postId: string;
  status: "completed" | "skipped" | "failed";
  description: string | null;
  model: string;
  promptVersion: string;
  errorCode?: string;
  createdAt: Date;
};
```

Requirements:

- each vision description must start with `[Image ID: ...]` or structured post ID field;
- if a batch partially fails, continue other batches;
- include visible facts only;
- avoid sensitive protected trait inference;
- avoid identifying private persons beyond public Instagram account context;
- keep prompt versioned.

### 9.6. Metadata context

For each post include:

- post ID;
- URL;
- timestamp;
- type/product type;
- pinned;
- location name;
- music;
- likes;
- comments;
- caption snippet;
- hashtags;
- mentions;
- latest comments sample.

Current source project only truncates caption to 200 chars and does not include full latest comments in metadata context despite prompt expecting them. Bot should explicitly include latest comments in a controlled way:

- top N latest comments per post;
- max chars per comment;
- include owner username;
- remove obvious spam if needed.

### 9.7. Final report generation

Input:

- profile metadata;
- posts metadata;
- visual intelligence;
- mode-specific prompt;
- language;
- optional target position;
- optional user goal.

Output:

```ts
type StrategicReport = {
  rawText: string;
  sections: ReportSection[];
  summary: ReportSummary;
  visionAnalysis: VisionAnalysisItem[];
  metrics: ReportMetrics;
  sourceMap: ReportSource[];
};
```

Parsing:

- primary marker: `[[SECTION]]`;
- fallback numbered sections;
- if no sections, store full text as one section;
- validate required sections by mode;
- if validation fails, optionally ask LLM to repair format once.

### 9.8. Metrics

Metrics inherited from site:

- `avgLikes = totalLikes / analyzedPosts`;
- `avgComments = totalComments / analyzedPosts`;
- `engagementRate = ((totalLikes + totalComments) / analyzedPosts) / followersCount * 100`;
- `frequencyDays = (newestPostDate - oldestPostDate) / (postsCount - 1)`;
- `lastPostDate`;
- `pinnedPostsCount`;
- `uniqueLocations`;
- `uniqueMusic`;
- `relatedProfiles`.

Additional recommended metrics:

- top 3 posts by likes;
- top 3 posts by comments;
- median likes/comments;
- engagement outliers;
- post type distribution;
- hashtag frequency;
- mention frequency;
- comment sentiment rough labels, only if safe.

### 9.9. Digital Circle

Use source algorithm as MVP:

Weights:

- tagged in post: 2.0;
- mentioned in caption: 1.5;
- comment: 1.0;
- comment length bonus: 0.1 per char up to +2.0;
- recent interaction multiplier: 1.5 within last 30 days relative to newest post;
- regularity bonus: +0.5 per post beyond 4 posts.

Filter:

- comments shorter than 3 chars;
- spam patterns: single emoji, `nice`, `cool`, `wow`, `amazing` if very short.

Output:

- top 8 usernames;
- type: `tagged`, `mentioned`, `commenter`, `mixed`;
- score;
- last interaction date;
- details.

Telegram rendering:

- section `Digital circle`;
- top list with Instagram links;
- optional source explanation.

## 10. Reports and exports

### 10.1. Telegram summary

The first completed message should contain:

- profile username;
- mode;
- analyzed post count;
- followers/following/posts;
- avg likes/comments;
- ER;
- frequency;
- 3-5 bullet insights;
- warning if some images failed.

### 10.2. Section messages

Rules:

- HTML parse mode preferred.
- Escape all user/provider/LLM text.
- Split long sections into chunks.
- Add source links at the end if not too long.
- Provide navigation buttons:
  - previous/next;
  - all sections;
  - PDF;
  - chat.

### 10.3. PDF

PDF must include:

- title;
- generation date;
- profile header;
- metrics;
- optional logo/white label;
- chart image/table;
- digital circle;
- all report sections;
- sources;
- disclaimer;
- prompt/model metadata hidden or in admin appendix depending on settings.

PDF generation options:

1. HTML template + Playwright PDF.
2. React email-like template rendered server-side.
3. Markdown to PDF as fallback.

MVP recommendation: HTML template + Playwright worker.

### 10.4. HTML export

HTML export useful for:

- richer layout than Telegram;
- future Mini App;
- shareable private link.

Security:

- signed URL;
- expiration;
- owner access check;
- optional password for enterprise.

### 10.5. Markdown export

Useful for power users.

Rules:

- preserve section headings;
- preserve source links;
- include metrics table;
- no raw provider secrets.

## 11. Data model

### 11.1. users

Fields:

- `id uuid pk`;
- `telegram_id bigint unique not null`;
- `telegram_username text`;
- `first_name text`;
- `last_name text`;
- `language text not null default 'ru'`;
- `role text not null default 'user'`;
- `status text not null default 'active'`;
- `timezone text`;
- `consent_version text`;
- `consent_accepted_at timestamptz`;
- `created_at timestamptz`;
- `updated_at timestamptz`;
- `deleted_at timestamptz`.

Roles:

- `user`;
- `pro`;
- `compliance`;
- `admin`;
- `superadmin`.

### 11.2. user_settings

- `user_id uuid pk fk`;
- `default_report_language text`;
- `default_export_format text`;
- `protect_content boolean`;
- `report_retention_days int`;
- `notify_on_completion boolean`.

### 11.3. credit_accounts

- `id uuid pk`;
- `user_id uuid unique fk`;
- `balance_units int not null default 0`;
- `reserved_units int not null default 0`;
- `plan text`;
- `plan_expires_at timestamptz`;
- `created_at`;
- `updated_at`.

Credit precision:

- Store credits in integer minor units, not floats.
- `1 credit = 100 credit_units`.
- Example: standard analysis cost `100`, HR cost `200`, chat message cost `5`.

### 11.4. credit_transactions

- `id uuid pk`;
- `user_id uuid fk`;
- `analysis_job_id uuid nullable`;
- `type text`: `grant`, `purchase`, `reserve`, `capture`, `refund`, `admin_adjustment`;
- `amount_units int`;
- `balance_after_units int`;
- `provider text`;
- `provider_payment_id text`;
- `metadata jsonb`;
- `created_at`.

### 11.5. credit_packages

- `id uuid pk`;
- `code text unique`;
- `title text`;
- `description text`;
- `credits_units int`;
- `price_minor int`;
- `currency text default 'RUB'`;
- `is_active boolean`;
- `sort_order int`;
- `yookassa_description text`;
- `receipt_subject text`;
- `receipt_vat_code int nullable`;
- `metadata jsonb`;
- `created_at`;
- `updated_at`.

### 11.6. payment_orders

- `id uuid pk`;
- `user_id uuid fk`;
- `package_id uuid fk`;
- `status text`: `draft`, `pending_payment`, `paid`, `canceled`, `expired`, `refunded`, `partially_refunded`;
- `amount_minor int`;
- `currency text`;
- `credits_units int`;
- `provider text default 'yookassa'`;
- `provider_payment_id text unique nullable`;
- `confirmation_url text nullable`;
- `idempotency_key text unique`;
- `user_email text nullable`;
- `telegram_chat_id bigint`;
- `telegram_invoice_message_id bigint nullable`;
- `paid_at timestamptz nullable`;
- `expires_at timestamptz nullable`;
- `created_at`;
- `updated_at`.

### 11.7. payment_events

- `id uuid pk`;
- `provider text`;
- `event_type text`;
- `provider_object_id text`;
- `payment_order_id uuid nullable fk`;
- `payload jsonb`;
- `received_at timestamptz`;
- `processed_at timestamptz nullable`;
- `processing_status text`: `received`, `processed`, `ignored`, `failed`;
- `error_code text nullable`;

Unique indexes:

- `(provider, event_type, provider_object_id)`.

### 11.8. yookassa_payments

- `id uuid pk`;
- `payment_order_id uuid unique fk`;
- `yookassa_payment_id text unique`;
- `status text`;
- `paid boolean`;
- `amount_minor int`;
- `currency text`;
- `income_amount_minor int nullable`;
- `payment_method_type text nullable`;
- `refundable boolean`;
- `test boolean`;
- `metadata jsonb`;
- `created_at_provider timestamptz nullable`;
- `captured_at timestamptz nullable`;
- `expires_at timestamptz nullable`;
- `raw jsonb nullable`;
- `created_at`;
- `updated_at`.

### 11.9. payment_refunds

- `id uuid pk`;
- `payment_order_id uuid fk`;
- `provider text default 'yookassa'`;
- `provider_refund_id text unique nullable`;
- `status text`: `pending`, `succeeded`, `canceled`, `failed`;
- `amount_minor int`;
- `currency text`;
- `reason text`;
- `idempotency_key text unique`;
- `admin_user_id uuid nullable`;
- `raw jsonb nullable`;
- `created_at`;
- `updated_at`;

### 11.10. fiscal_receipts

- `id uuid pk`;
- `payment_order_id uuid fk`;
- `provider text default 'yookassa'`;
- `type text`: `payment`, `refund`;
- `status text`: `pending`, `succeeded`, `canceled`, `failed`, `unknown`;
- `provider_receipt_id text nullable`;
- `customer_email text`;
- `amount_minor int`;
- `currency text`;
- `tax_system_code int nullable`;
- `vat_code int nullable`;
- `payload jsonb`;
- `raw jsonb nullable`;
- `created_at`;
- `updated_at`.

### 11.11. analysis_jobs

- `id uuid pk`;
- `user_id uuid fk`;
- `mode text`;
- `input_type text`: `username`, `photo_match`;
- `target_username text`;
- `target_position text nullable`;
- `goal text nullable`;
- `status text`;
- `stage text`;
- `progress_current int`;
- `progress_total int`;
- `progress_percent numeric`;
- `telegram_chat_id bigint`;
- `telegram_progress_message_id bigint nullable`;
- `cost_credit_units int`;
- `reserved_transaction_id uuid`;
- `error_code text`;
- `error_message text`;
- `idempotency_key text unique`;
- `created_at`;
- `started_at`;
- `finished_at`;
- `updated_at`;

Indexes:

- `(user_id, created_at desc)`;
- `(status, created_at)`;
- `(target_username)`;
- `(idempotency_key)`.

### 11.12. instagram_profile_snapshots

- `id uuid pk`;
- `analysis_job_id uuid unique fk`;
- `username text`;
- `full_name text`;
- `biography text`;
- `followers_count int`;
- `follows_count int`;
- `posts_count int`;
- `profile_pic_url text`;
- `external_url text`;
- `is_verified boolean`;
- `related_profiles jsonb`;
- `provider text`;
- `provider_dataset_id text`;
- `raw_debug jsonb nullable`;
- `created_at`.

### 11.13. instagram_post_snapshots

- `id uuid pk`;
- `profile_snapshot_id uuid fk`;
- `post_id text`;
- `type text`;
- `caption text`;
- `hashtags text[]`;
- `mentions text[]`;
- `likes_count int`;
- `comments_count int`;
- `latest_comments jsonb`;
- `timestamp timestamptz`;
- `display_url text`;
- `url text`;
- `video_view_count int`;
- `video_duration numeric`;
- `location jsonb`;
- `is_pinned boolean`;
- `product_type text`;
- `music_info jsonb`;
- `child_posts text[]`;
- `tagged_users text[]`;
- `sort_order int`;

Indexes:

- `(profile_snapshot_id, sort_order)`;
- `(post_id)`;
- `(timestamp desc)`.

### 11.14. vision_analysis_items

- `id uuid pk`;
- `analysis_job_id uuid fk`;
- `post_snapshot_id uuid fk`;
- `post_id text`;
- `status text`;
- `description text`;
- `model text`;
- `prompt_version text`;
- `error_code text`;
- `created_at`.

### 11.15. reports

- `id uuid pk`;
- `analysis_job_id uuid unique fk`;
- `user_id uuid fk`;
- `mode text`;
- `language text`;
- `raw_text text`;
- `summary jsonb`;
- `metrics jsonb`;
- `model text`;
- `prompt_version text`;
- `created_at`;
- `updated_at`;
- `expires_at`.

### 11.16. report_sections

- `id uuid pk`;
- `report_id uuid fk`;
- `position int`;
- `title text`;
- `content text`;
- `kind text`;
- `sources jsonb`;
- `created_at`.

Indexes:

- `(report_id, position)`.

### 11.17. report_artifacts

- `id uuid pk`;
- `report_id uuid fk`;
- `type text`: `pdf`, `html`, `markdown`, `json`;
- `storage_key text`;
- `public_url text nullable`;
- `expires_at timestamptz`;
- `telegram_file_id text nullable`;
- `size_bytes int`;
- `created_at`.

### 11.18. photo_search_jobs

- `id uuid pk`;
- `user_id uuid fk`;
- `telegram_file_id text`;
- `telegram_file_unique_id text`;
- `input_mime_type text`;
- `input_size_bytes int`;
- `status text`;
- `error_code text`;
- `created_at`;
- `finished_at`.

### 11.19. photo_search_matches

- `id uuid pk`;
- `photo_search_job_id uuid fk`;
- `username text`;
- `profile_url text`;
- `confidence numeric`;
- `source text`;
- `source_url text`;
- `raw_score numeric`;
- `created_at`.

### 11.20. report_chat_sessions

- `id uuid pk`;
- `report_id uuid fk`;
- `user_id uuid fk`;
- `status text`;
- `created_at`;
- `updated_at`.

### 11.21. report_chat_messages

- `id uuid pk`;
- `session_id uuid fk`;
- `role text`: `user`, `assistant`, `system`;
- `content text`;
- `model text nullable`;
- `tokens_in int nullable`;
- `tokens_out int nullable`;
- `created_at`.

### 11.22. api_usage_events

- `id uuid pk`;
- `user_id uuid nullable`;
- `analysis_job_id uuid nullable`;
- `provider text`;
- `operation text`;
- `model text nullable`;
- `status text`;
- `latency_ms int`;
- `cost_estimate numeric`;
- `tokens_in int`;
- `tokens_out int`;
- `error_code text`;
- `created_at`.

### 11.23. audit_logs

- `id uuid pk`;
- `actor_user_id uuid nullable`;
- `target_user_id uuid nullable`;
- `action text`;
- `entity_type text`;
- `entity_id uuid nullable`;
- `metadata jsonb`;
- `ip_hash text nullable`;
- `created_at`.

## 12. API contracts between modules

### 12.1. AnalysisService.startAnalysis

```ts
type StartAnalysisInput = {
  userId: string;
  chatId: number;
  inputType: "username" | "photo_match";
  username: string;
  mode: "standard" | "hr" | "influencer" | "osint_compliance";
  language: "ru" | "en";
  targetPosition?: string;
  goal?: string;
  idempotencyKey: string;
};
```

Returns:

```ts
type StartAnalysisResult = {
  jobId: string;
  status: "queued";
  estimatedDurationSec: number;
  costCreditUnits: number;
};
```

### 12.2. ReportService.renderTelegramSummary

```ts
type TelegramSummary = {
  text: string;
  replyMarkup: InlineKeyboardMarkup;
};
```

Rules:

- text <= 4096 chars;
- prefer <= 2500 chars;
- all dynamic content escaped.

### 12.3. PhotoSearchService.search

```ts
type PhotoSearchInput = {
  userId: string;
  telegramFileId: string;
  mimeType: string;
  sizeBytes: number;
};

type PhotoSearchResult = {
  jobId: string;
  matches: Array<{
    username: string;
    profileUrl: string;
    confidence: number;
    sourceUrl: string;
  }>;
};
```

### 12.4. PaymentService.createYooKassaOrder

```ts
type CreateYooKassaOrderInput = {
  userId: string;
  chatId: number;
  packageCode: string;
  userEmail?: string;
  locale: "ru" | "en";
  idempotencyKey: string;
};

type CreateYooKassaOrderResult = {
  orderId: string;
  providerPaymentId: string;
  status: "pending_payment";
  amountMinor: number;
  currency: "RUB";
  creditsUnits: number;
  confirmationUrl: string;
};
```

Rules:

- create internal order first, then call YooKassa;
- use the internal order ID/idempotency key as YooKassa `Idempotence-Key`;
- persist provider payment ID and confirmation URL;
- do not grant credits until `payment.succeeded` is reconciled.

### 12.5. PaymentService.handleYooKassaWebhook

```ts
type YooKassaWebhookInput = {
  event: "payment.succeeded" | "payment.canceled" | "refund.succeeded" | string;
  object: unknown;
  headers: Record<string, string>;
  remoteIp?: string;
};

type YooKassaWebhookResult = {
  accepted: boolean;
  processed: boolean;
  orderId?: string;
};
```

Rules:

- respond HTTP 200 after accepting a valid notification;
- fetch current payment/refund from YooKassa before mutating credits;
- repeated notifications must be safe;
- `payment.succeeded` grants credits exactly once;
- `payment.canceled` does not grant credits;
- `refund.succeeded` writes refund transaction and adjusts credits according to refund policy.

## 13. External integrations

### 13.1. Telegram Bot API

Use:

- webhook for production;
- long polling only for local development if needed;
- `sendMessage`;
- `editMessageText`;
- `answerCallbackQuery`;
- `sendChatAction`;
- `getFile`;
- `sendDocument`;
- `sendPhoto` only for small previews;
- `sendInvoice` only if Telegram Stars or Telegram-native YooKassa provider flow is enabled later.

Important constraints:

- text messages have a 4096-character limit after entity parsing;
- captions have 1024-character limit after entity parsing;
- `getFile` returns a `file_path`; the download URL is guaranteed for at least 1 hour, then a new `getFile` call is needed;
- cloud Bot API `getFile` download limit is 20 MB, so bot-side photo validation must reject larger user uploads unless a local Bot API server is intentionally used;
- bots can currently send documents up to 50 MB via `sendDocument`; generated PDFs should stay well below this limit;
- sending documents by URL currently works only for PDF and ZIP, so MVP should upload generated PDF as multipart or reuse `telegram_file_id`;
- Telegram Stars invoices require currency `XTR`; for Stars, `provider_token` is passed as an empty string and `prices` must contain exactly one item;
- PDF should be sent via `sendDocument`, not as a long text message;
- webhook must return 2XX quickly to avoid Telegram retries.

### 13.2. YooKassa

YooKassa is the primary fiat/RUB payment aggregator for MVP credit purchases.

Supported payment UX in MVP:

1. User opens `/credits`.
2. Bot shows credit packages.
3. User selects a package.
4. Backend creates an internal `payment_orders` record.
5. Backend creates a YooKassa payment via API with:
   - HTTP Basic Auth: `shop_id:secret_key`;
   - `Idempotence-Key`;
   - `amount.value`;
   - `amount.currency = RUB`;
   - `capture = true` for one-stage payment;
   - `confirmation.type = redirect`;
   - `confirmation.return_url`;
   - `description`;
   - `metadata.order_id`, `metadata.user_id`, `metadata.package_id`;
   - `receipt` if fiscalization through YooKassa is enabled.
6. Backend sends Telegram message with inline button `Оплатить` pointing to YooKassa `confirmation_url`.
7. YooKassa redirects user after payment to `return_url`; this page may simply tell the user to return to Telegram.
8. Backend receives YooKassa webhook, verifies it, reconciles payment status and grants credits.
9. Bot sends user a payment success/failure message.

Why this is preferred for MVP:

- It keeps card/payment data outside our system.
- It works without building a Telegram Mini App.
- It gives direct access to YooKassa payment/refund webhooks and reconciliation.
- It avoids coupling the first paid release to Telegram Stars.

Optional future UX:

- Telegram-native invoice via BotFather/YooKassa provider, if the configured provider token and fiscal scenario are confirmed.
- Telegram Stars for digital goods, separate from YooKassa.
- Saved payment methods/recurrent payments only after explicit legal/accounting review.

Required YooKassa webhook events:

- `payment.succeeded`;
- `payment.canceled`;
- `refund.succeeded`.

Webhook handling:

- endpoint: `POST /webhooks/yookassa`;
- answer HTTP 200 quickly after validation/enqueue;
- use idempotent processing by YooKassa object ID and event type;
- verify authenticity by checking the current payment/refund status through YooKassa API and/or allowlisting YooKassa IP ranges;
- never grant credits solely from an unchecked inbound JSON body;
- store raw webhook payload in `payment_events` with secret-safe redaction;
- retry-safe: repeated webhooks must not grant credits twice.

Payment statuses:

- `pending`: payment created, user has not finished confirmation;
- `succeeded`: payment finished, grant credits once;
- `canceled`: payment failed/expired/canceled, do not grant credits;
- `waiting_for_capture`: not expected in one-stage MVP, but must be represented in schema for future two-stage payments.

Refunds:

- refunds are possible only for successful payments;
- refund can be full or partial if the payment method supports it;
- refund idempotency is required;
- automatic refund policy applies only to unused credits;
- if credits were already consumed, refund becomes manual support/admin flow;
- YooKassa payment commission for the successful payment is not returned on refund, so refund losses must be included in finance reporting.

Fiscalization / receipts:

- If "Чеки от YooKassa" or another online-cashbox solution is enabled, the payment creation request must include receipt data.
- The bot must collect user email before paid purchase if receipt delivery requires email.
- Credit packages should be treated as digital service/prepayment packages; final tax/payment subject codes must be confirmed with accountant/legal counsel.
- Store receipt status and YooKassa receipt IDs if available.

Idempotency:

- internal order ID generated before calling YooKassa;
- YooKassa `Idempotence-Key = payment_order.id` or a deterministic key per payment attempt;
- separate idempotency key for refund attempts;
- unique DB constraints on `provider_payment_id`, `provider_refund_id`, and `(provider_event_id/event_type)` where available.

Security:

- `YOOKASSA_SECRET_KEY` must never appear in logs.
- Admins cannot view full payment credentials.
- Store only payment metadata, not card data.
- Webhook endpoint must use HTTPS.
- Payment success must be reconciled server-to-server, not trusted from `return_url`.

### 13.3. Apify

Use cases:

- scrape public Instagram profile posts;
- retrieve metadata and comments.

Resilience:

- retry 5xx;
- no retry for invalid token;
- backoff polling;
- status timeout;
- provider error mapping;
- usage logging.

### 13.4. OpenRouter / LLM provider

Use cases:

- vision analysis;
- final report;
- report chat.

Requirements:

- configurable models;
- timeout per operation;
- retry with backoff;
- quota detection;
- prompt versioning;
- response validation;
- usage/cost logging.

### 13.5. FaceCheck

Use cases:

- find Instagram usernames from uploaded photo.

Requirements:

- server-only token;
- image validation before upload;
- retention policy;
- legal basis confirmation;
- do not expose raw FaceCheck response unless needed;
- log only necessary metadata.

### 13.6. Object storage

Use cases:

- temporary uploaded photos;
- generated PDFs;
- HTML/Markdown exports;
- rendered chart images.

Requirements:

- private by default;
- signed URLs;
- TTL;
- lifecycle deletion;
- malware/content scan optional future.

## 14. Prompt management

Prompts should not be scattered in code like current `constants.ts`.

Store:

- prompt key;
- version;
- mode;
- language;
- system prompt;
- output schema/required sections;
- safety notes;
- enabled flag.

MVP implementation options:

1. prompt files in repo with version constants;
2. DB-backed prompt registry for admin updates later.

Recommended:

- repo files for MVP;
- DB registry in v1.1.

Prompt keys:

- `vision.detail.v1`;
- `report.standard.v1`;
- `report.hr.v1`;
- `report.influencer.v1`;
- `report.osint_compliance.v1`;
- `chat.report.v1`.

Prompt output validation:

- required section count by mode;
- no raw technical post IDs in user-facing phrases unless inside source links;
- source links present where expected;
- no unsafe instructions;
- no unsupported Markdown that breaks Telegram/PDF;
- language matches requested language.

## 15. Safety, privacy, compliance

### 15.1. Baseline policy

The bot analyzes only public data that the user is allowed to process.

Every user must accept:

- no private account bypass;
- no harassment;
- no stalking;
- no doxing;
- no targeting minors;
- no illegal debt collection;
- no discriminatory hiring decisions;
- no use of photo search without rights/consent/legal basis.

### 15.2. Data minimization

Store only:

- normalized profile snapshot;
- report;
- necessary provider metadata;
- generated artifacts.

Do not store:

- base64 images in DB;
- raw uploaded photos beyond retention;
- unnecessary IP/user device data;
- provider tokens in logs.

### 15.3. Retention

Default:

- reports: 30 days;
- uploaded photos: delete after photo search completes or within 24 hours;
- provider raw debug: disabled by default, or 7 days admin-only;
- audit logs: 180 days;
- billing records: according to accounting requirements.

User controls:

- delete report;
- delete all data `/delete_me`;
- change retention setting if plan allows.

### 15.4. Sensitive modes

HR:

- require disclaimer;
- avoid protected traits;
- phrase results as hypotheses/checkpoints;
- no final automated decision language.

OSINT / Compliance:

- require elevated role;
- require lawful basis confirmation each time or once per session;
- audit every run;
- do not output pressure tactics;
- do not recommend contacting third parties;
- do not infer exact home/work route from weak signals.

Photo search:

- require confirmation;
- show "possible matches", not identity certainty;
- confidence is provider score, not proof;
- user confirms selected account before analysis.

## 16. Billing and limits

### 16.1. Credit model

Billing model:

- Users buy prepaid credit packages in RUB through YooKassa.
- Internal credits are consumed by analysis jobs and post-report chat.
- Credits are stored as integer `credit_units`; `1 credit = 100 credit_units`.
- Purchased but unused credits are an internal liability until consumed or expired/refunded.
- Real money is never charged per failed analysis attempt; credits are reserved before work and captured only when the paid unit succeeds according to policy.

Recommended MVP mode costs:

- Standard username analysis: `100 units` / 1 credit.
- HR analysis: `200 units` / 2 credits.
- Influencer audit: `200 units` / 2 credits.
- Photo search: `100 units` / 1 credit.
- Photo search + selected analysis: photo search cost + selected analysis cost.
- Compliance OSINT: `300+ units` / 3+ credits and role-gated.
- Chat after report: included first N messages per report; then `5 units` / 0.05 credit per message or plan-based.
- PDF/Markdown export: included in completed analysis.
- Re-analysis of the same profile: full price by default, because provider costs repeat.

### 16.2. YooKassa payment model

MVP payment type:

- one-time credit package purchase;
- `capture = true`;
- currency `RUB`;
- confirmation scenario `redirect`;
- no recurring/autopay in MVP;
- no two-stage capture in MVP, but DB supports `waiting_for_capture` for future.

Credit packages v0.1:

| Package | Credits | Price RUB | Gross RUB / credit | Target user |
| --- | ---: | ---: | ---: | --- |
| Trial | 1 | 0 | 0 | Manual/admin grant only |
| Start | 3 | 690 | 230 | First paid users |
| Pro | 10 | 1,990 | 199 | Regular users |
| Agency | 30 | 5,490 | 183 | Small teams |
| Scale | 100 | 15,900 | 159 | Agencies / negotiated |

Rules:

- Packages are configuration/data, not hard-coded.
- The cheapest public package must not push gross margin below target.
- Enterprise/custom packages may use invoice/manual contract instead of bot checkout.
- Promotional grants must be marked as `grant`, not `purchase`, for clean financial reporting.

YooKassa fee assumptions for financial model:

- `r_acquiring = 2.8%` for the Telegram/YooKassa payment methods shown in YooKassa materials (cards, YooMoney, SberPay).
- `r_receipt = 1.0%` if "Чеки от YooKassa" is used under the tariff shown on the fees page.
- `r_commission_vat = 20%` VAT on YooKassa commission if applicable under the contract.
- Effective fee for conservative planning: `r_yk_effective = (r_acquiring + r_receipt) * (1 + r_commission_vat)`.
- With defaults above: `(2.8% + 1.0%) * 1.20 = 4.56%` of gross payment.
- These rates must be config values and verified against the signed YooKassa contract before launch.

YooKassa net revenue formula:

```text
gross_payment = package_price_rub
yookassa_fee = gross_payment * r_yk_effective
net_after_yookassa = gross_payment - yookassa_fee
```

Example for Pro package:

```text
gross_payment = 1,990 RUB
r_yk_effective = 4.56%
yookassa_fee = 90.74 RUB
net_after_yookassa = 1,899.26 RUB
```

### 16.3. Variable provider cost model

Variable cost per operation must be measured and stored in `api_usage_events`.

Cost variables:

```text
C_apify_profile = cost of one Apify profile run
C_image_fetch = image proxy/traffic/processing cost
C_vision_batch = LLM vision batch cost
C_reasoning = final report LLM cost
C_facecheck = one photo search cost
C_chat = one report-chat answer cost
C_pdf = PDF rendering/storage cost
C_storage = report/artifact storage cost
C_support = allocated support/refund risk per paid unit
```

Mode cost formulas:

```text
C_standard =
  C_apify_profile
  + C_image_fetch
  + C_vision_batches
  + C_reasoning
  + C_pdf
  + C_storage
  + C_support

C_influencer = C_standard + C_reasoning_delta
C_hr = C_standard + C_reasoning_delta
C_photo_search = C_facecheck + C_storage + C_support
C_chat_message = C_chat
```

Cost tracking requirements:

- Store provider, operation, model, tokens, latency and estimated cost.
- Store package-level gross/net revenue.
- Store job-level cost estimate.
- Compute margin by mode and package weekly.
- If actual `C_standard` exceeds the cost ceiling for two consecutive weeks, raise credit cost or reduce provider spend.

### 16.4. Unit economics and margin targets

Definitions:

```text
P_credit_gross = package_price_rub / package_credits
P_credit_net = P_credit_gross * (1 - r_yk_effective)
gross_margin_per_credit = P_credit_net - C_standard_per_credit
gross_margin_percent = gross_margin_per_credit / P_credit_gross
```

Target:

- Standard analysis gross margin: >= 60%.
- HR/Influencer gross margin: >= 60%.
- Photo search gross margin: >= 50%.
- Overall blended gross margin: >= 65% after the first 2 months of beta.

Minimum price formula:

```text
P_credit_min = C_standard / (1 - r_yk_effective - target_margin)
```

Example:

```text
C_standard = 55 RUB
r_yk_effective = 4.56%
target_margin = 60%
P_credit_min = 55 / (1 - 0.0456 - 0.60) = 155.19 RUB
```

Interpretation:

- If actual standard report cost is 55 RUB, public packages should keep gross price per credit above ~155 RUB.
- The `Scale` package at 159 RUB/credit is safe only while actual standard cost stays near or below this assumption.
- If actual cost becomes 80 RUB, minimum price rises to ~225.73 RUB/credit; discount packages must be disabled or repriced.

Illustrative package contribution with `C_standard = 55 RUB`:

| Package | Gross | Net after YooKassa | Assumed provider cost | Contribution | Contribution margin |
| --- | ---: | ---: | ---: | ---: | ---: |
| Start, 3 credits | 690 | 658.54 | 165 | 493.54 | 71.5% |
| Pro, 10 credits | 1,990 | 1,899.26 | 550 | 1,349.26 | 67.8% |
| Agency, 30 credits | 5,490 | 5,239.66 | 1,650 | 3,589.66 | 65.4% |
| Scale, 100 credits | 15,900 | 15,174.96 | 5,500 | 9,674.96 | 60.8% |

These numbers are planning assumptions. Actual provider costs must be recalculated from real API usage before public pricing is finalized.

### 16.5. Fixed costs and break-even

Monthly fixed costs:

```text
F_hosting = app/worker hosting
F_db = managed PostgreSQL
F_redis = managed Redis
F_storage = baseline object storage
F_monitoring = logging/errors/metrics
F_accounting = fiscal/accounting/admin overhead
F_support = user support allocation
F_misc = domains, backups, security tools
F_total = sum(F_*)
```

Break-even formula:

```text
break_even_packages = F_total / avg_package_contribution
```

Illustrative scenario:

```text
F_total = 60,000 RUB/month
avg_package = Pro
avg_package_contribution = 1,349 RUB
break_even_packages = 60,000 / 1,349 = 45 Pro packages/month
```

Operational targets for beta:

- Month 1: validate cost per report and payment conversion, not profit.
- Month 2: reach >= 100 paid packages or >= 200 completed paid analyses.
- Month 3: blended gross margin >= 65%, provider failure refund rate < 5%.

### 16.6. Reservation flow for analysis credits

1. Before job starts, reserve credit units.
2. If profile fetch fails because private/not found, release reserve.
3. If LLM report fails after profile fetch, keep job retryable without extra charge.
4. If job completes, capture reserved credit units.
5. If user cancels before provider work starts, release reserve.
6. If user cancels after provider work starts, cancellation policy decides whether reserve is captured or partially released.

### 16.7. Payment and refund flow

Purchase flow:

1. User selects a credit package.
2. If receipts require email and user has no email, bot asks for email.
3. Backend creates `payment_order`.
4. Backend creates YooKassa payment.
5. Bot sends payment button.
6. YooKassa webhook `payment.succeeded` is received.
7. Backend fetches current payment status from YooKassa.
8. Backend marks order `paid`.
9. Backend creates `credit_transaction(type=purchase)`.
10. Backend increments user credit balance.
11. Bot notifies user.

Refund flow:

1. Refund request can be automatic only for fully unused purchased credits.
2. If credits are partially used, refund is manual/admin and may be partial.
3. Backend creates YooKassa refund with idempotency key.
4. YooKassa webhook `refund.succeeded` is reconciled.
5. Backend writes `payment_refunds`, `credit_transactions(type=refund)`, and adjusts credit balance.
6. Because YooKassa does not return the original successful-payment commission on refund, finance reporting must show refund loss separately.

Chargeback/dispute policy:

- If provider reports a dispute/chargeback through account operations, admin may freeze user account and credit balance.
- Add manual adjustment transactions rather than mutating historical ledger rows.

### 16.8. Revenue recognition

For product analytics:

- `cash_collected`: successful YooKassa payments.
- `net_cash_after_yookassa`: cash after payment/receipt commissions.
- `deferred_credit_liability`: unused paid credit value.
- `recognized_revenue`: paid credits consumed by completed analyses/chat.
- `refunds`: successful YooKassa refunds.
- `refund_loss`: non-returned payment commission and provider costs already spent.

Accounting note:

- Final revenue recognition, VAT/tax treatment, receipt item codes and expiration policy must be approved by accountant/legal counsel.
- The system must export payment, refund and credit ledger data for monthly reconciliation.

### 16.9. Rate limits

Per user:

- username attempts: configurable, e.g. 10/hour free;
- photo search: stricter, e.g. 3/hour free;
- chat: e.g. 20/day free after report.

Global:

- max concurrent Apify runs;
- max concurrent vision batches;
- max concurrent report generations;
- provider circuit breakers.

### 16.10. Financial reports

Admin/finance exports:

- payments by day/package/status;
- YooKassa fees by day;
- refunds by day/reason;
- credit liability balance;
- recognized revenue by mode;
- provider cost by operation/mode;
- gross margin by package and mode;
- failed jobs with provider cost already incurred;
- abuse/manual adjustments.

## 17. Admin features

Admin MVP:

- view total users;
- view active jobs;
- view failed jobs;
- view payment orders;
- view YooKassa payment/refund statuses;
- manually reconcile payment by provider payment ID;
- retry failed job;
- cancel job;
- grant credits;
- revoke credits;
- create manual credit adjustment with reason;
- initiate refund for unused purchased credits;
- inspect user history;
- export usage CSV;
- export finance CSV;
- view provider errors.

Admin safety:

- admin actions logged;
- superadmin-only destructive actions;
- no raw uploaded photos in ordinary admin UI;
- no secrets shown.

## 18. Observability

### 18.1. Logs

Structured JSON logs:

- `request_id`;
- `telegram_update_id`;
- `user_id`;
- `job_id`;
- `provider`;
- `operation`;
- `status`;
- `latency_ms`;
- `error_code`.

Never log:

- tokens;
- raw Authorization headers;
- full uploaded image base64;
- full report in info logs.

### 18.2. Metrics

Business:

- signups/day;
- analyses/day by mode;
- conversion photo->analysis;
- conversion package_view->payment_created->payment_succeeded;
- credits purchased/spent;
- credit liability balance;
- refunds count and amount;
- active users.

Technical:

- webhook latency;
- job queue wait time;
- job duration by stage;
- Apify success rate;
- FaceCheck success rate;
- LLM success rate;
- PDF generation failures;
- Telegram send failures.
- YooKassa webhook latency/failures;
- payment reconciliation failures.

Cost:

- estimated LLM tokens;
- Apify runs;
- FaceCheck calls;
- storage size;
- cost per completed report;
- YooKassa fees;
- gross margin by mode/package.

### 18.3. Alerts

Alert when:

- webhook error rate > threshold;
- queue backlog grows;
- provider quota exhausted;
- report generation failures spike;
- Redis/Postgres unavailable;
- storage upload fails.

## 19. Error handling UX

Private profile:

```text
Профиль @username закрыт или недоступен.
Я могу анализировать только публичные аккаунты.
```

Not found:

```text
Не нашел публичный профиль @username. Проверь username или пришли ссылку.
```

Provider credits:

```text
Внешний AI/API лимит временно исчерпан. Я сохранил задачу как failed, администратор сможет повторить ее без повторного ввода.
```

Timeout:

```text
Анализ занял слишком много времени. Можно повторить попытку, списание не будет продублировано.
```

Photo no matches:

```text
По этому фото не удалось найти Instagram-кандидатов. Можно загрузить другое фото или ввести username вручную.
```

Unsafe request:

```text
Я не могу помогать с преследованием, давлением на людей или обходом приватности. Могу подготовить только законный анализ публичных данных и нейтральные вопросы для проверки.
```

## 20. Internationalization

Languages:

- `ru` default;
- `en`.

Store translations in structured files:

- `locales/ru.json`;
- `locales/en.json`.

Translate:

- commands;
- buttons;
- progress messages;
- errors;
- reports;
- PDF labels.

Do not translate:

- usernames;
- source URLs;
- raw brand names;
- post IDs inside internal source map.

## 21. Testing strategy

### 21.1. Unit tests

Required:

- username normalization;
- Telegram callback routing;
- chunking messages <= 4096;
- HTML escaping;
- Apify mapping;
- report section parser;
- DigitalCircle scoring;
- credit reservation/capture/refund;
- YooKassa fee calculation;
- payment order state transitions;
- payment webhook idempotency;
- error mapping.

### 21.2. Integration tests

Required:

- fake Telegram update -> command handler;
- start analysis -> queue job;
- Apify mocked response -> profile snapshot;
- LLM mocked report -> parsed sections;
- FaceCheck mocked response -> matches;
- YooKassa mocked payment creation -> order pending;
- YooKassa mocked `payment.succeeded` webhook -> credits granted exactly once;
- YooKassa duplicate webhook -> no duplicate credits;
- YooKassa mocked refund -> credits adjusted;
- PDF generation smoke.

### 21.3. E2E tests

Recommended:

- local webhook endpoint with sample Telegram updates;
- staging bot with admin-only access;
- test user flow:
  - `/start`;
  - username analysis;
  - section browsing;
  - PDF download;
  - chat.

### 21.4. Load tests

Scenarios:

- 100 concurrent `/start`;
- 20 concurrent analysis jobs;
- provider latency simulation;
- queue recovery after worker restart.

## 22. Development roadmap

### Phase 0 - Repository and foundation

Deliverables:

- initialize TypeScript project;
- Docker Compose for Postgres/Redis;
- lint/test setup;
- config/env loader;
- logger;
- Prisma/Drizzle schema;
- base Telegram webhook.

Acceptance:

- `/start` works locally;
- DB migrations run;
- test suite baseline passes.

### Phase 1 - Core Telegram UX

Deliverables:

- onboarding;
- language selection;
- menu;
- username input wizard;
- mode selection;
- history shell;
- admin shell.

Acceptance:

- user can reach "job queued" state with mocked worker.

### Phase 2 - Analysis pipeline

Deliverables:

- Apify adapter;
- profile/post snapshots;
- image fetcher;
- vision LLM adapter;
- report LLM adapter;
- parser;
- progress updates.

Acceptance:

- real public username produces stored report.

### Phase 3 - Report delivery

Deliverables:

- summary message;
- section browsing;
- digital circle;
- metrics;
- PDF export;
- Markdown export.

Acceptance:

- completed report is usable entirely inside Telegram.

### Phase 4 - Photo search

Deliverables:

- Telegram file download;
- validation;
- FaceCheck adapter;
- candidate selection;
- handoff to analysis.

Acceptance:

- uploaded photo can produce candidate usernames and start analysis.

### Phase 5 - Chat by report

Deliverables:

- report chat session;
- quick questions;
- chat history;
- rate limits.

Acceptance:

- user can ask questions about completed report.

### Phase 6 - Billing, limits, admin

Deliverables:

- credit ledger;
- admin grants;
- YooKassa payment package catalog;
- YooKassa payment creation;
- YooKassa webhook reconciliation;
- receipt email collection and receipt payload preparation;
- refund flow for unused credits;
- job cost capture/refund;
- rate limits;
- provider usage metrics.
- finance exports.

Acceptance:

- free/pro/admin flows are enforceable;
- user can buy credits through YooKassa in test mode;
- `payment.succeeded` grants credits once;
- duplicate payment webhook does not duplicate credits;
- finance export shows gross payments, YooKassa fees, provider costs and margin.

### Phase 7 - Hardening

Deliverables:

- safety guardrails;
- retention deletion jobs;
- observability;
- alerts;
- staging deployment;
- production checklist.

Acceptance:

- bot can run with real users under controlled beta.

### 22.1. Recommended repository structure for implementation

The first code iteration should use a structure close to this:

```text
src/
  app.ts
  server.ts
  config/
    env.ts
    logger.ts
  telegram/
    bot.ts
    webhook.ts
    middleware/
      user-context.ts
      locale.ts
      rate-limit.ts
    handlers/
      start.ts
      menu.ts
      analyze.ts
      photo.ts
      history.ts
      credits.ts
      settings.ts
      admin.ts
    keyboards/
      main-menu.ts
      analysis-mode.ts
      report-actions.ts
    formatters/
      html.ts
      chunks.ts
      messages.ts
  modules/
    users/
    billing/
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
    queues.ts
    workers/
      analysis.worker.ts
      photo-search.worker.ts
      exports.worker.ts
  prompts/
    vision.detail.v1.ts
    report.standard.v1.ts
    report.hr.v1.ts
    report.influencer.v1.ts
    report.osint-compliance.v1.ts
    chat.report.v1.ts
  db/
    client.ts
    migrations/
  tests/
    fixtures/
```

Rules:

- Telegram handlers must stay thin: parse input, update conversation state, enqueue work, render messages.
- Provider-specific code must live only in adapters: no Apify/OpenRouter/FaceCheck calls from handlers.
- Business decisions about billing, safety and report state must live in services, not in callback-query handlers.
- All user-facing text must go through locale/message helpers, even in MVP.
- Prompts must be versioned files from day one.

### 22.2. First sprint backlog

These tickets are the recommended start order:

1. Scaffold TypeScript project with lint, format, test runner and Docker Compose for PostgreSQL/Redis.
2. Add env validation for Telegram, DB, Redis, providers, admin IDs and feature flags.
3. Add Prisma/Drizzle schema for `users`, `user_settings`, `analysis_jobs`, `reports`, `report_sections`, `credit_accounts`, `credit_transactions`, `audit_logs`.
4. Implement structured logger and request/job correlation IDs.
5. Implement Telegram webhook with secret validation and duplicate `update_id` protection.
6. Implement `/start`, language selection, consent acceptance and main menu.
7. Implement username normalization with unit tests.
8. Implement analysis wizard with mode selection and confirmation.
9. Implement credit account creation and admin grant command.
10. Implement BullMQ queues and mocked `analysis.worker`.
11. Implement progress message creation/editing.
12. Implement mocked completed report and section browsing.
13. Implement message chunking and HTML escaping tests.
14. Implement report persistence and `/history`.
15. Implement Markdown export as a simple artifact.
16. Implement Apify adapter behind interface with mocked integration test.
17. Implement real Apify fetch for one public username in staging/dev.
18. Implement report parser and required-section validation.
19. Implement OpenRouter final report adapter with provider timeout/retry.
20. Implement PDF export after Telegram report delivery is already stable.

The first sprint should not include FaceCheck, HR, OSINT, real payments or Mini App work. Those depend on a stable core pipeline.

### 22.3. MVP definition of done

MVP is done when all conditions below are true:

1. A new user can complete onboarding and accept rules.
2. Admin can grant credits.
3. User can start a standard analysis by username.
4. The bot creates a queued job and returns from webhook quickly.
5. Worker fetches a public Instagram profile via Apify.
6. Worker generates a report through the LLM provider.
7. Report sections are parsed, stored and browsable in Telegram.
8. Long sections are safely chunked and escaped.
9. User receives a PDF or Markdown fallback artifact.
10. User can open report history.
11. Private/not-found profile errors do not consume credits.
12. LLM/provider failures can be retried without duplicate charge.
13. `/delete_me` removes or anonymizes user-owned data according to retention policy.
14. Basic admin view shows active/failed jobs and usage.
15. Unit and integration tests cover normalization, chunking, report parser, credit reservation and provider error mapping.
16. Logs contain no secrets or raw base64.
17. Production checklist items that apply to MVP staging are completed.

### 22.4. Decisions that can remain open during Phase 0-2

These questions do not block foundation work:

- final public brand name;
- final launch pricing after real provider-cost measurement;
- Telegram Stars as optional secondary channel;
- Mini App design;
- white-label PDF availability;
- long-term report retention;
- synchronization with the existing website.

These questions block public launch:

- legal/compliance text;
- which modes are public;
- jurisdiction-specific privacy requirements;
- policy for HR and photo search;
- provider budgets and rate limits;
- support process for abuse reports and data deletion requests.

## 23. Production checklist

Before launch:

- Bot token stored in secret manager.
- Webhook secret enabled.
- YooKassa shop ID and secret key stored in secret manager.
- YooKassa test payments verified end-to-end.
- YooKassa production webhook configured and tested.
- YooKassa IP allowlist/status reconciliation configured.
- Receipt/fiscalization scenario approved by accountant/legal counsel.
- Receipt email collection tested.
- Refund flow tested on YooKassa test payment.
- Payment duplicate webhook/idempotency tested.
- Database backups configured.
- Redis persistence/managed Redis configured.
- Object storage lifecycle rules configured.
- API quotas monitored.
- Prompt versions frozen.
- Terms/disclaimer text approved.
- Admin IDs configured.
- `/delete_me` tested.
- Failed job retry tested.
- Credit refund tested.
- Credit purchase and finance export tested.
- PDF generation tested on long reports.
- Telegram message splitting tested.
- Provider outage simulation tested.
- Logs checked for secret leaks.

## 24. Open questions

1. Какой финальный бренд бота: `ZRETI`, `ZRETI AI`, другое имя?
2. Нужен ли Telegram Mini App в первой версии или достаточно чистого бота?
3. Какие режимы включать публично в MVP: только standard/influencer/HR или также compliance OSINT?
4. Подтверждаем ли launch-пакеты: Start 690 ₽, Pro 1 990 ₽, Agency 5 490 ₽, Scale 15 900 ₽?
5. Нужно ли хранить отчеты 30 дней или дольше?
6. Нужен ли white-label PDF для всех или только pro/admin?
7. Нужно ли синхронизировать историю с существующим сайтом?
8. Какие страны/юрисдикции являются целевыми для privacy/compliance?
9. Нужен ли ручной review для risky modes?
10. Какие provider limits и бюджет на один отчет считаются допустимыми?
11. Какая фактическая комиссия ЮKassa по подписанному договору и выбранному способу чеков?
12. Используем ли "Чеки от YooKassa" или свою/стороннюю онлайн-кассу?
13. Какие fiscal receipt item/tax/payment subject/payment mode codes использовать для credit packages?
14. Какой срок действия у купленных кредитов: бессрочно, 6 месяцев, 12 месяцев?
15. Какая политика возврата: только unused credits, частично unused, goodwill refunds?
16. Нужно ли продавать подписки/автоплатежи позже или только prepaid packages?

## 25. Sources and constraints

Source project facts are documented in [docs/source-project-analysis.md](./docs/source-project-analysis.md).

Telegram Bot API constraints used in this spec:

- webhook receives HTTPS POST updates and retries non-2XX responses;
- `sendMessage` text limit is 1-4096 characters after entities parsing;
- captions are limited to 1024 characters after entities parsing;
- files can be retrieved with `getFile` through a download URL that is guaranteed for at least 1 hour;
- cloud Bot API file download limit is 20 MB;
- bots can currently send documents up to 50 MB via `sendDocument`;
- generated PDFs should be sent via `sendDocument`;
- Telegram Stars can be used through invoice/payment flows with currency `XTR`.

YooKassa constraints used in this spec:

- YooKassa supports Telegram bot payments and payment methods such as bank cards, YooMoney wallet and SberPay for the Telegram scenario.
- YooKassa API payment creation uses merchant authentication, `Idempotence-Key`, `amount`, `capture`, `confirmation`, `return_url`, `description` and optional `metadata`.
- Redirect/smart payment returns a `confirmation_url`; user payment completion must be confirmed by YooKassa webhook or server-side status fetch.
- YooKassa webhook events include payment and refund statuses; webhook receipt must be acknowledged with HTTP 200, and non-200 responses are retried.
- Webhook authenticity should be checked by status lookup and/or YooKassa IP ranges.
- Refunds can be full or partial for successful payments, but the original successful-payment commission is not returned.
- If using YooKassa receipts/54-FZ flow, receipt data and customer email must be collected and sent according to the selected fiscalization setup.
- Public fee assumptions in this spec are planning defaults only and must be replaced by the signed merchant contract terms before launch.
