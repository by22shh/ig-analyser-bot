# UX reference: ai-assistant-bot

Дата: 2026-06-03.

Источник: `/Users/Bayramov_N/Desktop/Other/ai-assistant-bot`.

Цель: зафиксировать переносимые UX-паттерны из sibling-бота той же группы для Telegram-бота Instagram-анализа. Это не требование копировать функциональность AI Assistant, а требование сохранить узнаваемый формат сообщений, платежных сценариев, профиля, меню и общей логики Telegram-взаимодействия там, где это уместно.

## 1. Изученные файлы

- `app/texts/ru.py` - централизованные RU-тексты, тональность, формат сообщений, paywall, профиль, ошибки.
- `app/keyboards/inline.py` - структура inline-меню, кнопки, раскладка, paywall, back/cancel.
- `app/handlers/start.py` - `/start`, реферальный payload, возврат в главное меню.
- `app/handlers/profile.py` - `/balance`, `/credits`, профиль, реферальная ссылка.
- `app/handlers/help.py` - `/help`, `/cancel`, `/reset`.
- `app/handlers/payments.py` - Stars/YooKassa/card flows, custom amount, email for receipts, pre-checkout, successful payment.
- `app/handlers/helpers.py` - welcome payload, chunking, insufficient credits -> paywall.
- `app/constants.py` - callback namespaces and payment provider/status enums.

## 2. Что переносим в бота

### 2.1. Стиль сообщений

Паттерн sibling-бота:

- HTML parse mode by default.
- Все тексты лежат в централизованном модуле, не в handlers.
- Сообщения начинаются с короткого заголовка с иконкой и bold-label.
- Далее 1-2 смысловых абзаца или короткий список.
- Важные числа выделяются `<b>...</b>`.
- Технические ID и ссылки, которые нужно копировать, даются через `<code>...</code>`.
- Для длинных инструкций допускаются `<blockquote>...</blockquote>`.
- Ошибки говорят, что делать дальше, а не только что пошло не так.

Адаптация для Instagram-анализа:

- Тот же HTML-подход и централизованные `locales/ru` / message helpers.
- Не использовать Markdown в пользовательских сообщениях, если выбран HTML parse mode.
- Отчеты в Telegram должны быть короче, чем PDF; полные секции выдаются отдельными сообщениями или artifact.
- Финальные аналитические выводы должны сохранять нейтральный тон: "сигнал", "гипотеза", "можно проверить", а не категоричные утверждения.

### 2.2. Главное меню

Паттерн sibling-бота:

- `/start` сразу показывает состояние аккаунта и главное меню.
- Главное меню строится inline-кнопками.
- В меню есть профиль, пополнение, возможности/помощь, основные действия.
- URL-кнопки добавляются только если ссылки настроены.
- Back-кнопка возвращает в главное меню и очищает FSM state.

Адаптация для Instagram-анализа:

- `/start` должен сразу показывать:
  - бренд;
  - краткую ценность бота;
  - баланс credits;
  - доступные режимы;
  - главное меню.
- Главное меню бота:
  - `Анализ профиля`;
  - `Поиск по фото`;
  - `История`;
  - `Профиль`;
  - `Пополнить кредиты`;
  - `Что умею`;
  - `Поддержка`, если configured.
- Если будущий Mini App включен, его кнопка должна быть первой, как в sibling-боте.

### 2.3. Профиль

Паттерн sibling-бота:

- Экран профиля показывает имя, Telegram/user ID, текущую настройку, total credits, free/purchased credits, referral info.
- Есть кнопки: пригласить друга, скопировать ссылку, пополнить кредиты, назад.

Адаптация для Instagram-анализа:

- Профиль должен показывать:
  - имя/username;
  - Telegram ID;
  - язык;
  - credits total;
  - purchased credits;
  - admin/free grants;
  - число отчетов;
  - активные jobs;
  - retention status;
  - referral link, если referral включен.
- Кнопки:
  - `Пополнить кредиты`;
  - `История`;
  - `Скопировать ссылку`, если referral включен;
  - `Назад`.

### 2.4. Credits/paywall

Паттерн sibling-бота:

- Если не хватает credits, пользователь сразу получает объяснение и клавиатуру пополнения.
- Paywall двухшаговый, если включены оба способа оплаты:
  - выбор метода;
  - выбор пакета.
- Stars показываются как Telegram-native способ.
- Card/YooKassa показывается только если включен.
- Есть custom amount, но готовые пакеты позиционируются как проще/выгоднее.
- Для YooKassa receipt email запрашивается отдельно и запоминается.
- Test mode показывается явным badge.

Адаптация для Instagram-анализа:

- Default payment method в Telegram UX: Stars.
- YooKassa/RUB показывать только если `FEATURE_YOOKASSA_PAYMENTS=true` и policy разрешает этот канал.
- Если включены Stars и YooKassa, сначала показывать метод:
  - `Telegram Stars`;
  - `Банковская карта / СБП`.
