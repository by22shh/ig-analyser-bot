/* global window, getComputedStyle, document, setInterval, HTMLFormElement, FormData, setTimeout, URL, Headers, fetch, clearTimeout, crypto */

const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.("secondary_bg_color");
  tg.setBackgroundColor?.(
    getComputedStyle(document.documentElement).getPropertyValue("--bg").trim()
  );
}

const view = document.getElementById("view");
const toast = document.getElementById("toast");
const brandName = document.getElementById("brandName");
const connectionState = document.getElementById("connectionState");

const state = {
  boot: null,
  tab: "analyze",
  selectedMode: "standard",
  selectedReport: null,
  selectedSection: 0,
  chat: [],
  busy: false,
  error: null
};

const copy = {
  ru: {
    tabs: { analyze: "Анализ", reports: "Отчеты", credits: "Кредиты", settings: "Профиль" },
    connected: "Подключено к Telegram",
    local: "Локальный режим",
    reload: "Обновлено",
    consentTitle: "Правила и безопасность",
    consentText:
      "Анализируются только публичные Instagram-данные. Запрещены преследование, доксинг, давление и обход приватности.",
    accept: "Принимаю правила",
    subscribeTitle: "Нужна подписка",
    subscribeText: "Подпишитесь на канал и обновите Mini App.",
    openChannel: "Открыть канал",
    analyzeTitle: "Разбор Instagram-профиля",
    analyzeLead: "Профиль, сигналы, метрики, PDF и чат по готовому отчету.",
    username: "Username или ссылка",
    goal: "Цель анализа",
    goalPlaceholder: "Например: оценить партнёрство, кандидата, личный бренд",
    mode: "Режим",
    targetPosition: "Позиция кандидата",
    lawful: "Подтверждаю законное основание и безопасное использование OSINT-режима.",
    start: "Запустить анализ",
    activeJobs: "Активные задачи",
    recentJobs: "Последние задачи",
    noJobs: "Задач пока нет",
    reports: "История отчетов",
    noReports: "История пока пустая",
    sections: "Секции",
    metrics: "Метрики",
    exports: "Экспорт",
    sources: "Источники",
    chat: "Чат по отчету",
    ask: "Задать вопрос",
    question: "Вопрос по отчету",
    credits: "Кредиты",
    topup: "Пополнение",
    stars: "Telegram Stars",
    yookassa: "Карта / СБП",
    noPaymentMethods: "Доступных способов оплаты пока нет",
    buy: "Купить",
    email: "Email для чека",
    settings: "Настройки",
    save: "Сохранить",
    language: "Язык",
    exportFormat: "Формат экспорта",
    retention: "Хранение",
    back: "Назад",
    openReport: "Открыть",
    download: "Скачать",
    balance: "Баланс",
    available: "Доступно",
    reserved: "В резерве",
    completed: "Отчетов",
    active: "В работе",
    started: "Анализ запущен",
    paid: "Платеж открыт",
    saved: "Настройки сохранены",
    insufficient: "Не хватает кредитов",
    invalidUsername: "Проверьте Instagram username",
    error: "Что-то пошло не так",
    loading: "Загрузка"
  },
  en: {
    tabs: { analyze: "Analyze", reports: "Reports", credits: "Credits", settings: "Profile" },
    connected: "Connected to Telegram",
    local: "Local mode",
    reload: "Refreshed",
    consentTitle: "Rules and Safety",
    consentText:
      "Only public Instagram data is analyzed. Harassment, doxing, pressure, and privacy bypasses are prohibited.",
    accept: "Accept rules",
    subscribeTitle: "Subscription Required",
    subscribeText: "Subscribe to the channel and refresh the Mini App.",
    openChannel: "Open channel",
    analyzeTitle: "Instagram Profile Analysis",
    analyzeLead: "Profile signals, metrics, PDF export, and report chat.",
    username: "Username or link",
    goal: "Analysis goal",
    goalPlaceholder: "For example: evaluate a partnership, candidate, or personal brand",
    mode: "Mode",
    targetPosition: "Candidate position",
    lawful: "I confirm lawful basis and safe use of OSINT mode.",
    start: "Start analysis",
    activeJobs: "Active jobs",
    recentJobs: "Recent jobs",
    noJobs: "No jobs yet",
    reports: "Report history",
    noReports: "History is empty",
    sections: "Sections",
    metrics: "Metrics",
    exports: "Exports",
    sources: "Sources",
    chat: "Report chat",
    ask: "Ask",
    question: "Question about the report",
    credits: "Credits",
    topup: "Top up",
    stars: "Telegram Stars",
    yookassa: "Card / SBP",
    noPaymentMethods: "No payment methods are available yet",
    buy: "Buy",
    email: "Receipt email",
    settings: "Settings",
    save: "Save",
    language: "Language",
    exportFormat: "Export format",
    retention: "Retention",
    back: "Back",
    openReport: "Open",
    download: "Download",
    balance: "Balance",
    available: "Available",
    reserved: "Reserved",
    completed: "Reports",
    active: "Active",
    started: "Analysis started",
    paid: "Payment opened",
    saved: "Settings saved",
    insufficient: "Not enough credits",
    invalidUsername: "Check Instagram username",
    error: "Something went wrong",
    loading: "Loading"
  }
};

