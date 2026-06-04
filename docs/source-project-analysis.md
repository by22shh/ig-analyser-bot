# Анализ исходного проекта `ig-analyser-site`

Дата анализа: 2026-06-02.

Исходный путь: `/Users/Bayramov_N/Desktop/Other/ig-analyser-site`.

Git-состояние исходного проекта на момент анализа:

- Ветка: `main`.
- HEAD: `436e70f fix: Update translation strings for photo searching in both Russian and English`.
- Незакоммиченные изменения: только untracked-директория `.serena/`.
- `npm run build` не выполнен из-за отсутствующих зависимостей в `node_modules`: `tsc: command not found`.

## 1. Назначение продукта

`ZRETI Instagram Analyzer` - веб-приложение для глубокого анализа публичного Instagram-профиля.

Продуктовая идея:

- пользователь вводит Instagram username или загружает фото для поиска username;
- система собирает публичные посты, метаданные, комментарии и визуальные материалы;
- vision-модель описывает изображения;
- reasoning-модель формирует структурированный отчет;
- пользователь получает дашборд с метриками, графиком активности, секциями отчета, PDF-экспортом и AI-чатом по отчету.

Продукт явно позиционируется как инструмент цифрового профилирования, networking/HR/influencer/OSINT-аналитики. Из-за этого в будущем Telegram-боте нужны юридические и этические ограничения.

## 2. Технологическая структура

Фреймворк:

- Vite.
- React.
- TypeScript.
- Tailwind через CDN в `index.html`.

Основные зависимости:

- `react`, `react-dom`;
- `lucide-react`;
- `recharts`;
- `node-fetch`, `form-data` для Netlify Function;
- TypeScript/Vite dev-зависимости.

Backend как отдельное приложение отсутствует. Есть только Netlify Function для proxy-запросов к FaceCheck.

## 3. Основные файлы

`App.tsx`

- Главный экран и orchestration всего анализа.
- Состояния: `input`, `loading`, `result`.
- Режимы анализа: `standard`, `debt`, `hr`, `influencer`.
- Режим поиска: `username`, `photo`.
- Чистка username из `@name` и `instagram.com/name`.
- Запуск Apify.
- Запуск Gemini/OpenRouter анализа.
- Повтор analysis-only при ошибке финального анализа, если профиль уже загружен.
- Сохранение результата в localStorage history.

`constants.ts`

- Mock-профиль.
- Основной vision prompt.
- Основной standard profile prompt.
- Prompt для debt collector / asset tracing.
- Prompt для HR recruitment.
- Prompt для influencer / brand safety audit.

`services/apifyService.ts`

- Стартует Apify actor `apify/instagram-scraper`.
- Передает `directUrls`, `resultsLimit: 35`, `resultsType: "posts"`, `addParentData: true`.
- Polling выполнения: до 60 попыток с интервалом 4 секунды.
- Забирает dataset items.
- Валидирует, что данные принадлежат запрошенному username.
- Возвращает нормализованный `InstagramProfile`.
- Берет до 30 последних постов.

`services/geminiService.ts`

- На деле работает через OpenRouter endpoint `/api/v1/chat/completions`.
- Модели в коде: `google/gemini-3-pro-preview` для vision, reasoning и chat.
- Загружает изображения через `https://wsrv.nl/?url=...&output=jpg&w=800&q=80`.
- Vision-анализирует до 30 постов пачками по 5 изображений.
- Собирает текстовый контекст профиля и постов.
- Финальный отчет парсит по маркеру `[[SECTION]]`.
- Имеет streaming chat session по готовому отчету.

`services/yandexImageService.ts`

- Название историческое: сервис уже работает не с Yandex, а с FaceCheck proxy.
- Валидирует фото: JPG/JPEG/PNG/WEBP, максимум 10 MB.
- Конвертирует изображение в base64.
- Отправляет в `/api/facecheck-search`.
- Извлекает Instagram username из URL результатов.

`netlify/functions/facecheck-search.js`

- CORS proxy к `https://facecheck.id`.
- Ожидает `FACECHECK_API_TOKEN`.
- Upload: `/api/upload_pic`.
- Polling search: `/api/search`, до 30 секунд.
- Возвращает normalized `{ items: [{ score, url, base64 }] }`.