- Если включен только Stars, сразу показывать Stars-пакеты.
- Если не хватает credits перед анализом, сообщение должно показывать:
  - стоимость выбранного действия;
  - доступный баланс;
  - кнопку пополнения;
  - кнопку назад/изменить режим.
- Custom amount для этого бота лучше отложить до v1.1, потому что экономика отчетов крупнее и должна проходить `audit-economics`.

### 2.5. Платежная идемпотентность

Паттерн sibling-бота:

- Stars invoice payload кодирует пакет и цену.
- `pre_checkout_query` только проверяет цену и подтверждает checkout.
- Credits начисляются только после `successful_payment`.
- Duplicate payment игнорируется по external charge ID.
- YooKassa создает pending-row, credits начисляются из webhook/reconciliation.

Адаптация для Instagram-анализа:

- Полностью переносим принцип:
  - no credits on pre-checkout;
  - no credits from unchecked YooKassa body;
  - unique charge/payment IDs;
  - idempotent grant exactly once.
- Для этого бота payload должен дополнительно связывать `order_id`, `user_id`, `package_price_id`.

### 2.6. Cancel/back/reset

Паттерн sibling-бота:

- `/cancel` очищает текущий FSM.
- Callback `cancel` очищает state и заменяет сообщение.
- `back:main` очищает state и возвращает главное меню.
- `/reset` очищает диалоговый контекст.

Адаптация для Instagram-анализа:

- `/cancel` должен отменять текущий wizard: username input, photo upload, HR target position, OSINT confirmation, email collection.
- `Назад` возвращает на предыдущий экран wizard или в главное меню.
- `В меню` всегда очищает FSM и возвращает актуальный welcome payload.
- `/reset` в этом боте не должен удалять отчеты; он очищает только текущий report-chat контекст.

### 2.7. Action buttons after result

Паттерн sibling-бота:

- После ответа есть действия: regenerate, continue, TTS.
- Кнопки компактные, в 1-2 ряда.

Адаптация для Instagram-анализа:

- После готового отчета показывать action row:
  - `Секции`;
  - `PDF`;
  - `Задать вопрос`;
  - `Повторить анализ`;
  - `Источники`;
  - `Назад`.
- После ответа report-chat:
  - `Еще вопрос`;
  - `PDF`;
  - `К отчету`;
  - `Назад`.
- Regenerate для отчета допустим только как paid re-analysis или admin retry, потому что provider costs повторяются.

### 2.8. Chunking and long output

Паттерн sibling-бота:

- Лимит Telegram учитывается helper-ами.
- Длинный LLM output отправляется chunked, keyboard только на последнем chunk.
- Для streaming/partial text используется plain text, чтобы не ломать entity parsing.

Адаптация для Instagram-анализа:

- Summary и секции chunked helper-ами.
- Полные большие отчеты отправлять PDF/Markdown artifact.
- Keyboard прикреплять к последнему chunk.
- HTML escaping обязателен для динамических данных: username, bio, captions, comments, model output.

### 2.9. Поддержка, terms, forced subscription

Паттерн sibling-бота:

- `/help` показывает поддержку, пользовательское соглашение, privacy.
- Support/channel URL добавляются в меню только если configured.
- Есть optional force-subscription gate с кнопкой проверки.

Адаптация для Instagram-анализа:

- `/help` должен включать:
  - что бот делает;
  - что бот не делает;
  - правила публичных данных;
  - support link;
  - terms/privacy;
  - `/delete_me`.
- Force-subscription можно оставить optional feature flag, но не смешивать с paid access.

## 3. Что не переносим напрямую

- Выбор LLM-модели пользователем: для этого бота модели должны быть backend config, потому что качество отчета зависит от pipeline, а не от свободного выбора модели.
- Daily free credits как обязательная механика: можно использовать admin/trial grants, но daily allowance для дорогих отчетов может ломать экономику.
- Regenerate/continue как бесплатные кнопки: Instagram-анализ дорогой и должен повторно проходить credit policy.
- TTS/voice/image-generation сценарии AI Assistant: они не относятся к core этого бота.
- Arbitrary custom credits в MVP: сначала нужны стабильные пакеты и `audit-economics`.

## 4. Implementation rules

1. Все bot-authored texts живут в locale/message modules.
2. Telegram handlers не собирают большие строки руками.
3. Callback namespaces короткие и стабильные.
4. `Back` и `Cancel` есть у каждого wizard.
5. Главное меню можно восстановить из любого состояния.
6. Paywall всегда умеет открываться из insufficient-credits error.
7. Stars-first UX, YooKassa as configured external/RUB option.
8. Every payment grant is idempotent.
9. Every long output is chunked and escaped.
10. Domain-specific compliance text has priority over sibling-bot friendliness.