const modes = [
  { key: "standard", ru: "Стандартный", en: "Standard", cost: "1" },
  { key: "influencer", ru: "Аудит блогера", en: "Influencer", cost: "2" },
  { key: "hr", ru: "HR-контекст", en: "HR context", cost: "2" },
  { key: "osint_compliance", ru: "OSINT", en: "OSINT", cost: "3" }
];

const quickQuestions = {
  ru: [
    "Как лучше начать разговор с этим человеком?",
    "Какие сигналы искренности стоит проверить?",
    "Сформулируй осторожный коммуникационный портрет."
  ],
  en: [
    "What is a good way to start a conversation?",
    "Which sincerity signals should be checked?",
    "Form a cautious communication profile."
  ]
};

init().catch((error) => showFatal(error));

async function init() {
  await loadBootstrap();
  bindEvents();
  render();
  setInterval(refreshJobsIfNeeded, 7000);
}

async function loadBootstrap() {
  state.error = null;
  state.boot = await api("/api/mini-app/bootstrap");
  if (state.boot?.user?.language === "en") document.documentElement.lang = "en";
}

function bindEvents() {
  document.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    event.preventDefault();
    await handleAction(target);
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    if (form.id === "analysisForm") await startAnalysis(form);
    if (form.id === "chatForm") await askQuestion(form);
    if (form.id === "settingsForm") await saveSettings(form);
    if (form.id === "yookassaForm") await buyYooKassa(form);
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (target?.name === "mode") {
      state.selectedMode = target.value;
      render();
    }
  });
}

async function handleAction(target) {
  const action = target.dataset.action;
  try {
    if (action === "tab") {
      state.tab = target.dataset.tab || "analyze";
      state.selectedReport = null;
      render();
    }
    if (action === "refresh") {
      await loadBootstrap();
      toastMessage(t("reload"));
      render();
    }
    if (action === "accept-consent") {
      const language = tg?.initDataUnsafe?.user?.language_code?.startsWith("en") ? "en" : lang();
      state.boot = await api("/api/mini-app/consent", {
        method: "POST",
        body: JSON.stringify({ language })
      });
      await loadBootstrap();
      render();
    }
    if (action === "open-channel") openExternal(state.boot?.subscription?.channelUrl);
    if (action === "mode") {
      state.selectedMode = target.dataset.mode || "standard";
      render();
    }
    if (action === "open-report") await openReport(target.dataset.id);
    if (action === "close-report") {
      state.selectedReport = null;
      state.chat = [];
      render();
    }
    if (action === "section-prev") {
      state.selectedSection = Math.max(0, state.selectedSection - 1);
      render();
    }
    if (action === "section-next") {
      const total = state.selectedReport?.sections?.length || 1;
      state.selectedSection = Math.min(total - 1, state.selectedSection + 1);
      render();
    }
    if (action === "section-pick") {
      state.selectedSection = Number(target.dataset.index || 0);
      render();
    }
    if (action === "quick-chat") {
      await askReportQuestion(target.dataset.question || "");
    }
    if (action === "download-artifact") {
      await downloadArtifact(target.dataset.path, target.dataset.type);
    }
    if (action === "open-link") {
      openExternal(target.dataset.url);
    }
    if (action === "buy-stars") {
      await buyStars(target.dataset.package);
    }
  } catch (error) {
    handleError(error);
  }
}