`components/AnalysisDashboard.tsx`

- Показывает top bar профиля.
- Считает метрики:
  - средние лайки по анализируемым постам;
  - средние комментарии;
  - ER = `((totalLikes + totalComments) / posts.length) / followersCount * 100`;
  - частота публикаций по интервалу между первым и последним из анализируемых постов.
- Строит bar chart лайков/комментариев по датам.
- Показывает digital footprint:
  - уникальные локации;
  - музыка;
  - related profiles;
  - количество закрепленных постов.
- Показывает `DigitalCircle`.
- Рендерит секции отчета.
- Позволяет копировать секции.
- Имеет white-label PDF через `window.print()`: title/logo settings.
- Встраивает `ChatWidget`.

`components/DigitalCircle.tsx` + `utils/analytics.ts`

- Анализирует близкие связи по tagged users, mentions и latest comments.
- Весовые коэффициенты:
  - tag: 2.0;
  - mention: 1.5;
  - comment: 1.0;
  - commentLength bonus: 0.1, максимум +2.0;
  - recency multiplier: 1.5 для постов за последние 30 дней относительно newest post;
  - regularity bonus: 0.5 за взаимодействие в 5+ постах.
- Фильтрует короткий spam вроде `nice`, `cool`, `wow`, single emoji.
- Возвращает top 8 interaction users.

`components/PhotoUploadComponent.tsx`

- Drag-and-drop upload.
- Preview изображения.
- Search button.
- Список найденных Instagram-кандидатов с confidence и ссылкой.
- Выбор кандидата переводит пользователя в username-анализ.

`components/ChatWidget.tsx`

- Чат по готовому отчету.
- Quick chips:
  - "Как начать разговор?";
  - "Оцени искренность";
  - "Психологический портрет".
- Streaming ответа.
- История чата живет только в памяти страницы.

`utils/storage.ts`

- localStorage key: `zreti_recent_searches_v1`.
- Хранит максимум 5 последних анализов.
- Может сохранять весь `profileData` и `reportData`.

`translations.ts`

- RU/EN локализация.
- По умолчанию язык `ru`.

## 4. Данные Instagram

Нормализованная модель `InstagramProfile`:

- `username`;
- `fullName`;
- `biography`;
- `followersCount`;
- `followsCount`;
- `postsCount`;
- `profilePicUrl`;
- `posts`;
- `externalUrl`;
- `isVerified`;
- `relatedProfiles`;
- `_rawDebug`.

Нормализованная модель `InstagramPost`:

- `id`;
- `type`: `Image`, `Video`, `Carousel`, `Sidecar`;
- `caption`;
- `hashtags`;
- `mentions`;
- `likesCount`;
- `commentsCount`;
- `latestComments`;
- `timestamp`;
- `displayUrl`;
- `url`;
- `videoViewCount`;
- `videoDuration`;
- `location`;
- `isPinned`;
- `productType`;
- `musicInfo`;
- `childPosts`;
- `taggedUsers`.

## 5. Пайплайн анализа

Полный pipeline сайта:

1. Пользователь вводит username.
2. UI чистит username:
   - trim;
   - извлечение из `instagram.com/...`;
   - удаление `@`;
   - удаление пробелов.
3. Проверяется `VITE_APIFY_TOKEN`.
4. Запускается Apify actor.
5. UI показывает stage 1: сбор данных.
6. Actor polling до завершения.
7. Dataset маппится в `InstagramProfile`.
8. UI показывает stage 2: анализ медиа.
9. Берутся первые 30 постов.
10. Изображения грузятся через proxy/resizer.
11. Vision LLM анализирует изображения пачками по 5.
12. Параллельно готовится metadata context.
13. UI показывает stage 3: финальный анализ.
14. Reasoning LLM получает профиль, посты и visual intelligence.
15. Ответ парсится по `[[SECTION]]`.
16. Результат сохраняется в localStorage history.
17. Показывается dashboard.

Photo pipeline:

