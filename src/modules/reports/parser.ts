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
  },
  influencer: {
    "Brand safety": ["Безопасность бренда", "Риски для бренда", "Brand risk"],
    "Audience quality": ["Качество аудитории", "Audience signals"],
    "Authenticity check": ["Проверка подлинности", "Аутентичность", "Authenticity signals"],
    "Advertising blindness / ad saturation": [
      "Рекламная слепота",
      "Насыщенность рекламой",
      "Перегруз рекламой",
      "Ad saturation"
    ],
    "Visual and production value": [
      "Визуальная и продакшн ценность",
      "Визуальное качество",
      "Production value"
    ],
    "Hidden insights": ["Скрытые инсайты", "Неочевидные наблюдения"],
    "Effectiveness forecast": ["Прогноз эффективности", "Forecast"],
    "Marketer verdict": ["Вердикт маркетолога", "Marketing verdict"]
  },
  hr: {
    "Cultural fit": ["Культурное соответствие", "Culture fit"],
    "Красные флаги и риски": ["Red flags and risks", "Risks and red flags"],
    "Soft skills": ["Мягкие навыки", "Soft-skill signals"],
    "Digital reputation": ["Цифровая репутация"],
    "Motivation and energy": ["Мотивация и энергия"],
    "Hidden insights": ["Скрытые инсайты", "Неочевидные наблюдения"],
    "Interview recommendations": ["Рекомендации для интервью", "Interview checks"],
    Verdict: ["Вердикт", "HR verdict"]
  },
  osint_compliance: {
    "Public facts": ["Публичные факты", "Open-source facts"],
    "Asset and lifestyle signals": ["Сигналы активов и образа жизни", "Lifestyle signals"],
    "Location signals": ["Сигналы локаций", "Geography signals"],
    "Published contacts": ["Опубликованные контакты", "Public contacts"],
    "Risk and inconsistency checks": [
      "Проверки рисков и несостыковок",
      "Risk checks",
      "Inconsistency checks"
    ],
    "Verification checklist": ["Чеклист проверки", "Verification steps"],
    "Compliance notes": ["Комплаенс заметки", "Правовые заметки", "Lawful-use notes"]
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
  const sources: Array<{ url?: string; label: string; postId?: string }> = [];
  const seen = new Set<string>();
  let inEvidenceBlock = false;

  const addSource = (source: { url?: string; label: string; postId?: string }) => {
    const key = source.url
      ? `url:${normalizeSourceUrl(source.url)}`
      : source.postId
        ? `post:${source.postId}`
        : `label:${source.label.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    sources.push(source);
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(evidence|sources?|источники|доказательства)\s*:?$/iu.test(line)) {
      inEvidenceBlock = true;
      continue;
    }
    if (/^(confidence|caveats?|уверенность|ограничения|оговорки)\s*:/iu.test(line)) {
      inEvidenceBlock = false;
    }

    let matchedUrl = false;
    for (const match of line.matchAll(/https?:\/\/[^\s)]+/g)) {
      matchedUrl = true;
      const url = match[0];
      addSource({
        url,
        postId: extractPostId(line),
        label: cleanSourceLabel(line, sources.length + 1)
      });
    }

    if (!matchedUrl && (inEvidenceBlock || looksLikeSourceLine(line))) {
      const postId = extractPostId(line);
      const profileMetadata = /profile\s+(?:metadata|data)|метаданн|данн[^\n]{0,20}профил/iu.test(
        line
      );
      if (postId || profileMetadata) {
        addSource({
          postId,
          label: cleanSourceLabel(line, sources.length + 1)
        });
      }
    }
  }
  return sources.slice(0, 8);
}

function extractPostId(line: string): string | undefined {
  return (
    line.match(/\[([^\]\s]+)\]/)?.[1] ??
    line.match(/\bpost(?:Id| ID| id)?[:\s]+([A-Za-z0-9_-]+)/)?.[1]
  );
}

function looksLikeSourceLine(line: string): boolean {
  return /^[-*]\s*(?:\[[^\]\s]+\]|source\b|evidence\b|post(?:Id| ID| id)?\b|profile\s+(?:metadata|data))/iu.test(
    line
  );
}

function normalizeSourceUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
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