function render() {
  syncChrome();
  if (!state.boot) return renderLoading();
  if (!state.boot.user.consentAccepted) return renderConsent();
  if (state.boot.subscription?.required && !state.boot.subscription.ok) return renderSubscription();

  if (state.tab === "reports") return renderReports();
  if (state.tab === "credits") return renderCredits();
  if (state.tab === "settings") return renderSettings();
  return renderAnalyze();
}

function syncChrome() {
  const labels = copy[lang()].tabs;
  document.querySelectorAll(".tab").forEach((button) => {
    const key = button.dataset.tab;
    button.classList.toggle("is-active", key === state.tab);
    const label = button.querySelector("span:last-child");
    if (label && labels[key]) label.textContent = labels[key];
  });
  const brand = state.boot?.brandName || "SocialAnalyserBot";
  brandName.textContent = brand;
  document.title = `${brand} Mini App`;
  connectionState.textContent = tg?.initData ? t("connected") : t("local");
}

function renderLoading() {
  view.innerHTML = `<section class="loading-state"><div class="loader"></div><p>${t("loading")}</p></section>`;
}

function renderConsent() {
  view.innerHTML = `
    <section class="gate panel">
      <h1>${t("consentTitle")}</h1>
      <p>${t("consentText")}</p>
      <div class="actions">
        <button class="button" type="button" data-action="accept-consent">${t("accept")}</button>
      </div>
    </section>
  `;
}

function renderSubscription() {
  view.innerHTML = `
    <section class="gate panel">
      <h1>${t("subscribeTitle")}</h1>
      <p>${t("subscribeText")}</p>
      <div class="actions">
        <button class="button" type="button" data-action="open-channel">${t("openChannel")}</button>
        <button class="button secondary" type="button" data-action="refresh">↻</button>
      </div>
    </section>
  `;
}

function renderAnalyze() {
  const boot = state.boot;
  const activeJobs = boot.jobs.filter((job) => job.active);
  view.innerHTML = `
    <div class="stack">
      <section class="hero-panel">
        <div class="hero-grid">
          <div class="hero-copy">
            <p class="eyebrow">${formatCredits(boot.costs.standard)} credit · PDF · AI chat</p>
            <h1>${t("analyzeTitle")}</h1>
            <p>${t("analyzeLead")}</p>
          </div>
          <div class="hero-visual" aria-hidden="true">
            <div class="profile-ghost">
              <span class="ghost-row"></span>
              <span class="ghost-row"></span>
              <span class="ghost-row"></span>
            </div>
            <div class="signal-card">
              <strong>Signal map</strong>
              <div class="signal-bars"><i style="width: 86%"></i><i></i><i></i></div>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <form id="analysisForm" class="stack">
          <label class="field">
            <span class="label">${t("username")}</span>
            <input class="input" name="username" autocomplete="off" placeholder="@username" required />
          </label>
          <label class="field">
            <span class="label">${t("goal")}</span>
            <textarea class="textarea" name="goal" maxlength="500" placeholder="${t("goalPlaceholder")}"></textarea>
          </label>
          <div class="field">
            <span class="label">${t("mode")}</span>
            <div class="segmented modes">
              ${modeButtons()}
            </div>
          </div>
          <label class="field ${state.selectedMode === "hr" ? "" : "hidden"}">
            <span class="label">${t("targetPosition")}</span>
            <input class="input" name="targetPosition" placeholder="Senior backend engineer" />
          </label>
          <label class="checkbox-row ${state.selectedMode === "osint_compliance" ? "" : "hidden"}">
            <input type="checkbox" name="lawfulBasisAccepted" />
            <span>${t("lawful")}</span>
          </label>
          <div class="actions">
            <button class="button" type="submit" ${state.busy ? "disabled" : ""}>▶ ${t("start")}</button>
            <button class="button secondary" type="button" data-action="tab" data-tab="credits">◆ ${t("credits")}</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="item-head">
          <h2>${activeJobs.length ? t("activeJobs") : t("recentJobs")}</h2>
          <span class="badge">${boot.jobs.length}</span>
        </div>
        ${boot.jobs.length ? `<div class="list">${boot.jobs.slice(0, 5).map(jobItem).join("")}</div>` : empty(t("noJobs"))}
      </section>
    </div>
  `;
}

