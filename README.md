# ZRETI Telegram Bot

Отдельный репозиторий для разработки Telegram-бота на основе существующего проекта `ig-analyser-site`.

Текущий статус: подготовлена продуктовая и техническая спецификация, код бота еще не реализован.

После повторного ревью спецификация считается достаточной для старта Phase 0/Phase 1 разработки: инфраструктура, Telegram webhook, onboarding, wizard анализа, очередь, моковый worker и первые тесты. Для публичного релиза еще нужно закрыть бизнес- и compliance-вопросы из раздела `Open questions`.

## Документы

- [SPECIFICATION.md](./SPECIFICATION.md) - основная спецификация продукта, архитектуры, UX, данных, интеграций и плана разработки.
- [docs/source-project-analysis.md](./docs/source-project-analysis.md) - детальный разбор текущего React/Vite-сайта, на котором основана спецификация.
- [docs/financial-model.md](./docs/financial-model.md) - финансовая модель: Telegram Stars, YooKassa, credit packages, unit economics, no-loss guardrails, margin targets, refunds и break-even.
- [docs/sibling-bot-ux-reference.md](./docs/sibling-bot-ux-reference.md) - UX-паттерны sibling-бота `ai-assistant-bot`, которые нужно сохранить для единого формата группы ботов.

## Предлагаемый стек

- TypeScript + Node.js.
- Telegram framework: `grammy` или NestJS-модуль вокруг `grammy`.
- PostgreSQL для пользователей, заданий, отчетов и биллинга.
- Redis + BullMQ для долгих задач анализа.
- S3/R2-compatible storage для PDF, HTML-экспортов, временных фото и артефактов.
- Apify для сбора публичных данных Instagram.
- OpenRouter-compatible LLM API для vision/reasoning/chat.
- FaceCheck через серверный адаптер для поиска Instagram по фото.
- Telegram Stars как Telegram-native канал покупки цифровых credit packages.
- YooKassa как RUB-агрегатор для external/manual credit package checkout после compliance review.
- `audit-economics` как обязательная CI-проверка перед включением платных пакетов и реальных провайдеров.

## Принципиальные решения

- Все ключи и внешние интеграции должны жить только на сервере.
- Публичный paid launch блокируется, пока экономика не проходит строгий guardrail: net revenue после консервативного платежного резерва должен покрывать p75/worst-case provider cost минимум в 3 раза.
- Stars и YooKassa считаются разными payment providers: XTR начисляется через `successful_payment`, RUB через YooKassa webhook/reconciliation.
- Формат сообщений, меню, профиль, credits/paywall и базовые пользовательские сценарии должны быть максимально похожи на `ai-assistant-bot`, если это не конфликтует с ZRETI-аналитикой и compliance.
- Анализ запускается асинхронно через очередь, потому что текущий сайт уже показывает долгий pipeline: Apify polling, vision-анализ пачками и финальный reasoning-запрос.
- Telegram-выдача строится вокруг короткого summary, секций отчета, PDF/HTML-экспорта и чата по готовому отчету.
- Рискованные OSINT-сценарии из сайта должны быть переработаны в compliance-safe режимы с согласием, аудитом, лимитами и запретом на преследование, доксинг и давление на третьих лиц.

## Финансовый статус пакетов

При иллюстративной себестоимости standard report `55 ₽` текущие RUB-пакеты не выглядят убыточными по variable cost, но discounted Pro/Agency/Scale не проходят строгий `3x` guardrail после 20% платежного резерва. Stars-пакеты стартуют без bulk-discount: `230 XTR/credit`, что barely проходит `3x` при текущем payout floor. Рекомендация для старта: публично показывать Stars Start и/или YooKassa Start, а discounted RUB Pro/Agency/Scale скрыть, поднять цены или включить только после измерения реального `C_standard p75`.
