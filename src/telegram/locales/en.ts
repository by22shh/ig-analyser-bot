import { env } from "../../config/env.js";
import { AnalysisMode } from "../constants.js";
import { escapeHtml, formatCredits, percent } from "../formatters/html.js";
import type { PackageView } from "../../modules/billing/packages.js";
import type { ReportMetrics, ReportSummaryView } from "../../modules/reports/types.js";

export const en = {
  brand: env.BRAND_NAME,
  buttons: {
    miniApp: "🚀 Open app",
    analyze: "🔎 Profile analysis",
    photo: "🖼 Photo search",
    history: "🗂 History",
    profile: "👤 Profile",
    credits: "💎 Top up credits",
    capabilities: "✨ Capabilities",
    help: "ℹ️ How to use",
    channel: "📢 Our channel",
    support: "🛟 Support",
    settings: "⚙️ Settings",
    admin: "🛠 Admin",
    terms: "☑️ Terms",
    back: "← Back",
    cancel: "❌ Cancel",
    menu: "← Menu",
    accept: "✅ I accept",
    decline: "❌ Decline",
    subscribe: "📢 Subscribe",
    checkSubscription: "✅ I subscribed",
    restart: "🔁 Start over",
    skip: "Skip",
    run: "▶️ Start",
    confirmLawfulBasis: "✅ Confirm lawful basis",
    stars: "⭐ Telegram Stars",
    yookassa: "💳 Card / SBP",
    pay: "Pay",
    sections: "📚 Sections",
    pdf: "📄 PDF",
    markdown: "📝 Markdown",
    chat: "💬 Ask a question",
    sources: "🔗 Sources",
    repeat: "🔄 Repeat analysis",
    moreQuestion: "💬 Another question",
    toReport: "📌 To report",
    confirmDelete: "🗑 Yes, delete permanently",
    openInstagram: "🔗 Open in Instagram",
    prevSection: "◀️ Prev",
    nextSection: "Next ▶️",
    toSections: "📚 Sections"
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
  chooseLanguage(): string {
    return (
      "🌐 <b>Выберите язык</b> / <b>Choose your language</b>\n\n" +
      "На выбранном языке будут меню бота и отчёты. / Menus and reports will use the language you pick."
    );
  },
  startNeedsConsent(): string {
    return (
      `👁 <b>${escapeHtml(this.brand)}</b> analyzes public Instagram data only.\n\n` +
      "Do not use the bot for harassment, doxing, threats, pressure, or privacy bypass. " +
      "Photo search requires that you have the right to use the image.\n\n" +
      "Tap “I accept” to continue, or “Decline”."
    );
  },
  consentDeclined(): string {
    return (
      "🚫 <b>Access closed</b>\n\n" +
      "You cannot use the bot without accepting the rules. Changed your mind? Tap “Start over” or send /start."
    );
  },
  subscriptionRequired(channelUrl: string): string {
    const link = channelUrl ? `<a href="${escapeHtml(channelUrl)}">our channel</a>` : "our channel";
    return (
      "📢 <b>One last step</b>\n\n" +
      `To use the bot, subscribe to ${link}. After subscribing, tap “I subscribed”.`
    );
  },
  subscriptionStillMissing(): string {
    return "I can't see your subscription yet. Subscribe to the channel and tap “I subscribed” again.";
  },
  welcome(input: {
    totalUnits: number;
    purchasedUnits: number;
    grantedUnits: number;
    language: string;
    photoSearchEnabled?: boolean;
    influencerEnabled?: boolean;
    hrEnabled?: boolean;
    osintEnabled?: boolean;
    welcomeBonusCredits?: number;
  }): string {
    const photoLine = input.photoSearchEnabled ? "• find possible profiles by photo\n" : "";
    const modes = [
      "standard",
      input.influencerEnabled ? "influencer" : "",
      input.hrEnabled ? "HR" : "",
      input.osintEnabled ? "OSINT by access" : ""
    ].filter(Boolean);
    const premiumTariff = [
      input.influencerEnabled ? "influencer" : "",
      input.hrEnabled ? "HR" : ""
    ].filter(Boolean);
    const tariffs = [
      "standard 1",
      premiumTariff.length ? `${premiumTariff.join("/")} 2` : "",
      input.osintEnabled ? "OSINT 3" : "",
      input.photoSearchEnabled ? "photo 1" : ""
    ].filter(Boolean);
    const bought = input.purchasedUnits
      ? `🛒 Purchased: <b>${formatCredits(input.purchasedUnits)}</b>\n`
      : "";
    const granted = input.grantedUnits
      ? `🎁 Promo/grants: <b>${formatCredits(input.grantedUnits)}</b>\n`
      : "";
    const bonusLine =
      input.welcomeBonusCredits && input.welcomeBonusCredits > 0
        ? `🎁 <b>Welcome bonus: ${formatCredits(input.welcomeBonusCredits * 100)} 💎</b> — enough for your first report.\n\n`
        : "";
    return (
      bonusLine +
      `👁 <b>${escapeHtml(this.brand)}</b> — public Instagram profile analysis.\n\n` +
      "🤝 Preparing for a meeting, partnership, or professional contact?\n" +
      "🕵️ Need to review the public context of a profile carefully?\n" +
      "📣 Evaluating a creator, candidate, or personal brand from open data?\n\n" +
      "Send an @username or link — I will turn open data into a clear strategic report.\n\n" +
      "<b>You will get:</b>\n" +
      "• positioning and visible profile signals\n" +
      "• themes, visual style, and recurring patterns\n" +
      "• practical takeaways for HR, creator work, or personal strategy\n" +
      photoLine +
      "• PDF/Markdown export and chat with the finished report\n\n" +
      `💎 Credits: <b>${formatCredits(input.totalUnits)}</b>\n` +
      bought +
      granted +
      `🧭 Modes: <b>${escapeHtml(modes.join(" · "))}</b>\n` +
      `💳 Pricing: ${escapeHtml(tariffs.join(" · "))}\n` +
      `🌐 Report language: <b>${escapeHtml(input.language)}</b>\n\n` +
      "Start with “Analyze profile”."
    );
  },
  capabilities(): string {
    return (
      `✨ <b>What ${escapeHtml(this.brand)} can do</b>\n\n` +
      "I turn open Instagram data into a careful analytical report.\n\n" +
      "🔎 <b>Profile analysis</b>\n" +
      "<blockquote>Posts, metadata, visual patterns, themes, posting rhythm, and the Digital Circle connection map.</blockquote>\n\n" +
      "🖼 <b>Photo search</b>\n" +
      "<blockquote>When enabled and you have the right to use the image, I show possible Instagram candidates. This is not proof of identity.</blockquote>\n\n" +
      "📄 <b>Result</b>\n" +
      "<blockquote>Telegram summary, detailed sections, PDF/Markdown/HTML export, and chat with the finished report.</blockquote>\n\n" +
      "💎 <b>Pricing</b>\n" +
      "<blockquote>Standard — 1💎\nInfluencer/HR — 2💎\nOSINT — 3💎\nPhoto — 1💎\nReport question — 0.05💎</blockquote>\n\n" +
      `${escapeHtml(this.brand)} does not analyze private profiles or help with harassment, doxing, or pressure.`
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
      "👤 <b>Profile</b>\n" +
      `<b>${escapeHtml(input.name)}</b> · ID <code>${escapeHtml(input.telegramId)}</code>\n\n` +
      "<blockquote>" +
      `🌐 <b>${escapeHtml(input.language)}</b>\n` +
      "Interface and report language" +
      "</blockquote>\n\n" +
      "<blockquote>" +
      `💎 Credits: <b>${formatCredits(input.totalUnits)}</b>\n` +
      `🛒 Purchased: <b>${formatCredits(input.purchasedUnits)}</b>\n` +
      `🎁 Grants/promo: <b>${formatCredits(input.grantedUnits)}</b>` +
      "</blockquote>\n\n" +
      "<blockquote>" +
      "📚 <b>Reports</b>\n" +
      `Completed: <b>${input.completedReports}</b> · active jobs: <b>${input.activeJobs}</b>` +
      "</blockquote>\n\n" +
      `🧹 Report retention: <b>${input.retentionDays} days</b>`
    );
  },
  balance(input: {
    totalUnits: number;
    purchasedUnits: number;
    grantedUnits: number;
    photoSearchEnabled?: boolean;
    osintEnabled?: boolean;
  }): string {
    const photoLine = input.photoSearchEnabled ? "\n• photo search: <b>1</b> 💎" : "";
    const osintLine = input.osintEnabled ? "\n• OSINT check: <b>3</b> 💎" : "";
    return (
      `💎 <b>Your credits: ${formatCredits(input.totalUnits)}</b>\n` +
      `• purchased: ${formatCredits(input.purchasedUnits)}\n` +
      `• grants/promo: ${formatCredits(input.grantedUnits)}\n\n` +
      "<b>Pricing:</b>\n" +
      "• standard analysis: <b>1</b> 💎\n" +
      "• influencer audit / HR context: <b>2</b> 💎" +
      osintLine +
      photoLine +
      "\n• report chat question: <b>0.05</b> 💎"
    );
  },
  insufficientCredits(input: { costUnits: number; availableUnits: number }): string {
    return (
      "💎 <b>Not enough credits</b>\n\n" +
      `Cost: <b>${formatCredits(input.costUnits)}</b> 💎\n` +
      `Available: <b>${formatCredits(input.availableUnits)}</b> 💎\n\n` +
      "Top up your balance or choose a cheaper action."
    );
  },
  askUsername(): string {
    return "🔎 <b>Who should I analyze?</b>\n\nSend a username, @username, or Instagram profile URL.";
  },
  invalidUsername(): string {
    return "This does not look like an Instagram username. Send @username or a profile URL.";
  },
  chooseMode(username: string): string {
    return `Choose analysis mode for <b>@${escapeHtml(username)}</b>.`;
  },
  askHrPosition(): string {
    return "HR mode is public-context only. Send the target position, for example <code>Senior backend engineer</code>.";
  },
  askGoal(username: string): string {
    return (
      `🎯 <b>Analysis goal for @${escapeHtml(username)}</b>\n\n` +
      "Send a short decision context: partnership, hiring, dating, creator audit, or another reason."
    );
  },
  osintRestricted(): string {
    return "OSINT / Compliance is available only to compliance/admin roles with a lawful basis confirmation.";
  },
  modeUnavailable(): string {
    return "This mode is unavailable right now. Return to the menu and choose an available mode.";
  },
  askOsintLawfulBasis(): string {
    return (
      "⚖️ <b>Lawful basis confirmation</b>\n\n" +
      "OSINT / Compliance may be used only for lawful verification of public facts. Confirm that you have a lawful basis, will not use the report for pressure, harassment, doxing or privacy bypass, and will treat findings as hypotheses to verify."
    );
  },
  confirmAnalysis(input: {
    username: string;
    mode: AnalysisMode;
    costUnits: number;
    goal?: string;
  }): string {
    const goalLine = input.goal ? `Goal: <i>${escapeHtml(input.goal)}</i>\n` : "";
    return (
      "✅ <b>Check the task</b>\n\n" +
      `Profile: <b>@${escapeHtml(input.username)}</b>\n` +
      `Mode: <b>${this.modeTitle(input.mode)}</b>\n` +
      goalLine +
      `Cost: <b>${formatCredits(input.costUnits)}</b> 💎\n` +
      "Analysis usually takes 3–8 minutes."
    );
  },
  jobQueued(username: string): string {
    return `⏳ Job for <b>@${escapeHtml(username)}</b> is queued. I will post progress and the report here.`;
  },
  jobAlreadyQueued(username: string): string {
    return `⏳ Job for <b>@${escapeHtml(username)}</b> is already queued. I will post progress and the report here.`;
  },
  staleConfirmation(): string {
    return "This confirmation is stale. Open analysis again and confirm the current task.";
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
    const warnings = renderReportWarnings(input.summary.warnings, "Quality limits");
    const health = input.summary.analysisHealth;
    const healthText = health
      ? "\n\n<b>Analysis health:</b>\n" +
        `• format: ${escapeHtml(health.formatLabel)}\n` +
        `• coverage: ${health.analyzedPosts}/${health.postsCount} (${health.sampleCoveragePercent ?? 0}%)\n` +
        `• vision: ${health.visionCompleted}/${health.visionTotal}\n` +
        `• comment coverage: ${health.postsWithCommentText}/${health.analyzedPosts} (${health.commentCoveragePercent ?? 0}%)\n` +
        `• comment texts: ${health.commentTextCount}\n`
      : "";
    const executive = input.summary.executiveSummary
      ? `<b>What this means:</b>\n${escapeHtml(input.summary.executiveSummary)}\n\n`
      : "";
    return (
      `✅ <b>Report for @${escapeHtml(input.username)} is ready</b>\n` +
      `Mode: <b>${this.modeTitle(input.mode)}</b>\n\n` +
      executive +
      "<b>Metrics:</b>\n" +
      `• followers: ${m.followersCount.toLocaleString("en-US")}\n` +
      `• analyzed posts: ${m.analyzedPosts}\n` +
      `• avg likes: ${Math.round(m.avgLikes).toLocaleString("en-US")}\n` +
      `• avg comments: ${Math.round(m.avgComments).toLocaleString("en-US")}\n` +
      `• engagement (ER): ${percent(m.engagementRate)}\n` +
      `• frequency: every ${m.frequencyDays.toFixed(1)} days` +
      healthText +
      "\n" +
      "<b>Short take:</b>\n" +
      input.summary.bullets.map((item) => `• ${escapeHtml(item)}`).join("\n") +
      warnings
    );
  },
  sectionsIntro(username: string): string {
    return `📚 <b>Report sections for @${escapeHtml(username)}</b>\nChoose a section.`;
  },
  section(title: string, content: string): string {
    return `📌 <b>${escapeHtml(title)}</b>\n\n${escapeHtml(content)}`;
  },
  sectionProgress(position: number, total: number): string {
    return `Section ${position} of ${total}`;
  },
  reportSources(input: {
    username: string;
    sources: Array<{ label: string; url?: string }>;
  }): string {
    const items = input.sources.slice(0, 20).map((source, index) => {
      const label = escapeHtml(source.label || `Source ${index + 1}`);
      return source.url
        ? `${index + 1}. <a href="${escapeHtml(source.url)}">${label}</a>`
        : `${index + 1}. ${label}`;
    });
    const suffix =
      input.sources.length > 20 ? `\n\nShowing first 20 of ${input.sources.length}.` : "";
    return items.length
      ? `🔗 <b>Sources for @${escapeHtml(input.username)}</b>\n\n${items.join("\n")}${suffix}`
      : `🔗 <b>Sources for @${escapeHtml(input.username)}</b>\n\nNo sources were found for this report.`;
  },
  historyTitle(): string {
    return "🗂 <b>Recent reports</b>\nPick a report to open its sections and exports.";
  },
  historyEmpty(): string {
    return "History is empty. Run your first analysis with “Profile analysis”.";
  },
  relativeDate(date: Date): string {
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  },
  artifactCaption(type: "pdf" | "markdown" | "html"): string {
    const titles = { pdf: "PDF report", markdown: "Markdown report", html: "HTML report" };
    return `📄 ${titles[type]}`;
  },
  artifactMissing(type: "pdf" | "markdown" | "html"): string {
    const titles = { pdf: "PDF", markdown: "Markdown", html: "HTML" };
    return `${titles[type]} is not ready yet. Try again later or open report sections.`;
  },
  artifactLinkFallback(type: "pdf" | "markdown" | "html", url: string): string {
    const titles = { pdf: "PDF", markdown: "Markdown", html: "HTML" };
    return `📄 <b>${titles[type]}</b>\n\nDownload link: ${escapeHtml(url)}`;
  },
  repeatAnalysis(username: string): string {
    return `🔁 Repeating analysis for <b>@${escapeHtml(username)}</b>. Check the mode and cost.`;
  },
  paywallIntro(testMode: boolean): string {
    const badge = testMode ? "🧪 <b>Payment test mode</b>\n\n" : "";
    return (
      `${badge}💎 <b>Top up credits</b>\n\n` +
      "Credits pay for analyses, photo search, and questions about completed reports. " +
      "The default Telegram-native method is <b>Stars</b>.\n\n" +
      "Choose a payment method:"
    );
  },
  starsIntro(): string {
    return (
      "⭐ <b>Telegram Stars payment</b>\n\n" +
      "Choose a package: each button shows <b>credits</b> and the price in Stars. " +
      "Credits are granted automatically after payment."
    );
  },
  yookassaIntro(testMode: boolean): string {
    const badge = testMode ? "🧪 <b>YooKassa test mode</b>\n\n" : "";
    return (
      `${badge}💳 <b>Card / SBP payment</b>\n\n` +
      "Choose a package: each button shows <b>credits</b> and the RUB price. " +
      "Credits are granted automatically after checkout."
    );
  },
  askReceiptEmail(): string {
    return (
      "✉️ <b>Receipt email</b>\n\n" +
      "Card / SBP payments require an email for the fiscal receipt. Send it in one message — I will remember it for future payments."
    );
  },
  invalidEmail(): string {
    return "This does not look like an email. Send an address like <code>name@example.com</code> or tap Cancel.";
  },
  emailSaved(email: string): string {
    return `Receipt email saved: <code>${escapeHtml(email)}</code>`;
  },
  yookassaPaymentCreated(amountMinor: number): string {
    return `💳 <b>Payment link created</b>\n\nAmount: <b>${(amountMinor / 100).toFixed(2)} RUB</b>\nCredits will be granted automatically after YooKassa confirms the payment.`;
  },
  paymentMethodUnavailable(): string {
    return "This payment method is unavailable right now. Choose another method or return to the menu.";
  },
  packageButton(pkg: PackageView, provider: "telegram_stars" | "yookassa"): string {
    return provider === "telegram_stars"
      ? `${pkg.title} — ${formatCredits(pkg.creditsUnits)}💎 for ${pkg.starsAmount} ⭐`
      : `${pkg.title} — ${formatCredits(pkg.creditsUnits)}💎 for ${pkg.rubAmount} ₽`;
  },
  starsInvoiceTitle(pkg: PackageView): string {
    return `${pkg.title}: ${formatCredits(pkg.creditsUnits)} credits`;
  },
  starsInvoiceDescription(pkg: PackageView): string {
    return `Credit package ${pkg.title}`;
  },
  starsInvoiceAlreadyPending(): string {
    return "⭐ You already have an active Telegram Stars invoice for this package. Open the previous invoice message or wait until it expires.";
  },
  preCheckoutPayloadInvalid(): string {
    return "The price has expired. Open top-up again.";
  },
  preCheckoutPaymentInvalid(): string {
    return "Payment was not found or the amount changed.";
  },
  paymentSuccess(units: number, balance: number): string {
    return `✅ Credits granted: <b>${formatCredits(units)}</b> 💎\nBalance: <b>${formatCredits(balance)}</b> 💎`;
  },
  settings(input: { language: string; exportFormat: string; retentionDays: number }): string {
    return (
      "⚙️ <b>Settings</b>\n\n" +
      `🌐 Interface and report language: <b>${escapeHtml(input.language)}</b>\n` +
      `📄 Default export format: <b>${escapeHtml(input.exportFormat.toUpperCase())}</b>\n` +
      `🧹 Report retention: <b>${input.retentionDays} days</b>\n\n` +
      "Current values are marked with a check."
    );
  },
  settingsUpdated(): string {
    return "✅ Settings updated.";
  },
  languageUpdated(language: string): string {
    return `🌐 Language changed: <b>${escapeHtml(language)}</b>.`;
  },
  exportFormatTitle(format: "pdf" | "markdown" | "html"): string {
    const titles = { pdf: "PDF", markdown: "Markdown", html: "HTML" };
    return titles[format];
  },
  retentionTitle(days: number): string {
    return `${days} days`;
  },
  resetDone(): string {
    return "🧹 Report chat context has been cleared. Reports and history are preserved.";
  },
  photoIntro(): string {
    return (
      "🖼 <b>Search for possible Instagram profiles by photo</b>\n\n" +
      "Confirm only if you have the right to use this image. Results are possible matches, not proof of identity."
    );
  },
  photoAsk(): string {
    return "Send a photo or an image file within the size limit. The source photo is not stored in reports; the search record is removed by retention rules.";
  },
  photoRightConfirm(): string {
    return "✅ I have the right to use it";
  },
  photoDisabled(): string {
    return "Photo search is unavailable right now. You can send a username manually.";
  },
  photoTooLarge(maxMb: number): string {
    return `The file is too large. Maximum size is ${maxMb} MB.`;
  },
  photoInvalidType(): string {
    return "Only JPG, PNG, or WEBP images are supported.";
  },
  photoAccepted(): string {
    return "🔎 Photo accepted. Searching for possible Instagram candidates.";
  },
  photoMatches(matches: Array<{ username: string }>): string {
    return matches.length
      ? "🔎 <b>Possible Instagram candidates</b>\n\nThis is not identity confirmation, only a list of possible matches. The percentage is an estimate of visual similarity. Pick a candidate to run a profile analysis."
      : "No Instagram candidates were found for this photo. Try another image or send a username manually.";
  },
  photoSearchFailed(): string {
    return (
      "⚠️ <b>Could not finish photo search</b>\n\n" +
      "We tried several times, but the search service did not return a result. " +
      "💎 The reserved credits were returned to your balance — try another photo later or send a username manually."
    );
  },
  chatIntro(): string {
    return "💬 <b>Report chat</b>\n\nAsk a question or choose a quick option. Each question costs 0.05 💎.";
  },
  chatQuick: {
    introLabel: "Start a conversation",
    sincerityLabel: "Check sincerity",
    portraitLabel: "Communication profile",
    introQuestion: "What is a good way to start a conversation with this person?",
    sincerityQuestion:
      "Which sincerity or staged-content signals can be checked carefully from the report?",
    portraitQuestion:
      "Form cautious hypotheses about the communication style based on public data.",
    fallbackQuestion: "What is important to check in this report?"
  },
  progressStages: {
    fetchingProfile: "Collecting public data",
    analyzingSignals: "Analyzing visual and text signals",
    generatingExports: "Generating PDF/Markdown/HTML"
  },
  adminGrantUsage(input?: { maxCredits?: number }): string {
    const limit = input?.maxCredits ? `, maximum ${input.maxCredits} credits per command` : "";
    return `Usage: /admin_grant <telegram_id> <credits>${limit}`;
  },
  adminUserNotFound(): string {
    return "User not found.";
  },
  adminGrantDone(input: { credits: number; telegramId: number }): string {
    return `Granted ${input.credits} credits to <code>${input.telegramId}</code>.`;
  },
  adminStats(input: { users: number; jobs: number; failed: number; payments: number }): string {
    return (
      "🛠 <b>Admin</b>\n\n" +
      `Users: <b>${input.users}</b>\n` +
      `Active jobs: <b>${input.jobs}</b>\n` +
      `Failed jobs: <b>${input.failed}</b>\n` +
      `Paid orders: <b>${input.payments}</b>`
    );
  },
  help(supportUrl: string, termsUrl: string, privacyUrl: string): string {
    const support = supportUrl ? `\n🛟 <a href="${escapeHtml(supportUrl)}">Support</a>` : "";
    const terms = termsUrl ? `\n☑️ <a href="${escapeHtml(termsUrl)}">Terms</a>` : "";
    const privacy = privacyUrl ? `\n🔒 <a href="${escapeHtml(privacyUrl)}">Privacy</a>` : "";
    return (
      "ℹ️ <b>How to use</b>\n\n" +
      "A short guide for safe public-profile analysis.\n\n" +
      "<b>Step-by-step:</b>\n\n" +
      "<blockquote>1. <b>Start analysis</b>\n" +
      "Tap “Profile analysis” or send a public @username / profile link.</blockquote>\n\n" +
      "<blockquote>2. <b>Choose a mode</b>\n" +
      "Standard, influencer audit, HR context, or OSINT by separate access.</blockquote>\n\n" +
      "<blockquote>3. <b>Confirm the cost</b>\n" +
      "The bot shows the mode, goal, and credit price before it starts.</blockquote>\n\n" +
      "<blockquote>4. <b>Get the result</b>\n" +
      "The Telegram summary arrives here; details are in sections, PDF/Markdown, and report chat.</blockquote>\n\n" +
      "💡 <b>Good to know</b>\n" +
      "<blockquote>• Only public data is analyzed.\n" +
      "• Photo search requires the right to use the image.\n" +
      "• Findings are signals and hypotheses, not final facts.\n" +
      "• Use /delete_me to delete your data.</blockquote>" +
      support +
      terms +
      privacy
    );
  },
  paymentSupport(supportUrl: string): string {
    const support = supportUrl
      ? `\n\nSupport: <a href="${escapeHtml(supportUrl)}">${escapeHtml(supportUrl)}</a>`
      : "";
    return (
      "💳 <b>Payment support</b>\n\n" +
      "If the payment succeeded but credits were not granted, send the date, amount, payment method and a screenshot of the payment status.\n" +
      "For a Telegram Stars or YooKassa refund, include the reason and order number if you have it. Refunds are available only for unused credits." +
      support
    );
  },
  cancelled(): string {
    return "❌ Cancelled. The current step was reset. How else can I help?";
  },
  deleteMeWarning(): string {
    return "⚠️ <b>Delete account</b>\n\nThis is irreversible: your profile, all reports and working data will be deleted or anonymized, and any remaining credits will be lost. Financial records are kept per accounting requirements.\n\nProceed?";
  },
  deleteMeDone(): string {
    return "🧹 Profile, reports and working data have been deleted or anonymized. Financial records may be retained without unnecessary personal fields according to accounting requirements and the retention policy.";
  },
  analysisFailed(errorCode?: string): string {
    if (errorCode === "PROFILE_NOT_FOUND_OR_PRIVATE") {
      return (
        "⚠️ <b>Profile not found or private</b>\n\n" +
        "I can analyze public Instagram profiles only. Check the username or send another public profile.\n\n" +
        "💎 The reserved credits were returned to your balance."
      );
    }
    if (errorCode === "IDENTITY_MISMATCH") {
      return (
        "⚠️ <b>Could not verify the profile</b>\n\n" +
        "The provider returned data that did not match the requested username. Try again later or check the link manually.\n\n" +
        "💎 The reserved credits were returned to your balance."
      );
    }
    return (
      "⚠️ <b>Could not finish the analysis</b>\n\n" +
      "We tried several times but could not build the report. " +
      "💎 The reserved credits were returned to your balance — try again later or contact support."
    );
  },
  genericError(): string {
    return "⚠️ Could not process the request. Please try again later or contact support.";
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