1. Пользователь выбирает `По Фото`.
2. Загружает файл.
3. Клиент валидирует тип и размер.
4. Фото отправляется в FaceCheck proxy.
5. FaceCheck возвращает найденные URL.
6. Клиент извлекает username из `instagram.com/{username}`.
7. Пользователь выбирает username.
8. Дальше запускается обычный username pipeline.

## 6. Режимы анализа

### Standard

Цель: понять человека, стиль контакта, поводы для разговора, ценность профиля, паттерны и инсайты.

Отчет требует 17 разделов:

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

Особенности:

- В каждом разделе должны быть ссылки на посты.
- Нужны конкретные детали из vision-анализа.
- Запрещены банальные выводы без фактов.
- Разделы 12 и 13 особенно важны для прикладной ценности.

### Debt

Исходный prompt формулирует задачу как OSINT/asset tracing для взыскания. В нем есть рискованные формулировки про давление и социальные рычаги.

Для Telegram-бота этот режим нельзя переносить без переработки. Безопасная версия должна быть ограничена:

- только законным анализом публично доступных данных;
- только для пользователя с подтвержденным правовым основанием;
- без инструкций по преследованию, давлению на третьих лиц, доксингу, угрозам или обходу приватности;
- с логированием доступа и отдельной ролью/тарифом.

### HR

Цель: оценить кандидата для позиции `targetPosition`.

Отчет требует 8 разделов:

1. Cultural fit.
2. Красные флаги и риски.
3. Soft skills.
4. Digital reputation.
5. Motivation and energy.
6. Hidden insights.
7. Interview recommendations.
8. Verdict.

Для бота нужен явный дисклеймер: HR-режим не заменяет интервью, тестовое задание, рекомендации и юридически корректную процедуру найма. Желательно использовать только при согласии кандидата или ином законном основании.

### Influencer

Цель: оценить блогера перед покупкой рекламы.

Отчет требует 8 разделов:

1. Brand safety.
2. Audience quality.
3. Authenticity check.
4. Advertising blindness / ad saturation.
5. Visual and production value.
6. Hidden insights.
7. Effectiveness forecast.
8. Marketer verdict.

## 7. Ошибки и edge cases исходного сайта

Private profile:

- Если Apify не возвращает корректного владельца или `Unknown`, UI показывает `ACCESS_DENIED_PRIVATE`.
- Пользователю объясняется, что анализ возможен только для публичных аккаунтов.

Identity mismatch:

- Если dataset относится к другому username, выбрасывается ошибка `Identity Mismatch`.

No API token:

- Apify token отсутствует: ошибка конфигурации.
- OpenRouter key отсутствует: ошибка `OPENROUTER_API_KEY is missing`.
- FaceCheck token отсутствует: serverless-функция возвращает 500.

Credits/quota:

- OpenRouter 402 или mentions `credit`, `balance`, `quota` превращаются в `ACCESS_DENIED_CREDITS`.

Timeouts:

- Apify polling максимум около 4 минут.
- FaceCheck polling максимум около 30 секунд.
- Image fetch timeout 8 секунд.
- Vision LLM timeout 25 секунд.
- Reasoning LLM timeout 120 секунд.
- Chat timeout 45 секунд.

## 8. Ограничения текущей реализации, важные для бота

1. API-ключи частично инжектятся в клиентский bundle через Vite define. Для Telegram-бота так делать нельзя: все секреты должны быть только на сервере.
2. localStorage не подходит для бота: нужна БД.
3. Долгие операции нельзя держать в одном Telegram webhook request: нужен быстрый ACK и фоновые jobs.
4. PDF через browser print не подходит серверному боту: нужен HTML-to-PDF renderer или генерация PDF на сервере.
5. Chat history сейчас in-memory: в боте нужно хранить thread/session per report.
6. `yandexImageService.ts` называется неверно и должен быть переименован в FaceCheck adapter.
7. Debt prompt содержит потенциально опасные инструкции; нужна переработка режима.
8. Текущий сайт не имеет ролей, тарифов, rate limits и audit trail.
9. Нет backend-level retries/circuit breakers по внешним API, кроме простых retry в Apify/OpenRouter.
10. Нет централизованной observability.