function renderReports() {
  if (state.selectedReport) return renderReportDetail();
  const reports = state.boot.reports || [];
  view.innerHTML = `
    <div class="stack">
      <section class="panel">
        <div class="item-head">
          <h1>${t("reports")}</h1>
          <button class="button secondary" type="button" data-action="refresh">↻</button>
        </div>
        ${reports.length ? `<div class="list">${reports.map(reportItem).join("")}</div>` : empty(t("noReports"))}
      </section>
    </div>
  `;
}

function renderReportDetail() {
  const report = state.selectedReport;
  const metrics = report.metrics || {};
  const section = report.sections[state.selectedSection] || report.sections[0];
  view.innerHTML = `
    <div class="stack">
      <section class="panel">
        <div class="item-head">
          <div>
            <h1>@${esc(report.username)}</h1>
            <span class="item-meta">${modeTitle(report.mode)} · ${dateShort(report.createdAt)}</span>
          </div>
          <button class="icon-button" type="button" data-action="close-report" aria-label="${t("back")}">←</button>
        </div>
      </section>

      <section class="panel">
        <h2>${t("metrics")}</h2>
        <div class="grid-3">
          ${metric("Followers", number(metrics.followersCount))}
          ${metric("ER", percent(metrics.engagementRate))}
          ${metric("Posts", number(metrics.analyzedPosts))}
        </div>
      </section>

      <section class="panel">
        <h2>${t("sections")}</h2>
        <div class="section-nav">
          <button class="icon-button" type="button" data-action="section-prev" ${state.selectedSection <= 0 ? "disabled" : ""}>‹</button>
          <strong>${section ? esc(section.title) : ""}</strong>
          <button class="icon-button" type="button" data-action="section-next" ${state.selectedSection >= report.sections.length - 1 ? "disabled" : ""}>›</button>
        </div>
        <div class="section-body">${section ? esc(section.content) : ""}</div>
        <div class="actions">
          ${report.sections
            .map(
              (item, index) =>
                `<button class="chip ${index === state.selectedSection ? "is-active" : ""}" type="button" data-action="section-pick" data-index="${index}"><strong>${item.position}</strong><span>${esc(item.title)}</span></button>`
            )
            .join("")}
        </div>
      </section>

      <section class="panel">
        <h2>${t("exports")}</h2>
        <div class="actions">
          ${report.artifacts.map(artifactButton).join("")}
        </div>
      </section>

      <section class="panel">
        <h2>${t("sources")}</h2>
        ${sourcesBlock(report)}
      </section>

      <section class="panel">
        <h2>${t("chat")}</h2>
        <div class="chat-log">${state.chat.map(chatBubble).join("")}</div>
        <div class="actions">
          ${quickQuestions[lang()]
            .map(
              (question) =>
                `<button class="button secondary" type="button" data-action="quick-chat" data-question="${escAttr(question)}">${esc(shortQuestion(question))}</button>`
            )
            .join("")}
        </div>
        <form id="chatForm" class="stack">
          <textarea class="textarea" name="question" placeholder="${t("question")}"></textarea>
          <button class="button" type="submit" ${state.busy ? "disabled" : ""}>💬 ${t("ask")}</button>
        </form>
      </section>
    </div>
  `;
}

function renderCredits() {
  const boot = state.boot;
  const starsPackages = boot.features.telegramStars ? boot.packages.stars || [] : [];
  const yookassaPackages = boot.features.yookassa ? boot.packages.yookassa || [] : [];
  const paymentSections = [
    starsPackages.length
      ? `
      <section class="panel">
        <h2>${t("stars")}</h2>
        <div class="list">
          ${starsPackages.map((pkg) => packageCard(pkg, "stars")).join("")}
        </div>
      </section>
    `
      : "",
    yookassaPackages.length
      ? `
      <section class="panel">
        <h2>${t("yookassa")}</h2>
        <form id="yookassaForm" class="stack">
          ${boot.features.yookassaReceipts ? `<label class="field"><span class="label">${t("email")}</span><input class="input" name="email" type="email" value="${escAttr(boot.user.email || "")}" /></label>` : ""}
          <div class="list">
            ${yookassaPackages.map((pkg) => packageCard(pkg, "yookassa", true)).join("")}
          </div>
        </form>
      </section>
    `
      : ""
  ]
    .filter(Boolean)
    .join("");
  view.innerHTML = `
    <div class="stack">
      <section class="panel">
        <h1>${t("credits")}</h1>
        <div class="grid-3">
          ${metric(t("balance"), formatCredits(boot.credits.balanceUnits))}
          ${metric(t("available"), formatCredits(boot.credits.availableUnits))}
          ${metric(t("reserved"), formatCredits(boot.credits.reservedUnits))}
        </div>
      </section>

      ${paymentSections || `<section class="panel">${empty(t("noPaymentMethods"))}</section>`}
    </div>
  `;
}

