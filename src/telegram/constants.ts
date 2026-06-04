export const CB = {
  BACK_MAIN: "m:main",
  CANCEL: "m:cancel",
  ACCEPT_RULES: "on:accept",
  LANG: "set:lang",
  ANALYZE: "a:start",
  MODE: "a:mode",
  RUN: "a:run",
  OSINT_LAWFUL_BASIS: "a:osint_basis",
  PHOTO: "p:start",
  PHOTO_ACK: "p:ack",
  PHOTO_ANALYZE: "p:an",
  HISTORY: "h:list",
  REPORT_OPEN: "r:open",
  REPORT_SECTIONS: "r:sections",
  REPORT_SECTION: "r:sec",
  REPORT_PDF: "r:pdf",
  REPORT_MARKDOWN: "r:md",
  REPORT_SOURCES: "r:src",
  REPORT_CHAT: "r:chat",
  CHAT_QUICK: "chat:q",
  PROFILE: "u:profile",
  SETTINGS: "u:settings",
  DELETE_ME_CONFIRM: "u:del",
  SET_LANGUAGE: "set:ui_lang",
  SET_RETENTION: "set:ret",
  SET_EXPORT: "set:fmt",
  PAYWALL: "pay",
  PAY_METHOD_STARS: "pay:stars",
  PAY_METHOD_YOOKASSA: "pay:yk",
  BUY_STARS: "buy:xtr",
  BUY_YOOKASSA: "buy:rub",
  ADMIN: "adm",
  ADMIN_GRANT: "adm:grant"
} as const;

export const ANALYSIS_MODES = ["standard", "influencer", "hr", "osint_compliance"] as const;
export type AnalysisMode = (typeof ANALYSIS_MODES)[number];

export const LOCALES = ["ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export type WizardState =
  | "waiting_username"
  | "selecting_mode"
  | "waiting_hr_position"
  | "confirming_osint"
  | "confirming_analysis"
  | "waiting_photo"
  | "waiting_email"
  | "report_chat";

export const TELEGRAM_HTML_CHUNK = 3500;
