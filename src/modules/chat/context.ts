type StoredReportSection = {
  title: string;
  content: string;
  sources?: unknown;
  position?: number;
};

type StoredReportForChat = {
  id?: string;
  mode?: string;
  language?: string;
  rawText?: string | null;
  summary?: unknown;
  metrics?: unknown;
  sourceMap?: unknown;
  sections?: StoredReportSection[];
};

export function buildReportChatContext(report: StoredReportForChat): string {
  return JSON.stringify(
    {
      reportId: report.id,
      mode: report.mode,
      language: report.language,
      summary: normalizeSummary(report.summary),
      metrics: report.metrics,
      sourceMap: limitArray(report.sourceMap, 40),
      sections: [...(report.sections ?? [])]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((section) => ({
          title: section.title,
          content: truncate(section.content, 1800),
          sources: limitArray(section.sources, 10)
        })),
      rawTextExcerpt: report.sections?.length ? undefined : truncate(report.rawText, 5000)
    },
    null,
    2
  );
}

function normalizeSummary(summary: unknown): unknown {
  if (!summary || typeof summary !== "object") return summary;
  const value = summary as {
    executiveSummary?: unknown;
    bullets?: unknown;
    warnings?: unknown;
    analysisHealth?: unknown;
    quality?: unknown;
    evidence?: unknown;
  };
  return {
    executiveSummary:
      typeof value.executiveSummary === "string" ? value.executiveSummary.slice(0, 1200) : "",
    bullets: Array.isArray(value.bullets) ? value.bullets.slice(0, 8) : [],
    warnings: Array.isArray(value.warnings) ? value.warnings.slice(0, 8) : [],
    analysisHealth: value.analysisHealth,
    quality: value.quality,
    evidence: value.evidence
  };
}

function limitArray(value: unknown, limit: number): unknown {
  return Array.isArray(value) ? value.slice(0, limit) : value;
}

function truncate(value: string | null | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}…` : value;
}