function renderSettings() {
  const boot = state.boot;
  view.innerHTML = `
    <div class="stack">
      <section class="panel">
        <h1>${esc(boot.user.name)}</h1>
        <div class="grid-2">
          ${metric(t("completed"), boot.stats.completedReports)}
          ${metric(t("active"), boot.stats.activeJobs)}
        </div>
      </section>

      <section class="panel">
        <h2>${t("settings")}</h2>
        <form id="settingsForm" class="stack">
          <label class="field">
            <span class="label">${t("language")}</span>
            <select class="select" name="language">
              <option value="ru" ${boot.user.language === "ru" ? "selected" : ""}>Русский</option>
              <option value="en" ${boot.user.language === "en" ? "selected" : ""}>English</option>
            </select>
          </label>
          <label class="field">
            <span class="label">${t("exportFormat")}</span>
            <select class="select" name="exportFormat">
              ${["pdf", "markdown", "html"].map((value) => `<option value="${value}" ${boot.stats.exportFormat === value ? "selected" : ""}>${value.toUpperCase()}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span class="label">${t("retention")}</span>
            <select class="select" name="retentionDays">
              ${[7, 30, 90].map((value) => `<option value="${value}" ${boot.stats.retentionDays === value ? "selected" : ""}>${value}</option>`).join("")}
            </select>
          </label>
          <button class="button" type="submit">${t("save")}</button>
        </form>
      </section>
    </div>
  `;
}

async function startAnalysis(form) {
  const data = new FormData(form);
  const body = {
    username: data.get("username"),
    mode: state.selectedMode,
    targetPosition: data.get("targetPosition"),
    goal: data.get("goal"),
    lawfulBasisAccepted: data.get("lawfulBasisAccepted") === "on",
    requestId: requestId()
  };
  state.busy = true;
  render();
  try {
    const result = await api("/api/mini-app/analysis", {
      method: "POST",
      body: JSON.stringify(body)
    });
    state.boot.jobs = result.jobs;
    state.boot.credits = result.credits;
    toastMessage(t("started"));
    haptic("success");
  } finally {
    state.busy = false;
    render();
  }
}

async function openReport(id) {
  const result = await api(`/api/mini-app/reports/${encodeURIComponent(id)}`);
  state.selectedReport = result.report;
  state.selectedSection = 0;
  state.chat = [];
  render();
}

async function askQuestion(form) {
  const question = String(new FormData(form).get("question") || "").trim();
  if (!question) return;
  form.reset();
  await askReportQuestion(question);
}

async function askReportQuestion(question) {
  if (!state.selectedReport || !question) return;
  state.chat.push({ role: "user", content: question });
  state.busy = true;
  render();
  try {
    const result = await api(`/api/mini-app/reports/${state.selectedReport.id}/chat`, {
      method: "POST",
      body: JSON.stringify({ question, requestId: requestId() })
    });
    state.chat.push({ role: "assistant", content: result.answer.text });
    state.boot.credits = result.credits;
    haptic("success");
  } finally {
    state.busy = false;
    render();
  }
}

async function saveSettings(form) {
  const data = new FormData(form);
  state.boot = await api("/api/mini-app/settings", {
    method: "PATCH",
    body: JSON.stringify({
      language: data.get("language"),
      exportFormat: data.get("exportFormat"),
      retentionDays: Number(data.get("retentionDays"))
    })
  });
  document.documentElement.lang = lang();
  toastMessage(t("saved"));
  render();
}

async function buyStars(packageCode) {
  const result = await api("/api/mini-app/payments/stars", {
    method: "POST",
    body: JSON.stringify({ packageCode })
  });
  if (tg?.openInvoice) {
    tg.openInvoice(result.invoice.invoiceUrl, () => {
      toastMessage(t("paid"));
      setTimeout(loadBootstrapAndRender, 1200);
    });
  } else {
    openExternal(result.invoice.invoiceUrl);
  }
}

async function buyYooKassa(form) {
  const button = document.activeElement?.closest("[data-package]");
  const packageCode = button?.dataset.package || state.boot.packages.yookassa[0]?.code;
  const email = String(new FormData(form).get("email") || "");
  const result = await api("/api/mini-app/payments/yookassa", {
    method: "POST",
    body: JSON.stringify({ packageCode, email })
  });
  state.boot.user = result.user || state.boot.user;
  openExternal(result.order.confirmationUrl);
}

async function downloadArtifact(path, type) {
  const linkInfo = await api(`${path}?link=1`);
  if (linkInfo.url) {
    openExternal(linkInfo.url);
    return;
  }
  const response = await fetchAuth(path);
  if (!response.ok) throw new Error("DOWNLOAD_FAILED");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `instagram-report.${type === "markdown" ? "md" : type}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function refreshJobsIfNeeded() {
  if (!state.boot?.jobs?.some((job) => job.active)) return;
  const result = await api("/api/mini-app/jobs");
  state.boot.jobs = result.jobs;
  state.boot.credits = result.credits;
  if (
    result.jobs.some(
      (job) => job.reportId && !state.boot.reports.some((report) => report.id === job.reportId)
    )
  ) {
    const reports = await api("/api/mini-app/reports");
    state.boot.reports = reports.reports;
  }
  render();
}

async function loadBootstrapAndRender() {
  await loadBootstrap();
  render();
}

async function api(path, options = {}) {
  const response = await fetchAuth(path, options);
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok || json.ok === false) {
    const error = new Error(json.error?.code || "API_ERROR");
    error.details = json.error;
    throw error;
  }
  return json;
}

