import { env } from "../../config/env.js";
import { AnalysisMode } from "../constants.js";
import { escapeHtml, formatCredits, percent } from "../formatters/html.js";
import type { PackageView } from "../../modules/billing/packages.js";
import type { ReportMetrics, ReportSummaryView } from "../../modules/reports/types.js";

export const ru = {
  brand: env.BRAND_NAME,
  buttons: {
    miniApp: "🚀 Открыть Mini App",
    analyze: "🔎 Анализ профиля",
    photo: "🖼 Поиск по фото",
    history: "🗂 История",
    profile: "👤 Профиль",
    credits: "💎 Пополнить кредиты",
    capabilities: "✨ Что я умею",
    channel: "📢 Группа",
    support: "🛟 Поддержка",
    settings: "⚙️ Настройки",
    admin: "🛠 Админка",
    terms: "☑️ Правила",
    back: "⬅️ Назад",
    cancel: "✖️ Отменить",
    menu: "🏠 В меню",
    accept: "✅ Принимаю правила",
    decline: "❌ Отказаться",
    subscribe: "📢 Подписаться",
    checkSubscription: "✅ Я подписался",
    restart: "🔁 Начать заново",
    skip: "Пропустить",
    run: "▶️ Запустить",
    confirmLawfulBasis: "✅ Подтверждаю правовое основание",
    stars: "⭐ Telegram Stars",
    yookassa: "💳 Банковская карта / СБП",
    pay: "Оплатить",
    sections: "📚 Секции",
    pdf: "📄 PDF",
    markdown: "📝 Markdown",
    chat: "💬 Задать вопрос",
    sources: "🔗 Источники",
    repeat: "🔁 Повторить анализ",
    confirmDelete: "🗑 Да, удалить навсегда",
    openInstagram: "🔗 Открыть в Instagram",
    prevSection: "◀️ Пред.",
    nextSection: "След. ▶️",
    toSections: "📚 К секциям"
  },
  modeTitle(mode: AnalysisMode): string {
    const titles: Record<AnalysisMode, string> = {
      standard: "Стандартный",
      influencer: "Аудит блогера",
      hr: "HR-контекст",
      osint_compliance: "OSINT-проверка"
    };
    return titles[mode];
  },
  chooseLanguage(): string {
    return (
      "🌐 <b>Выберите язык</b> / <b>Choose your language</b>\n\n" +
      "На выбранном языке будут меню бота и отчёты. / Menus and reports will use the language you pick."
    );
  },
  startNeedsConsent(): string {
    return (
      `👁 <b>${escapeHtml(this.brand)}</b> анализирует только публичные Instagram-данные.\n\n` +
      "Нельзя использовать бота для преследования, доксинга, угроз, давления или обхода приватности. " +
      "Фото-поиск требует, чтобы у вас было право использовать изображение.\n\n" +
      "Нажмите «Принимаю», чтобы продолжить, или «Отказаться»."
    );
  },
  consentDeclined(): string {
    return (
      "🚫 <b>Доступ закрыт</b>\n\n" +
      "Без согласия с правилами пользоваться ботом нельзя. Если передумаете — нажмите «Начать заново» или отправьте /start."
    );
  },
  subscriptionRequired(channelUrl: string): string {
    const link = channelUrl ? `<a href="${escapeHtml(channelUrl)}">наш канал</a>` : "наш канал";
    return (
      "📢 <b>Остался один шаг</b>\n\n" +
      `Чтобы пользоваться ботом, подпишитесь на ${link}. После подписки нажмите «Я подписался».`
    );
  },
  subscriptionStillMissing(): string {
    return "Пока не вижу вашу подписку. Подпишитесь на канал и снова нажмите «Я подписался».";
  },
  welcome(input: {
    totalUnits: number;
    purchasedUnits: number;
    grantedUnits: number;
    language: string;
    photoSearchEnabled?: boolean;
    welcomeBonusCredits?: number;
  }): string {
    const photoLine = input.photoSearchEnabled ? "• найти возможный профиль по фото\n" : "";
    const photoTariff = input.photoSearchEnabled ? " · фото 1" : "";
    const bonusLine =
      input.welcomeBonusCredits && input.welcomeBonusCredits > 0
        ? `🎁 <b>Вам начислен бонус: ${formatCredits(input.welcomeBonusCredits * 100)} 💎</b> — первого отчёта хватит бесплатно.\n\n`
        : "";
    return (
      bonusLine +
      "👁 <b>Разбор публичного Instagram-профиля</b>\n\n" +
      "🤝 Готовитесь к встрече, партнёрству или деловому контакту?\n" +
      "🕵️ Нужно аккуратно проверить публичный контекст профиля?\n" +
      "📣 Оцениваете автора, кандидата или личный бренд по открытым данным?\n\n" +
      "Пришлите @username или ссылку — соберу открытые данные и превращу их в понятный стратегический отчёт.\n\n" +
      "<b>Вы получите:</b>\n" +
      "• позиционирование и заметные сигналы профиля\n" +
      "• темы, визуальный стиль и повторяющиеся паттерны\n" +
      "• практические выводы для HR, блогинга или личной стратегии\n" +
      photoLine +
      "• PDF/Markdown и чат по готовому отчёту\n\n" +
      `💎 Баланс: <b>${formatCredits(input.totalUnits)}</b> · тарифы: стандарт 1 · блогер/HR 2${photoTariff}\n` +
      `🌐 Язык отчёта: <b>${escapeHtml(input.language)}</b>\n\n` +
      "Начните с кнопки «Анализ профиля»."
    );
  },
  capabilities(): string {
    return (
      `✨ <b>Что умеет ${escapeHtml(this.brand)}</b>\n\n` +
      "• Собирает публичные посты и метаданные профиля.\n" +
      "• Анализирует до 30 последних постов, визуальные паттерны и карту окружения (Digital Circle).\n" +
      "• Даёт краткий вывод в Telegram, подробные секции и экспорт в PDF/Markdown/HTML.\n" +
      "• Позволяет задавать вопросы по готовому отчёту.\n\n" +
      "<b>Тарифы:</b> стандарт 1 💎 · блогер/HR 2 💎 · OSINT 3 💎 · фото 1 💎 · вопрос в чате 0.05 💎\n\n" +
      `${escapeHtml(this.brand)} не анализирует закрытые профили и не помогает с преследованием, доксингом или давлением.`
    );
  },
  profile(input: {
    name: string;
    telegramId: string | number;
    language: string;
    totalUnits: number;
    purchasedUnits: number;
    grantedUnits: number;
    completedReports: number;
    activeJobs: number;
    retentionDays: number;
  }): string {
    return (
      `👤 <b>Профиль:</b> ${escapeHtml(input.name)}\n` +
      `🆔 Telegram ID: <code>${escapeHtml(input.telegramId)}</code>\n` +
      `🌐 Язык: <b>${escapeHtml(input.language)}</b>\n\n` +
      `💎 <b>Кредиты: ${formatCredits(input.totalUnits)}</b>\n` +
      `• куплено: ${formatCredits(input.purchasedUnits)}\n` +
      `• выдано/промо: ${formatCredits(input.grantedUnits)}\n\n` +
      `📚 Отчётов: <b>${input.completedReports}</b>\n` +
      `⏳ Активных задач: <b>${input.activeJobs}</b>\n` +
      `🧹 Хранение отчётов: <b>${input.retentionDays} дн.</b>`
    );
  },
  balance(input: {
    totalUnits: number;
    purchasedUnits: number;
    grantedUnits: number;
    photoSearchEnabled?: boolean;
    osintEnabled?: boolean;
  }): string {
    const photoLine = input.photoSearchEnabled ? "\n• поиск по фото: <b>1</b> 💎" : "";
    const osintLine = input.osintEnabled ? "\n• OSINT-проверка: <b>3</b> 💎" : "";
    return (
      `💎 <b>Ваши кредиты: ${formatCredits(input.totalUnits)}</b>\n` +
      `• куплено: ${formatCredits(input.purchasedUnits)}\n` +
      `• выдано/промо: ${formatCredits(input.grantedUnits)}\n\n` +
      "<b>Тарифы:</b>\n" +
      "• стандартный анализ: <b>1</b> 💎\n" +
      "• аудит блогера / HR-контекст: <b>2</b> 💎" +
      osintLine +
      photoLine +
      "\n• вопрос в чате по отчёту: <b>0.05</b> 💎"
    );
  },
  insufficientCredits(input: { costUnits: number; availableUnits: number }): string {
    return (
      "💎 <b>Не хватает кредитов</b>\n\n" +
      `Стоимость действия: <b>${formatCredits(input.costUnits)}</b> 💎\n` +
      `Доступно: <b>${formatCredits(input.availableUnits)}</b> 💎\n\n` +
      "Пополните баланс или выберите действие дешевле."
    );
  },
  askUsername(): string {
    return (
      "🔎 <b>Кого анализируем?</b>\n\n" +
      "Пришлите username, @username или ссылку вида <code>https://instagram.com/username</code>.\n\n" +
      "Я анализирую только публичные профили."
    );
  },
  invalidUsername(): string {
    return "Не похоже на Instagram username. Пришлите @username или ссылку на профиль.";
  },
  chooseMode(username: string): string {
    return `Выберите режим анализа для <b>@${escapeHtml(username)}</b>.`;
  },
  askHrPosition(): string {
    return "HR-режим включён только как дополнительный публичный контекст. Пришлите позицию кандидата, например <code>Senior backend engineer</code>.";
  },
  askGoal(username: string): string {
    return (
      `🎯 <b>Цель анализа @${escapeHtml(username)}</b>\n\n` +
      "Пришлите коротко, под какое решение нужен отчёт: партнёрство, найм, знакомство, аудит блога или другой контекст."
    );
  },
  osintRestricted(): string {
    return "OSINT-проверка доступна только пользователям с ролью compliance/admin и отдельным подтверждением правового основания.";
  },
  modeUnavailable(): string {
    return "Этот режим сейчас недоступен. Вернитесь в меню и выберите доступный режим.";
  },
  askOsintLawfulBasis(): string {
    return (
      "⚖️ <b>Подтверждение правового основания</b>\n\n" +
      "OSINT-проверку можно использовать только для законной проверки публичных фактов. Подтвердите, что у вас есть правовое основание, вы не будете использовать отчёт для давления, преследования, доксинга или обхода приватности, а выводы будут проверяться как гипотезы."
    );
  },
  confirmAnalysis(input: {
    username: string;
    mode: AnalysisMode;
    costUnits: number;
    goal?: string;
  }): string {
    const goalLine = input.goal ? `Цель: <i>${escapeHtml(input.goal)}</i>\n` : "";
    return (
      "✅ <b>Проверьте задачу</b>\n\n" +
      `Профиль: <b>@${escapeHtml(input.username)}</b>\n` +
      `Режим: <b>${this.modeTitle(input.mode)}</b>\n` +
      goalLine +
      `Стоимость: <b>${formatCredits(input.costUnits)}</b> 💎\n` +
      "Обычно анализ занимает 3–8 минут."
    );
  },
  jobQueued(username: string): string {
    return `⏳ Задача по <b>@${escapeHtml(username)}</b> принята. Я пришлю прогресс и отчёт сюда.`;
  },
  jobAlreadyQueued(username: string): string {
    return `⏳ Задача по <b>@${escapeHtml(username)}</b> уже поставлена в очередь. Я пришлю прогресс и отчёт сюда.`;
  },
  staleConfirmation(): string {
    return "Это подтверждение устарело. Откройте анализ заново и подтвердите актуальную задачу.";
  },
  progress(stage: string, current: number, total: number): string {
    const suffix = total > 0 ? ` ${current}/${total}` : "";
    return `⏳ <b>${escapeHtml(stage)}</b>${suffix}`;
  },
  reportReady(input: {
    username: string;
    mode: AnalysisMode;
    metrics: ReportMetrics;
    summary: ReportSummaryView;
  }): string {
    const m = input.metrics;
    const warnings = renderReportWarnings(input.summary.warnings, "Ограничения качества");
    const health = input.summary.analysisHealth;
    const healthText = health
      ? "\n\n<b>Здоровье анализа:</b>\n" +
        `• формат: ${escapeHtml(health.formatLabel)}\n` +
        `• покрытие: ${health.analyzedPosts}/${health.postsCount} (${health.sampleCoveragePercent ?? 0}%)\n` +
        `• vision: ${health.visionCompleted}/${health.visionTotal}\n` +
        `• покрытие комментариев: ${health.postsWithCommentText}/${health.analyzedPosts} (${health.commentCoveragePercent ?? 0}%)\n` +
        `• текстовых комментариев: ${health.commentTextCount}\n`
      : "";
    const executive = input.summary.executiveSummary
      ? `<b>Что это значит:</b>\n${escapeHtml(input.summary.executiveSummary)}\n\n`
      : "";
    return (
      `✅ <b>Отчёт по @${escapeHtml(input.username)} готов</b>\n` +
      `Режим: <b>${this.modeTitle(input.mode)}</b>\n\n` +
      executive +
      "<b>Метрики:</b>\n" +
      `• подписчики: ${m.followersCount.toLocaleString("ru-RU")}\n` +
      `• постов в анализе: ${m.analyzedPosts}\n` +
      `• средние лайки: ${Math.round(m.avgLikes).toLocaleString("ru-RU")}\n` +
      `• средние комментарии: ${Math.round(m.avgComments).toLocaleString("ru-RU")}\n` +
      `• вовлечённость (ER): ${percent(m.engagementRate)}\n` +
      `• частота: раз в ${m.frequencyDays.toFixed(1)} дн.` +
      healthText +
      "\n" +
      "<b>Короткий вывод:</b>\n" +
      input.summary.bullets.map((item) => `• ${escapeHtml(item)}`).join("\n") +
      warnings
    );
  },
  sectionsIntro(username: string): string {
    return `📚 <b>Секции отчёта @${escapeHtml(username)}</b>\nВыберите раздел.`;
  },
  section(title: string, content: string): string {
    return `📌 <b>${escapeHtml(title)}</b>\n\n${escapeHtml(content)}`;
  },
  sectionProgress(position: number, total: number): string {
    return `Раздел ${position} из ${total}`;
  },
  reportSources(input: {
    username: string;
    sources: Array<{ label: string; url?: string }>;
  }): string {
    const items = input.sources.slice(0, 20).map((source, index) => {
      const label = escapeHtml(source.label || `Источник ${index + 1}`);
      return source.url
        ? `${index + 1}. <a href="${escapeHtml(source.url)}">${label}</a>`
        : `${index + 1}. ${label}`;
    });
    const suffix =
      input.sources.length > 20 ? `\n\nПоказаны первые 20 из ${input.sources.length}.` : "";
    return items.length
      ? `🔗 <b>Источники отчёта @${escapeHtml(input.username)}</b>\n\n${items.join("\n")}${suffix}`
      : `🔗 <b>Источники отчёта @${escapeHtml(input.username)}</b>\n\nВ этом отчёте источники не найдены.`;
  },
  historyTitle(): string {
    return "🗂 <b>Последние отчёты</b>\nВыберите отчёт, чтобы открыть секции и экспорт.";
  },
  historyEmpty(): string {
    return "История пока пустая. Запустите первый анализ кнопкой «Анализ профиля».";
  },
  relativeDate(date: Date): string {
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (days <= 0) return "сегодня";
    if (days === 1) return "вчера";
    if (days < 7) return `${days} дн. назад`;
    if (days < 30) return `${Math.floor(days / 7)} нед. назад`;
    if (days < 365) return `${Math.floor(days / 30)} мес. назад`;
    return `${Math.floor(days / 365)} г. назад`;
  },
  artifactCaption(type: "pdf" | "markdown" | "html"): string {
    const titles = { pdf: "PDF-отчёт", markdown: "Markdown-отчёт", html: "HTML-отчёт" };
    return `📄 ${titles[type]}`;
  },
  artifactMissing(type: "pdf" | "markdown" | "html"): string {
    const titles = { pdf: "PDF", markdown: "Markdown", html: "HTML" };
    return `${titles[type]} пока не найден. Попробуйте позже или откройте секции отчёта.`;
  },
  artifactLinkFallback(type: "pdf" | "markdown" | "html", url: string): string {
    const titles = { pdf: "PDF", markdown: "Markdown", html: "HTML" };
    return `📄 <b>${titles[type]}</b>\n\nСсылка для скачивания: ${escapeHtml(url)}`;
  },
  repeatAnalysis(username: string): string {
    return `🔁 Повторяем анализ <b>@${escapeHtml(username)}</b>. Проверьте режим и стоимость.`;
  },
  paywallIntro(testMode: boolean): string {
    const badge = testMode ? "🧪 <b>Тестовый режим оплаты</b>\n\n" : "";
    return `${badge}💎 <b>Пополнение кредитов</b>\n\nВыберите способ оплаты. Основной способ в Telegram — Stars.`;
  },
  starsIntro(): string {
    return "⭐ <b>Оплата через Telegram Stars</b>\n\nВыберите пакет. Кредиты начислятся автоматически после оплаты.";
  },
  yookassaIntro(testMode: boolean): string {
    const badge = testMode ? "🧪 <b>Тестовый режим YooKassa</b>\n\n" : "";
    return `${badge}💳 <b>Оплата картой или СБП</b>\n\nВыберите пакет. После оплаты на странице YooKassa кредиты начислятся автоматически.`;
  },
  askReceiptEmail(): string {
    return (
      "✉️ <b>Email для чека</b>\n\n" +
      "Для оплаты картой или СБП нужен email для фискального чека. Пришлите адрес одним сообщением — я сохраню его для следующих оплат."
    );
  },
  invalidEmail(): string {
    return "Не похоже на email. Пришлите адрес вида <code>name@example.com</code> или нажмите «Отменить».";
  },
  emailSaved(email: string): string {
    return `Email для чеков сохранён: <code>${escapeHtml(email)}</code>`;
  },
  yookassaPaymentCreated(amountMinor: number): string {
    return `💳 <b>Ссылка на оплату создана</b>\n\nСумма: <b>${(amountMinor / 100).toFixed(2)} ₽</b>\nПосле подтверждения YooKassa кредиты начислятся автоматически.`;
  },
  paymentMethodUnavailable(): string {
    return "Этот способ оплаты сейчас недоступен. Выберите другой способ или вернитесь в меню.";
  },
  packageButton(pkg: PackageView, provider: "telegram_stars" | "yookassa"): string {
    return provider === "telegram_stars"
      ? `${pkg.title} — ${formatCredits(pkg.creditsUnits)}💎 за ${pkg.starsAmount} ⭐`
      : `${pkg.title} — ${formatCredits(pkg.creditsUnits)}💎 за ${pkg.rubAmount} ₽`;
  },
  starsInvoiceTitle(pkg: PackageView): string {
    return `${pkg.title}: ${formatCredits(pkg.creditsUnits)} кредитов`;
  },
  starsInvoiceDescription(pkg: PackageView): string {
    return `Пакет кредитов ${pkg.title}`;
  },
  starsInvoiceAlreadyPending(): string {
    return "⭐ У вас уже есть активный счёт Telegram Stars для этого пакета. Откройте предыдущее сообщение со счётом или подождите, пока он истечёт.";
  },
  preCheckoutPayloadInvalid(): string {
    return "Цена устарела. Откройте пополнение заново.";
  },
  preCheckoutPaymentInvalid(): string {
    return "Платёж не найден или сумма изменилась.";
  },
  paymentSuccess(units: number, balance: number): string {
    return `✅ Кредиты начислены: <b>${formatCredits(units)}</b> 💎\nБаланс: <b>${formatCredits(balance)}</b> 💎`;
  },
  settings(input: { language: string; exportFormat: string; retentionDays: number }): string {
    return (
      "⚙️ <b>Настройки</b>\n\n" +
      `🌐 Язык интерфейса и отчётов: <b>${escapeHtml(input.language)}</b>\n` +
      `📄 Формат экспорта по умолчанию: <b>${escapeHtml(input.exportFormat.toUpperCase())}</b>\n` +
      `🧹 Хранение отчётов: <b>${input.retentionDays} дн.</b>\n\n` +
      "Текущие значения отмечены галочкой."
    );
  },
  settingsUpdated(): string {
    return "✅ Настройки обновлены.";
  },
  languageUpdated(language: string): string {
    return `🌐 Язык изменён: <b>${escapeHtml(language)}</b>.`;
  },
  exportFormatTitle(format: "pdf" | "markdown" | "html"): string {
    const titles = { pdf: "PDF", markdown: "Markdown", html: "HTML" };
    return titles[format];
  },
  retentionTitle(days: number): string {
    return `${days} дн.`;
  },
  resetDone(): string {
    return "🧹 Контекст диалога по отчёту очищен. Сами отчёты и история сохранены.";
  },
  photoIntro(): string {
    return (
      "🖼 <b>Поиск возможного Instagram-профиля по фото</b>\n\n" +
      "Нажмите подтверждение, если у вас есть право использовать изображение. Результаты будут показаны как возможные совпадения, не как доказательство личности."
    );
  },
  photoAsk(): string {
    return "Пришлите фото или изображение файлом до лимита. Исходное фото не сохраняется в отчётах; запись поиска удаляется по сроку хранения.";
  },
  photoRightConfirm(): string {
    return "✅ Есть право использовать фото";
  },
  photoDisabled(): string {
    return "Поиск по фото сейчас недоступен. Можно ввести username вручную.";
  },
  photoTooLarge(maxMb: number): string {
    return `Файл слишком большой. Максимум ${maxMb} MB.`;
  },
  photoInvalidType(): string {
    return "Поддерживаются только JPG, PNG или WEBP.";
  },
  photoAccepted(): string {
    return "🔎 Фото принято. Ищу возможные Instagram-кандидаты.";
  },
  photoMatches(matches: Array<{ username: string }>): string {
    return matches.length
      ? "🔎 <b>Возможные Instagram-кандидаты</b>\n\nЭто не подтверждение личности, а список возможных совпадений. Процент — оценка визуального сходства. Выберите кандидата, чтобы запустить анализ профиля."
      : "По этому фото не удалось найти Instagram-кандидатов. Попробуйте другое изображение или введите username вручную.";
  },
  photoSearchFailed(): string {
    return (
      "⚠️ <b>Не удалось завершить поиск по фото</b>\n\n" +
      "Мы попробовали несколько раз, но сервис поиска не вернул результат. " +
      "💎 Зарезервированные кредиты возвращены на баланс — попробуйте другое фото позже или введите username вручную."
    );
  },
  chatIntro(): string {
    return "💬 <b>Чат по отчёту</b>\n\nЗадайте вопрос или выберите быстрый вариант. Каждый вопрос — 0.05 💎.";
  },
  chatQuick: {
    introLabel: "Как начать разговор?",
    sincerityLabel: "Проверить искренность",
    portraitLabel: "Коммуникационный портрет",
    introQuestion: "Как лучше начать разговор с этим человеком?",
    sincerityQuestion:
      "Какие сигналы искренности или постановочности можно осторожно проверить по отчёту?",
    portraitQuestion:
      "Сформулируй осторожные гипотезы о коммуникационном стиле по публичным данным.",
    fallbackQuestion: "Что важно проверить по отчёту?"
  },
  progressStages: {
    fetchingProfile: "Сбор публичных данных",
    analyzingSignals: "Анализ визуальных и текстовых сигналов",
    generatingExports: "Генерация PDF/Markdown/HTML"
  },
  adminGrantUsage(): string {
    return "Использование: /admin_grant <telegram_id> <credits>";
  },
  adminUserNotFound(): string {
    return "Пользователь не найден.";
  },
  adminGrantDone(input: { credits: number; telegramId: number }): string {
    return `Начислено ${input.credits} кредитов пользователю <code>${input.telegramId}</code>.`;
  },
  adminStats(input: { users: number; jobs: number; failed: number; payments: number }): string {
    return (
      "🛠 <b>Админка</b>\n\n" +
      `Пользователей: <b>${input.users}</b>\n` +
      `Активных задач: <b>${input.jobs}</b>\n` +
      `Ошибок задач: <b>${input.failed}</b>\n` +
      `Оплаченных заказов: <b>${input.payments}</b>`
    );
  },
  help(supportUrl: string, termsUrl: string, privacyUrl: string): string {
    const support = supportUrl ? `\n🛟 <a href="${escapeHtml(supportUrl)}">Поддержка</a>` : "";
    const terms = termsUrl
      ? `\n☑️ <a href="${escapeHtml(termsUrl)}">Пользовательское соглашение</a>`
      : "";
    const privacy = privacyUrl
      ? `\n🔒 <a href="${escapeHtml(privacyUrl)}">Политика конфиденциальности</a>`
      : "";
    return (
      "ℹ️ <b>Помощь</b>\n\n" +
      "<b>Анализ профиля.</b> Нажмите «Анализ профиля» и пришлите публичный @username (можно просто отправить username в чат). Выберите режим, подтвердите стоимость — придут краткий вывод, секции и PDF/Markdown.\n" +
      "<b>Поиск по фото.</b> Если включён — ищет возможные профили по изображению (нужно право на фото).\n" +
      "<b>Чат по отчёту.</b> Откройте отчёт → «Задать вопрос» и спросите по публичным данным.\n" +
      "<b>История.</b> Готовые отчёты и экспорт всегда доступны в «Истории».\n\n" +
      `${escapeHtml(this.brand)} не анализирует закрытые профили и не помогает с преследованием, доксингом или обходом приватности. Для удаления данных используйте /delete_me.` +
      support +
      terms +
      privacy
    );
  },
  paymentSupport(supportUrl: string): string {
    const support = supportUrl
      ? `\n\nПоддержка: <a href="${escapeHtml(supportUrl)}">${escapeHtml(supportUrl)}</a>`
      : "";
    return (
      "💳 <b>Поддержка платежей</b>\n\n" +
      "Если оплата прошла, но кредиты не начислились, пришлите дату, сумму, способ оплаты и скрин статуса платежа.\n" +
      "Для возврата Telegram Stars или YooKassa укажите причину и номер заказа, если он есть. Возврат возможен только для неиспользованных кредитов." +
      support
    );
  },
  cancelled(): string {
    return "✖️ Отменено. Текущий шаг сброшен — вы в меню.";
  },
  deleteMeWarning(): string {
    return "⚠️ <b>Удаление аккаунта</b>\n\nЭто действие необратимо: профиль, все отчёты и рабочие данные будут удалены или анонимизированы, а оставшиеся кредиты сгорят. Финансовые записи сохраняются согласно требованиям учёта.\n\nПродолжить?";
  },
  deleteMeDone(): string {
    return "🧹 Профиль, отчёты и рабочие данные удалены или анонимизированы. Финансовые записи могут храниться без лишних персональных полей согласно требованиям учёта и политике хранения.";
  },
  analysisFailed(errorCode?: string): string {
    if (errorCode === "PROFILE_NOT_FOUND_OR_PRIVATE") {
      return (
        "⚠️ <b>Профиль не найден или закрыт</b>\n\n" +
        "Я анализирую только публичные Instagram-профили. Проверьте username или пришлите другой публичный профиль.\n\n" +
        "💎 Зарезервированные кредиты возвращены на баланс."
      );
    }
    if (errorCode === "IDENTITY_MISMATCH") {
      return (
        "⚠️ <b>Не удалось подтвердить профиль</b>\n\n" +
        "Провайдер вернул данные, которые не совпали с запрошенным username. Лучше повторить позже или проверить ссылку вручную.\n\n" +
        "💎 Зарезервированные кредиты возвращены на баланс."
      );
    }
    return (
      "⚠️ <b>Не удалось завершить анализ</b>\n\n" +
      "Мы попробовали несколько раз, но не смогли собрать отчёт. " +
      "💎 Зарезервированные кредиты возвращены на баланс — повторите попытку позже или напишите в поддержку."
    );
  },
  genericError(): string {
    return "⚠️ Не удалось обработать запрос. Попробуйте позже или напишите в поддержку.";
  }
};

function renderReportWarnings(warnings: string[], title: string): string {
  if (!warnings.length) return "";
  const items = warnings
    .slice(0, 3)
    .map((item) => `• ${escapeHtml(truncateWarning(item))}`)
    .join("\n");
  const extra = warnings.length > 3 ? `\n• +${warnings.length - 3}` : "";
  return `\n\n<b>${escapeHtml(title)}:</b>\n${items}${extra}`;
}

function truncateWarning(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 220 ? `${trimmed.slice(0, 219)}…` : trimmed;
}
