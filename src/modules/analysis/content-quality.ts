import {
  PRACTICAL_REPAIR_HINT_EN,
  PRACTICAL_REQUIREMENTS
} from "../../prompts/practical-requirements.js";
import type { ReportMetrics, ReportSectionView } from "../reports/types.js";
import { findUserFacingInstructionLeaks } from "./instruction-leak.js";

export type ContentQualityFinding = {
  id: string;
  severity: "low" | "medium" | "high";
  detail: string;
};

export type ContentQualityRubric = {
  score: number;
  findings: ContentQualityFinding[];
  dimensions: {
    specificity: number;
    practicalValue: number;
    practicalDetail: number;
    confidenceCalibration: number;
    depth: number;
    keySectionDepth: number;
    healthTransparency: number;
  };
};

const REPAIR_WORTHY_FINDING_IDS = new Set([
  "content:key_sections_too_short",
  "content:weak_practical_detail",
  "content:low_practical_value",
  "content:missing_low_coverage_framing",
  "content:user_facing_instruction_leak"
]);

export function evaluateReportContentQuality(input: {
  sections: ReportSectionView[];
  executiveSummary?: string;
  warnings?: string[];
  metrics?: ReportMetrics;
}): ContentQualityRubric {
  const findings: ContentQualityFinding[] = [];
  const text = normalize(
    [input.executiveSummary, ...(input.warnings ?? []), ...input.sections.map((s) => s.content)]
      .filter(Boolean)
      .join("\n")
  );
  const sectionCount = Math.max(1, input.sections.length);
  const avgWords =
    input.sections.reduce((sum, section) => sum + wordCount(section.content), 0) / sectionCount;
  const sourcedRatio =
    input.sections.filter((section) => section.sources.length > 0).length / sectionCount;
  const evidenceMentions = countMatches(
    text,
    /https?:\/\/|comment|комментар|vision|визуал|metrics?|метрик|ER|лайк|гео|локац|caption|подпис/giu
  );
  const practicalMentions = countMatches(
    text,
    /рекоменд|зацепк|фраз|начинать|избегать|практич|useful|recommend|hook|avoid|start/giu
  );
  const confidenceMentions = countMatches(
    text,
    /confidence|caveat|hypothes|limited|sample|selected|not private|уверен|огранич|гипотез|выборк|сигнал|недостаточно|public data|публичн/giu
  );
  const healthMentions = countMatches(
    text,
    /recent \d+-post read|покрыт|coverage|vision|комментар|comment text|выборк/giu
  );
  const instructionLeaks = findUserFacingInstructionLeaks(text);
  const keyShortfalls = keySectionShortfalls(input.sections);
  const practicalShortfalls = practicalDetailShortfalls(input.sections);
  const keySectionDepth =
    keyShortfalls.total === 0
      ? 100
      : clampScore(Math.round(100 - (keyShortfalls.short.length / keyShortfalls.total) * 100));
  const practicalDetail =
    practicalShortfalls.total === 0
      ? 100
      : clampScore(
          Math.round(100 - (practicalShortfalls.weak.length / practicalShortfalls.total) * 100)
        );

  const dimensions = {
    specificity: clampScore(Math.round(sourcedRatio * 60 + Math.min(40, evidenceMentions * 2))),
    practicalValue: clampScore(Math.round(Math.min(100, practicalMentions * 12))),
    practicalDetail,
    confidenceCalibration: clampScore(Math.round(Math.min(100, confidenceMentions * 8))),
    depth: clampScore(Math.round(Math.min(100, avgWords * 2))),
    keySectionDepth,
    healthTransparency: clampScore(Math.round(Math.min(100, healthMentions * 10)))
  };

  if (dimensions.specificity < 70) {
    findings.push({
      id: "content:low_specificity",
      severity: "medium",
      detail: "Report content needs more concrete post/comment/vision/metric evidence."
    });
  }
  if (dimensions.practicalValue < 50) {
    findings.push({
      id: "content:low_practical_value",
      severity: "medium",
      detail:
        "Report should better translate observations into useful recommendations or implications."
    });
  }
  if (dimensions.confidenceCalibration < 60) {
    findings.push({
      id: "content:weak_confidence_calibration",
      severity: "medium",
      detail:
        "Report should state confidence limits, sample-size caveats, and public-data limits more clearly."
    });
  }
  if (dimensions.depth < 55) {
    findings.push({
      id: "content:thin_sections",
      severity: "low",
      detail: "Sections are short; content may feel shallow even when sourced."
    });
  }
  if (keyShortfalls.short.length >= 3) {
    findings.push({
      id: "content:key_sections_too_short",
      severity: "medium",
      detail: `Key sections are too short to be useful: ${keyShortfalls.short
        .slice(0, 6)
        .map((item) => `${item.title} (${item.words}w)`)
        .join(", ")}.`
    });
  }
  if (practicalShortfalls.weak.length >= 2) {
    findings.push({
      id: "content:weak_practical_detail",
      severity: "medium",
      detail: `Practical/action sections need more concrete next steps, hooks, or examples: ${practicalShortfalls.weak
        .slice(0, 6)
        .map((item) => item.title)
        .join(", ")}.`
    });
  }
  if (input.metrics && input.metrics.postsCount > input.metrics.analyzedPosts) {
    const coverage = input.metrics.analyzedPosts / input.metrics.postsCount;
    if (coverage < 0.1 && dimensions.healthTransparency < 60) {
      findings.push({
        id: "content:missing_low_coverage_framing",
        severity: "high",
        detail: "Very low sample coverage must be visible in the user-facing content."
      });
    }
  }
  if (instructionLeaks.length) {
    findings.push({
      id: "content:user_facing_instruction_leak",
      severity: "high",
      detail: `Report exposes internal generation/rubric wording: ${instructionLeaks.join(", ")}.`
    });
  }

  const weightedScore = Math.round(
    dimensions.specificity * 0.22 +
      dimensions.practicalValue * 0.16 +
      dimensions.practicalDetail * 0.16 +
      dimensions.confidenceCalibration * 0.18 +
      dimensions.depth * 0.12 +
      dimensions.keySectionDepth * 0.08 +
      dimensions.healthTransparency * 0.08
  );
  const rawScore = Math.max(0, weightedScore - severityPenalty(findings));

  return {
    score: applyCoverageScoreCap(rawScore, input.metrics),
    findings,
    dimensions
  };
}