function fetchAuth(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (tg?.initData) headers.set("Authorization", `tma ${tg.initData}`);
  else headers.set("X-Mini-App-Dev-User", "900000001");
  return fetch(path, { ...options, headers });
}

function modeButtons() {
  const boot = state.boot;
  return modes
    .filter((mode) => {
      if (mode.key === "standard") return true;
      if (mode.key === "influencer") return boot.features.influencerMode;
      if (mode.key === "hr") return boot.features.hrMode;
      if (mode.key === "osint_compliance") return boot.features.osintMode;
      return false;
    })
    .map(
      (mode) => `
        <button class="chip ${state.selectedMode === mode.key ? "is-active" : ""}" type="button" data-action="mode" data-mode="${mode.key}">
          <strong>${mode[lang()]}</strong>
          <span>${mode.cost} ${creditWord(Number(mode.cost))}</span>
        </button>
      `
    )
    .join("");
}

function jobItem(job) {
  const progress = Math.max(0, Math.min(100, Number(job.progressPercent || 0)));
  const badge = job.active
    ? `<span class="badge warning">${esc(job.stage || job.status)}</span>`
    : `<span class="badge success">${esc(job.status)}</span>`;
  return `
    <button class="item" type="button" ${job.reportId ? `data-action="open-report" data-id="${job.reportId}"` : ""}>
      <div class="item-head">
        <span class="item-title">@${esc(job.username)}</span>
        ${badge}
      </div>
      <span class="item-meta">${modeTitle(job.mode)} · ${dateShort(job.createdAt)}</span>
      <div class="progress"><span style="width:${progress}%"></span></div>
    </button>
  `;
}

function reportItem(report) {
  const metrics = report.metrics || {};
  const bullets = Array.isArray(report.summary?.bullets) ? report.summary.bullets.slice(0, 2) : [];
  return `
    <button class="item" type="button" data-action="open-report" data-id="${report.id}">
      <div class="item-head">
        <span class="item-title">@${esc(report.username)}</span>
        <span class="badge">${modeTitle(report.mode)}</span>
      </div>
      <span class="item-meta">${dateShort(report.createdAt)} · ER ${percent(metrics.engagementRate)}</span>
      ${bullets.length ? `<span class="item-meta">${bullets.map(esc).join(" · ")}</span>` : ""}
    </button>
  `;
}

