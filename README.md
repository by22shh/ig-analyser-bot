# ZRETI Telegram Bot

Отдельный репозиторий для разработки Telegram-бота на основе существующего проекта `ig-analyser-site`.

Текущий статус: подготовлена продуктовая и техническая спецификация, код бота еще не реализован.

После повторного ревью спецификация считается достаточной для старта Phase 0/Phase 1 разработки: инфраструктура, Telegram webhook, onboarding, wizard анализа, очередь, моковый worker и первые тесты. Для публичного релиза еще нужно закрыть бизнес- и compliance-вопросы из раздела `Open questions`.

## Документы

- [SPECIFICATION.md](./SPECIFICATION.md) - основная спецификация продукта, архитектуры, UX, данных, интеграций и плана разработки.
- [docs/source-project-analysis.md](./docs/source-project-analysis.md) - детальный разбор текущего React/Vite-сайта, на котором основана спецификация.
- [docs/financial-model.md](./docs/financial-model.md) - финансовая модель: YooKassa, credit packages, unit economics, no-loss guardrails, margin targets, refunds и break-even.

## Предлагаемый стек

- TypeScript + Node.js.
- Telegram framework: `grammy` или NestJS-модуль вокруг `grammy`.
- PostgreSQL для пользователей, заданий, отчетов и биллинга.
- Redis + BullMQ для долгих задач анализа.
- S3/R2-compatible storage для PDF, HTML-экспортов, временных фото и артефактов.
- Apify для сбора публичных данных Instagram.
- OpenRouter-compatible LLM API для vision/reasoning/chat.
- FaceCheck через серверный адаптер для поиска Instagram по фото.
- YooKassa как основной платежный агрегатор для RUB-покупок credit packages.
- `audit-economics` как обязательная CI-проверка перед включением платных пакетов и реальных провайдеров.

## Принципиальные решения

- Все ключи и внешние интеграции должны жить только на сервере.
- Публичный paid launch блокируется, пока экономика не проходит строгий guardrail: net revenue после консервативного платежного резерва должен покрывать p75/worst-case provider cost минимум в 3 раза.
- Анализ запускается асинхронно через очередь, потому что текущий сайт уже показывает долгий pipeline: Apify polling, vision-анализ пачками и финальный reasoning-запрос.
- Telegram-выдача строится вокруг короткого summary, секций отчета, PDF/HTML-экспорта и чата по готовому отчету.
- Рискованные OSINT-сценарии из сайта должны быть переработаны в compliance-safe режимы с согласием, аудитом, лимитами и запретом на преследование, доксинг и давление на третьих лиц.

## Финансовый статус пакетов

При иллюстративной себестоимости standard report `55 ₽` текущие пакеты не выглядят убыточными по variable cost, но Pro/Agency/Scale не проходят строгий `3x` guardrail после 20% платежного резерва. Рекомендация для старта: публично показывать Start, а Pro/Agency/Scale скрыть, поднять цены или включить только после измерения реального `C_standard p75`.