export function contentQualityFindingsNeedRepair(findings: ContentQualityFinding[]): boolean {
  const mediumCount = findings.filter((finding) => finding.severity === "medium").length;
  return (
    findings.some((finding) => finding.severity === "high") ||
    findings.some((finding) => REPAIR_WORTHY_FINDING_IDS.has(finding.id)) ||
    mediumCount >= 3
  );
}

export function renderContentQualityFindings(findings: ContentQualityFinding[]): string[] {
  return findings.slice(0, 20).map((finding) => {
    const fix = contentQualityRepairHint(finding.id);
    return `${finding.severity.toUpperCase()} [${finding.id}]: ${finding.detail}${
      fix ? ` Fix: ${fix}` : ""
    }`;
  });
}

function contentQualityRepairHint(id: string): string | undefined {
  if (id === "content:key_sections_too_short") {
    return "Expand key user-facing sections with concrete evidence, implication, confidence, and caveat.";
  }
  if (id === "content:weak_practical_detail" || id === "content:low_practical_value") {
    return PRACTICAL_REPAIR_HINT_EN;
  }
  if (id === "content:missing_low_coverage_framing") {
    return "State the report is a selected/recent public-post read and avoid whole-profile conclusions.";
  }
  if (id === "content:user_facing_instruction_leak") {
    return "Rewrite leaked instruction/rubric wording as natural user-facing analysis; do not mention counts, word-count targets, rubric targets, or repair instructions.";
  }
  if (id === "content:weak_confidence_calibration") {
    return "Name confidence level, sample limits, public-data limits, and what cannot be inferred.";
  }
  if (id === "content:low_specificity") {
    return "Replace generic claims with post/comment/metric/vision-backed observations.";
  }
  return undefined;
}