function packageCard(pkg, provider, submit = false) {
  const amount = provider === "stars" ? `${pkg.starsAmount} ⭐` : `${pkg.rubAmount} ₽`;
  const action =
    provider === "stars"
      ? `data-action="buy-stars" data-package="${pkg.code}"`
      : `data-package="${pkg.code}"`;
  const type = submit ? "submit" : "button";
  return `
    <button class="item" type="${type}" ${action}>
      <div class="item-head">
        <span class="item-title">${esc(pkg.title)}</span>
        <span class="badge">${amount}</span>
      </div>
      <span class="item-meta">${formatCredits(pkg.creditsUnits)} ${creditWord(Number(formatCredits(pkg.creditsUnits)))}</span>
    </button>
  `;
}

function artifactButton(artifact) {
  return `
    <button class="button secondary" type="button" data-action="download-artifact" data-type="${artifact.type}" data-path="${artifact.downloadPath}">
      ↓ ${artifact.type.toUpperCase()}
    </button>
  `;
}

function sourcesBlock(report) {
  const sources = collectSources(report).slice(0, 20);
  if (!sources.length) return empty("No sources");
  return `<div class="list">${sources
    .map((source) =>
      source.url
        ? `<button class="item" type="button" data-action="open-link" data-url="${escAttr(source.url)}"><span class="item-title">${esc(source.label)}</span><span class="item-meta">${esc(source.url)}</span></button>`
        : `<div class="item"><span class="item-title">${esc(source.label)}</span></div>`
    )
    .join("")}</div>`;
}

function collectSources(report) {
  const sources = [];
  for (const section of report.sections || []) {
    if (!Array.isArray(section.sources)) continue;
    for (const source of section.sources) {
      if (!source || typeof source !== "object") continue;
      const label = source.label || source.postId || "Source";
      const url = source.url || "";
      const key = `${label}:${url}`;
      if (!sources.some((item) => item.key === key)) sources.push({ key, label, url });
    }
  }
  return sources;
}

function chatBubble(message) {
  return `<div class="bubble ${message.role === "user" ? "user" : "assistant"}">${esc(message.content)}</div>`;
}

function metric(label, value) {
  return `<div class="metric"><span>${esc(label)}</span><strong>${esc(String(value ?? "—"))}</strong></div>`;
}

function empty(text) {
  return `<div class="empty-state"><p>${esc(text)}</p></div>`;
}

function modeTitle(mode) {
  const item = modes.find((entry) => entry.key === mode);
  return item ? item[lang()] : mode;
}

function t(key) {
  return copy[lang()][key] || copy.ru[key] || key;
}

function lang() {
  return state.boot?.user?.language === "en" ? "en" : "ru";
}

function formatCredits(units) {
  const value = Number(units || 0) / 100;
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function number(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Math.round(Number(value)).toLocaleString(lang() === "en" ? "en-US" : "ru-RU");
}

function percent(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toFixed(1)}%`;
}

function dateShort(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(lang() === "en" ? "en-US" : "ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function shortQuestion(value) {
  return value.length > 34 ? `${value.slice(0, 31)}...` : value;
}

function creditWord(value) {
  if (lang() === "en") return `credit${value === 1 ? "" : "s"}`;
  if (value === 1) return "кредит";
  if (value > 1 && value < 5) return "кредита";
  return "кредитов";
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escAttr(value) {
  return esc(value).replaceAll("\n", " ");
}

function toastMessage(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function handleError(error) {
  const code = error?.message || "";
  if (code === "INSUFFICIENT_CREDITS") toastMessage(t("insufficient"));
  else if (code === "USERNAME_INVALID") toastMessage(t("invalidUsername"));
  else toastMessage(t("error"));
  haptic("error");
}

function showFatal(error) {
  view.innerHTML = `<section class="gate panel"><h1>${t("error")}</h1><p>${esc(error?.message || "BOOT_FAILED")}</p><button class="button" type="button" data-action="refresh">↻</button></section>`;
}

function openExternal(url) {
  const safeUrl = safeExternalUrl(url);
  if (!safeUrl) return;
  if (tg?.openLink) tg.openLink(safeUrl);
  else window.open(safeUrl, "_blank", "noopener,noreferrer");
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function haptic(type) {
  if (type === "success") tg?.HapticFeedback?.notificationOccurred?.("success");
  if (type === "error") tg?.HapticFeedback?.notificationOccurred?.("error");
}

function requestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
