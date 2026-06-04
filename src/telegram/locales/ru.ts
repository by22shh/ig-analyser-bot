import { AnalysisMode } from "../constants.js";
import { escapeHtml, formatCredits, percent } from "../formatters/html.js";
import type { PackageView } from "../../modules/billing/packages.js";
import type { ReportMetrics, ReportSummaryView } from "../../modules/reports/types.js";

export const ru = {
  brand: "ZRETI",
  buttons: {
    analyze: "🔎 Анализ профиля",
    photo: "🖼 Поиск по фото",
    history: "🗂 История",
    profile: "👤 Профиль",
    credits: "💎 Пополнить кредиты",
    capabilities: "✨ Что я умею",
    channel: "📢 Группа",
    support: "🛟 Поддержка",
    settings: "⚙️ Настройки",
    admin: "🛠 Admin",
    terms: "☑️ Правила",
    back: "⬅️ Назад",
    cancel: "✖️ Отменить",
    menu: "🏠 В меню",
    accept: "✅ Принимаю правила",
    run: "▶️ Запустить",
    confirmLawfulBasis: "✅ Подтверждаю lawful basis",
    stars: "⭐ Telegram Stars",
    yookassa: "💳 Банковская карта / СБП",
    pay: "Оплатить",
    sections: "📚 Секции",
    pdf: "📄 PDF",
    markdown: "📝 Markdown",
    chat: "💬 Задать вопрос",
    sources: "🔗 Источники",
    repeat: "🔁 Повторить анализ",
    confirmDelete: "🗑 Да, удалить навсегда"
  },
  modeTitle(mode: AnalysisMode): string {
    const titles: Record<AnalysisMode, string> = {
      standard: "Standard",
      influencer: "Influencer audit",
      hr: "HR context",
      osint_compliance: "OSINT / Compliance"
    };
    return titles[mode];
  },
  startNeedsConsent(): string {
    return (
      "👁 <b>ZRETI</b> анализирует только публичные Instagram-данные.\n\n" +
      "Нельзя использовать бота для преследования, доксинга, угроз, давления или обхода приватности. " +
      "Фото-поиск требует, чтобы у вас было право использовать изображение.\n\n" +
      "Выберите язык, затем нажмите «Принимаю правила»."
    );
  },
  welcome(input: {
    totalUnits: number;
    purchasedUnits: number;
    grantedUnits: number;
    language: string;
    photoSearchEnabled?: boolean;
  }): string {
    const photoLine = input.photoSearchEnabled ? "• поиск возможного профиля по фото\n" : "";
    return (
      "👁 <b>ZRETI</b> — стратегический анализ публичного Instagram-профиля.\n\n" +
      `💎 Кредиты: <b>${formatCredits(input.totalUnits)}</b>\n` +
      `• куплено: ${formatCredits(input.purchasedUnits)}\n` +
      `• выдано/промо: ${formatCredits(input.grantedUnits)}\n` +
      `🌐 Язык отчета: <b>${escapeHtml(input.language)}</b>\n\n` +
      "<b>Что можно сделать:</b>\n" +
      "• анализ публичного профиля по username или ссылке\n" +
      photoLine +
      "• PDF/Markdown-отчет и чат по готовому отчету\n\n" +
      "Выберите действие ниже."
    );
  },
  capabilities(): string {
    return (
      "✨ <b>Что умеет ZRETI</b>\n\n" +
      "• Собирает публичные посты и профильные метаданные.\n" +
      "• Анализирует до 30 последних постов, визуальные паттерны и Digital Circle.\n" +
      "• Делает краткий вывод в Telegram, подробные секции, PDF/Markdown/HTML.\n" +
      "• Позволяет задавать вопросы по готовому отчету.\n\n" +
      "Бот не анализирует закрытые профили и не помогает с преследованием, доксингом или давлением."
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
      `📚 Отчетов: <b>${input.completedReports}</b>\n` +
      `⏳ Активных задач: <b>${input.activeJobs}</b>\n` +
      `🧹 Хранение отчетов: <b>${input.retentionDays} дн.</b>`
    );
  },
  balance(input: {
    totalUnits: number;
    purchasedUnits: number;
    grantedUnits: number;
    photoSearchEnabled?: boolean;
  }): string {
    const photoLine = input.photoSearchEnabled ? "\nПоиск по фото: <b>1</b> 💎" : "";
    return (
      `💎 <b>Ваши кредиты: ${formatCredits(input.totalUnits)}</b>\n` +
      `• куплено: ${formatCredits(input.purchasedUnits)}\n` +
      `• выдано/промо: ${formatCredits(input.grantedUnits)}\n\n` +
      "Standard-анализ: <b>1</b> 💎\n" +
      "Influencer/HR: <b>2</b> 💎" +
      photoLine
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
    return "HR-режим включен только как дополнительный публичный контекст. Пришлите позицию кандидата, например <code>Senior backend engineer</code>.";
  },
  osintRestricted(): string {
    return "OSINT / Compliance доступен только пользователям с ролью compliance/admin и отдельным подтверждением lawful basis.";
  },
  modeUnavailable(): string {
    return "Этот режим сейчас недоступен. Вернитесь в меню и выберите доступный режим.";
  },
  askOsintLawfulBasis(): string {
    return (
      "⚖️ <b>Подтверждение lawful basis</b>\n\n" +
      "OSINT / Compliance можно использовать только для законной проверки публичных фактов. Подтвердите, что у вас есть правовое основание, вы не будете использовать отчет для давления, преследования, доксинга или обхода приватности, а выводы будут проверяться как гипотезы."
    );
  },
  confirmAnalysis(input: { username: string; mode: AnalysisMode; costUnits: number }): string {
    return (
      "✅ <b>Проверьте задачу</b>\n\n" +
      `Профиль: <b>@${escapeHtml(input.username)}</b>\n` +
      `Режим: <b>${this.modeTitle(input.mode)}</b>\n` +
      `Стоимость: <b>${formatCredits(input.costUnits)}</b> 💎\n` +
      "Обычно анализ занимает 3-8 минут."
    );
  },
  jobQueued(username: string): string {
    return `⏳ Задача по <b>@${escapeHtml(username)}</b> принята. Я пришлю прогресс и отчет сюда.`;
  },
  jobAlreadyQueued(username: string): string {
    return `⏳ Задача по <b>@${escapeHtml(username)}</b> уже поставлена в очередь. Я пришлю прогресс и отчет сюда.`;
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
    return (
      `✅ <b>Отчет по @${escapeHtml(input.username)} готов</b>\n` +
      `Режим: <b>${this.modeTitle(input.mode)}</b>\n\n` +
      "<b>Метрики:</b>\n" +
      `• подписчики: ${m.followersCount.toLocaleString("ru-RU")}\n` +
      `• постов в анализе: ${m.analyzedPosts}\n` +
      `• средние лайки: ${Math.round(m.avgLikes).toLocaleString("ru-RU")}\n` +
      `• средние комментарии: ${Math.round(m.avgComments).toLocaleString("ru-RU")}\n` +
      `• ER: ${percent(m.engagementRate)}\n` +
      `• частота: раз в ${m.frequencyDays.toFixed(1)} дн.\n\n` +
      "<b>Короткий вывод:</b>\n" +
      input.summary.bullets.map((item) => `• ${escapeHtml(item)}`).join("\n")
    );
  },
  sectionsIntro(username: string): string {
    return `📚 <b>Секции отчета @${escapeHtml(username)}</b>\nВыберите раздел.`;
  },
  section(title: string, content: string): string {
    return `📌 <b>${escapeHtml(title)}</b>\n\n${escapeHtml(content)}`;
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
      ? `🔗 <b>Источники отчета @${escapeHtml(input.username)}</b>\n\n${items.join("\n")}${suffix}`
      : `🔗 <b>Источники отчета @${escapeHtml(input.username)}</b>\n\nВ этом отчете источники не найдены.`;
  },
  historyTitle(): string {
    return "🗂 <b>Последние отчеты</b>";
  },
  historyEmpty(): string {
    return "История пока пустая.";
  },
  artifactCaption(type: "pdf" | "markdown" | "html"): string {
    const titles = { pdf: "PDF-отчет", markdown: "Markdown-отчет", html: "HTML-отчет" };
    return `📄 ${titles[type]}`;
  },
  artifactMissing(type: "pdf" | "markdown" | "html"): string {
    const titles = { pdf: "PDF", markdown: "Markdown", html: "HTML" };
    return `${titles[type]} пока не найден. Попробуйте позже или откройте секции отчета.`;
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
    return `Email для чеков сохранен: <code>${escapeHtml(email)}</code>`;
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
    return `Пакет кредитов ZRETI ${pkg.title}`;
  },
  preCheckoutPayloadInvalid(): string {
    return "Цена устарела. Откройте пополнение заново.";
  },
  preCheckoutPaymentInvalid(): string {
    return "Платеж не найден или сумма изменилась.";
  },
  paymentSuccess(units: number, balance: number): string {
    return `✅ Кредиты начислены: <b>${formatCredits(units)}</b> 💎\nБаланс: <b>${formatCredits(balance)}</b> 💎`;
  },
  settings(input: { language: string; exportFormat: string; retentionDays: number }): string {
    return (
      "⚙️ <b>Настройки</b>\n\n" +
      `🌐 Язык интерфейса и отчетов: <b>${escapeHtml(input.language)}</b>\n` +
      `📄 Формат экспорта по умолчанию: <b>${escapeHtml(input.exportFormat.toUpperCase())}</b>\n` +
      `🧹 Хранение отчетов: <b>${input.retentionDays} дн.</b>`
    );
  },
  settingsUpdated(): string {
    return "✅ Настройки обновлены.";
  },
  languageUpdated(language: string): string {
    return `🌐 Язык изменен: <b>${escapeHtml(language)}</b>.`;
  },
  exportFormatTitle(format: "pdf" | "markdown" | "html"): string {
    const titles = { pdf: "PDF", markdown: "Markdown", html: "HTML" };
    return titles[format];
  },
  retentionTitle(days: number): string {
    return `${days} дн.`;
  },
  resetDone(): string {
    return "🧹 Контекст чата по отчету очищен. Отчеты и история сохранены.";
  },
  photoIntro(): string {
    return (
      "🖼 <b>Поиск возможного Instagram-профиля по фото</b>\n\n" +
      "Нажмите подтверждение, если у вас есть право использовать изображение. Результаты будут показаны как возможные совпадения, не как доказательство личности."
    );
  },
  photoAsk(): string {
    return "Пришлите фото или изображение файлом до лимита. Исходное фото не сохраняется в отчетах; запись поиска удаляется по сроку хранения.";
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
      ? "Найдены возможные Instagram-кандидаты. Это не подтверждение личности, а список возможных совпадений."
      : "По этому фото не удалось найти Instagram-кандидатов.";
  },
  chatIntro(): string {
    return "💬 <b>Чат по отчету</b>\n\nЗадайте вопрос или выберите быстрый вариант.";
  },
  chatQuick: {
    introLabel: "Как начать разговор?",
    sincerityLabel: "Проверить искренность",
    portraitLabel: "Коммуникационный портрет",
    introQuestion: "Как лучше начать разговор с этим человеком?",
    sincerityQuestion:
      "Какие сигналы искренности или постановочности можно осторожно проверить по отчету?",
    portraitQuestion:
      "Сформулируй осторожные гипотезы о коммуникационном стиле по публичным данным.",
    fallbackQuestion: "Что важно проверить по отчету?"
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
      "🛠 <b>Admin</b>\n\n" +
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
      "1. Нажмите «Анализ профиля» и пришлите публичный username.\n" +
      "2. Выберите режим и подтвердите стоимость.\n" +
      "3. Получите краткий вывод, секции и PDF/Markdown.\n\n" +
      "Я не анализирую закрытые профили и не помогаю с преследованием, доксингом или обходом приватности. Для удаления данных используйте /delete_me." +
      support +
      terms +
      privacy
    );
  },
  cancelled(): string {
    return "✖️ Отменено. Возвращаю в меню.";
  },
  deleteMeWarning(): string {
    return "⚠️ <b>Удаление аккаунта</b>\n\nЭто действие необратимо: профиль, все отчеты и рабочие данные будут удалены или анонимизированы, а оставшиеся кредиты сгорят. Финансовые записи сохраняются согласно требованиям учета.\n\nПродолжить?";
  },
  deleteMeDone(): string {
    return "🧹 Профиль, отчеты и рабочие данные удалены или анонимизированы. Финансовые записи могут храниться без лишних персональных полей согласно требованиям учета и политике хранения.";
  },
  genericError(): string {
    return "⚠️ Не удалось обработать запрос. Попробуйте позже или напишите в поддержку.";
  }
};