function severityPenalty(findings: ContentQualityFinding[]): number {
  return findings.reduce((sum, finding) => {
    if (finding.severity === "high") return sum + 12;
    if (finding.severity === "medium") return sum + 6;
    return sum + 2;
  }, 0);
}

function applyCoverageScoreCap(score: number, metrics?: ReportMetrics): number {
  if (!metrics?.postsCount || !metrics.analyzedPosts) return score;
  if (metrics.analyzedPosts >= metrics.postsCount) return score;
  const coverage = metrics.analyzedPosts / metrics.postsCount;
  if (coverage < 0.05) return Math.min(score, 88);
  if (coverage < 0.1) return Math.min(score, 92);
  if (coverage < 0.35) return Math.min(score, 96);
  if (coverage < 0.8) return Math.min(score, 98);
  return score;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function keySectionShortfalls(sections: ReportSectionView[]): {
  total: number;
  short: Array<{ title: string; words: number }>;
} {
  if (sections.length < 6) return { total: 0, short: [] };
  const keySections = sections
    .map((section) => ({
      section,
      threshold: keySectionMinWords(section.title)
    }))
    .filter((item) => item.threshold > 0);
  return {
    total: keySections.length,
    short: keySections
      .map((item) => ({
        title: item.section.title,
        words: wordCount(item.section.content),
        threshold: item.threshold
      }))
      .filter((item) => item.words < item.threshold - 5)
  };
}

function keySectionMinWords(title: string): number {
  const normalized = normalizeTitle(title);
  if (/основные темы|main themes|core themes/.test(normalized)) return 65;
  if (/аудитория|audience/.test(normalized)) return 55;
  if (/потенциальная польза|potential value/.test(normalized)) return 55;
  if (/триггеры|зацепки|triggers|hooks/.test(normalized)) return 50;
  if (/коммуникационные рекомендации|communication recommendations/.test(normalized)) return 55;
  if (/готовые фразы|ready phrases/.test(normalized)) return 55;
  if (/общая оценка|overall profile value|verdict|marketer verdict/.test(normalized)) return 55;
  if (/ошибки|слепые зоны|барьеры|blind spots|barriers|risk/.test(normalized)) return 55;
  if (/поведенческие сигналы|behavioral signals|behavioural signals/.test(normalized)) return 45;
  if (/отсутствия как сигнал|absences as a signal|missing signals/.test(normalized)) return 45;
  if (/стиль общения|communication style/.test(normalized)) return 45;
  return 0;
}

function practicalDetailShortfalls(sections: ReportSectionView[]): {
  total: number;
  weak: Array<{ title: string; words: number; detailMarkers: number }>;
} {
  if (sections.length < 6) return { total: 0, weak: [] };
  const practicalSections = sections.filter((section) => practicalSection(section.title));
  return {
    total: practicalSections.length,
    weak: practicalSections
      .map((section) => ({
        title: section.title,
        words: wordCount(section.content),
        detailMarkers: practicalDetailMarkers(section.content)
      }))
      .filter(
        (section) =>
          section.words < PRACTICAL_REQUIREMENTS.minPracticalSectionWords ||
          section.detailMarkers < 3
      )
  };
}

function practicalSection(title: string): boolean {
  return /потенциальная польза|триггеры|зацепки|коммуникационные рекомендации|готовые фразы|общая оценка|potential value|triggers|hooks|communication recommendations|ready phrases|overall profile value/i.test(
    normalizeTitle(title)
  );
}

function practicalDetailMarkers(content: string): number {
  return countMatches(
    content,
    /«|»|"|^\s*\d+[.)]|\?|спрос|начин|напис|коммент|избег|зацеп|фраз|рекоменд|пример|шаг|обсужд|интерес|полезн|\b(?:ask|start|message|comment|avoid|hook|phrase|recommend|example|next step)\b/gimu
  );
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function wordCount(value: string): number {
  return value.match(/[\p{L}\p{N}]{2,}/gu)?.length ?? 0;
}
