import type { AnalysisMode } from "../../telegram/constants.js";
import type { ReportSectionView } from "./types.js";

export const REQUIRED_SECTIONS: Record<AnalysisMode, string[]> = {
  standard: [
    "Основные темы и приоритеты",
    "Повторяющиеся визуальные и текстовые паттерны",
    "Поведение и вовлеченность",
    "Аудитория и комментарии",
    "Стиль общения",
    "Профессия и статус",
    "Отличие от типичных аккаунтов",
    "Отсутствия как сигнал",
    "Потенциальная польза от контакта",
    "Триггеры и зацепки",
    "Коммуникационные рекомендации",
    "Готовые фразы для входа в диалог",
    "Неочевидные наблюдения",
    "Общая оценка ценности профиля",
    "Поведенческие сигналы",
    "Ошибки, слепые зоны, барьеры",
    "Образ как у бренда"
  ],
  influencer: [
    "Brand safety",
    "Audience quality",
    "Authenticity check",
    "Advertising blindness / ad saturation",
    "Visual and production value",
    "Hidden insights",
    "Effectiveness forecast",
    "Marketer verdict"
  ],
  hr: [
    "Cultural fit",
    "Красные флаги и риски",
    "Soft skills",
    "Digital reputation",
    "Motivation and energy",
    "Hidden insights",
    "Interview recommendations",
    "Verdict"
  ],
  osint_compliance: [
    "Public facts",
    "Asset and lifestyle signals",
    "Location signals",
    "Published contacts",
    "Risk and inconsistency checks",
    "Verification checklist",
    "Compliance notes"
  ]
};

const REQUIRED_SECTION_ALIASES: Partial<Record<AnalysisMode, Record<string, string[]>>> = {
  standard: {
    "Основные темы и приоритеты": ["Main themes and priorities", "Core themes and priorities"],
    "Повторяющиеся визуальные и текстовые паттерны": [
      "Recurring visual and textual patterns",
      "Recurring visual and text patterns"
    ],
    "Поведение и вовлеченность": ["Behavior and engagement", "Behaviour and engagement"],
    "Аудитория и комментарии": ["Audience and comments"],
    "Стиль общения": ["Communication style"],
    "Профессия и статус": ["Profession and status"],
    "Отличие от типичных аккаунтов": ["Difference from typical accounts"],
    "Отсутствия как сигнал": ["Absences as a signal", "Missing signals"],
    "Потенциальная польза от контакта": ["Potential value of contact"],
    "Триггеры и зацепки": ["Triggers and hooks"],
    "Коммуникационные рекомендации": ["Communication recommendations"],
    "Готовые фразы для входа в диалог": ["Ready phrases for starting a dialogue"],
    "Неочевидные наблюдения": ["Non-obvious observations", "Hidden observations"],
    "Общая оценка ценности профиля": ["Overall profile value assessment"],
    "Поведенческие сигналы": ["Behavioral signals", "Behavioural signals"],
    "Ошибки, слепые зоны, барьеры": ["Mistakes, blind spots, barriers"],
    "Образ как у бренда": ["Brand-like image", "Image as a brand"]
  }
};

export function parseReportSections(rawText: string, mode: AnalysisMode): ReportSectionView[] {
  const byMarker = rawText
    .split(/\[\[SECTION\]\]/g)
    .map((part) => part.trim())
    .filter(Boolean);
  const parts = byMarker.length > 1 ? byMarker : splitNumbered(rawText);
  const sections = parts.map((part, index) => {
    const lines = part
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const first = lines.shift() ?? REQUIRED_SECTIONS[mode]?.[index] ?? `Section ${index + 1}`;
    const title = first
      .replace(/^\d+[).:-]\s*/, "")
      .replace(/^#+\s*/, "")
      .trim();
    return {
      title,
      content: lines.join("\n\n") || part,
      kind: inferKind(title),
      sources: extractSources(part)
    };
  });
  if (!sections.length) {
    return [{ title: "Report", content: rawText, kind: "fallback", sources: [] }];
  }
  return sections;
}

function splitNumbered(rawText: string): string[] {
  const matches = rawText.match(
    /(?:^|\n)(?:\d+[).:-]\s+|#+\s+).+?(?=(?:\n(?:\d+[).:-]\s+|#+\s+))|$)/gs
  );
  return matches?.map((part) => part.trim()) ?? [rawText.trim()];
}

function inferKind(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("digital circle")) return "digital_circle";
  if (lower.includes("фраз") || lower.includes("phrase")) return "phrases";
  if (lower.includes("metric") || lower.includes("метрик")) return "metrics";
  if (lower.includes("source") || lower.includes("источник")) return "sources";
  return "section";
}

function extractSources(text: string) {
  const sources: Array<{ url: string; label: string; postId?: string }> = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    for (const match of line.matchAll(/https?:\/\/[^\s)]+/g)) {
      const url = match[0];
      if (seen.has(url)) continue;
      seen.add(url);
      const postId =
        line.match(/\[([^\]\s]+)\]/)?.[1] ??
        line.match(/\bpost(?:Id| ID| id)?[:\s]+([A-Za-z0-9_-]+)/)?.[1];
      sources.push({
        url,
        postId,
        label: cleanSourceLabel(line, sources.length + 1)
      });
    }
  }
  return sources.slice(0, 8);
}

function cleanSourceLabel(line: string, index: number): string {
  const cleaned = line
    .replace(/https?:\/\/[^\s)]+/g, "")
    .replace(/^[-*\s]+/, "")
    .trim();
  return cleaned || `Source ${index}`;
}

export function validateRequiredSections(
  mode: AnalysisMode,
  sections: ReportSectionView[]
): string[] {
  const titles = sections.map((section) => normalizeTitle(section.title));
  return REQUIRED_SECTIONS[mode].filter(
    (required) =>
      !requiredTitleCandidates(mode, required).some((candidate) =>
        titles.some((title) => title.includes(candidate))
      )
  );
}

function requiredTitleCandidates(mode: AnalysisMode, required: string): string[] {
  return [required, ...(REQUIRED_SECTION_ALIASES[mode]?.[required] ?? [])]
    .map((title) => normalizeTitle(title).slice(0, 14))
    .filter(Boolean);
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
