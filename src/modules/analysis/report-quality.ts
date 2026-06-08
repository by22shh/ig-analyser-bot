import type { AnalysisMode } from "../../telegram/constants.js";
import type { AnalysisContext } from "./context.js";
import type { ReportMetrics, ReportSectionView } from "../reports/types.js";

export type SectionQualitySeverity = "low" | "medium" | "high";

export type SectionQualityFinding = {
  id: string;
  severity: SectionQualitySeverity;
  title?: string;
  detail: string;
};

export type ReportQualitySummary = {
  score: number;
  findings: SectionQualityFinding[];
};

export function evaluateReportQuality(input: {
  mode: AnalysisMode;
  sections: ReportSectionView[];
  metrics?: ReportMetrics;
  analysisContext?: AnalysisContext;
}): ReportQualitySummary {
  const findings: SectionQualityFinding[] = [];
  if (!input.sections.length) {
    return {
      score: 0,
      findings: [
        {
          id: "report:no_sections",
          severity: "high",
          detail: "The report has no parsed sections."
        }
      ]
    };
  }

  for (const section of input.sections) {
    const content = normalize(section.content);
    const words = wordCount(content);
    const hasSource = section.sources.length > 0;

    if (!hasSource) {
      findings.push({
        id: `section:${section.title}:missing_source`,
        severity: "medium",
        title: section.title,
        detail: "Section has no extracted source URL/post ID."
      });
    }
    if (!hasSource && words < 25) {
      findings.push({
        id: `section:${section.title}:thin_unsupported`,
        severity: "high",
        title: section.title,
        detail: "Section is very short and unsupported by evidence."
      });
    }
    if (!hasSource && looksGeneric(content)) {
      findings.push({
        id: `section:${section.title}:generic_language`,
        severity: "medium",
        title: section.title,
        detail: "Section reads generic and needs profile-specific evidence."
      });
    }
  }

  const sourcedCount = input.sections.filter((section) => section.sources.length).length;
  if (sourcedCount / input.sections.length < 0.5) {
    findings.push({
      id: "report:low_evidence_coverage",
      severity: "medium",
      detail: `${sourcedCount}/${input.sections.length} sections contain extracted sources.`
    });
  }

  if (!hasConfidenceLanguage(input.sections)) {
    findings.push({
      id: "report:missing_confidence_calibration",
      severity: "low",
      detail: "Report should explicitly calibrate confidence or public-data limits."
    });
  }

  if (hasInternalOperationalLeak(input.sections)) {
    findings.push({
      id: "report:internal_operational_goal_leak",
      severity: "high",
      detail:
        "Report appears to mention internal test/deploy/pipeline wording instead of user-facing profile analysis."
    });
  }

  if (hasInternalSchemaLeak(input.sections)) {
    findings.push({
      id: "report:internal_schema_term_leak",
      severity: "high",
      detail:
        "Report exposes internal schema names such as analysisContext/contentClusters instead of user-facing wording."
    });
  }

  if (input.analysisContext?.riskSignals.some((signal) => signal.id === "risk:vision_gaps")) {
    findings.push({
      id: "report:vision_evidence_gap",
      severity: "medium",
      detail:
        "Selected visual posts could not be analyzed; visual-pattern claims should be limited."
    });
  }

  const audienceSignals = input.analysisContext?.audienceSignals;
  if (
    audienceSignals &&
    audienceSignals.commentDensity !== "none" &&
    !audienceSignals.frequentCommenters.length &&
    !audienceSignals.repeatedCommentTerms.length
  ) {
    findings.push({
      id: "report:comments_count_only",
      severity: "low",
      detail:
        "Comment counts exist, but commenter identities and comment text are unavailable for audience-quality analysis."
    });
  }

  const sampleCoverageFinding = sampleCoverageQualityFinding(input.metrics);
  if (sampleCoverageFinding) findings.push(sampleCoverageFinding);

  const modeFinding = modeSpecificFinding(input.mode, input.sections, input.metrics);
  if (modeFinding) findings.push(modeFinding);

  return summarizeReportQuality(findings);
}

export function summarizeReportQuality(findings: SectionQualityFinding[]): ReportQualitySummary {
  const penalty = findings.reduce((sum, finding) => {
    if (finding.severity === "high") return sum + 18;
    if (finding.severity === "medium") return sum + 7;
    return sum + 1;
  }, 0);
  return {
    score: Math.max(0, Math.min(100, 100 - penalty)),
    findings
  };
}

export function qualityFindingsNeedRepair(findings: SectionQualityFinding[]): boolean {
  const mediumCount = findings.filter((finding) => finding.severity === "medium").length;
  return (
    findings.some((finding) => finding.severity === "high") ||
    mediumCount >= 3 ||
    findings.some((finding) => finding.id === "report:low_evidence_coverage")
  );
}

export function renderQualityFindings(findings: SectionQualityFinding[]): string[] {
  return findings.slice(0, 20).map((finding) => {
    const title = finding.title ? ` [${finding.title}]` : "";
    return `${finding.severity.toUpperCase()}${title}: ${finding.detail}`;
  });
}

export function renderQualityWarning(summary: ReportQualitySummary): string | undefined {
  const important = summary.findings.filter((finding) => finding.severity !== "low");
  if (!important.length && summary.score >= 85) return undefined;
  return `Quality flags: score ${summary.score}/100, ${important.length} medium/high findings`;
}

function modeSpecificFinding(
  mode: AnalysisMode,
  sections: ReportSectionView[],
  metrics?: ReportMetrics
): SectionQualityFinding | undefined {
  const fullText = normalize(
    sections.map((section) => `${section.title} ${section.content}`).join("\n")
  );
  if (
    mode === "influencer" &&
    !/(brand|бренд|audience|аудитор|authentic|аутентич|ad|реклам)/iu.test(fullText)
  ) {
    return {
      id: "mode:influencer:missing_marketing_lens",
      severity: "medium",
      detail: "Influencer report lacks explicit brand/audience/authenticity lens."
    };
  }
  if (
    mode === "hr" &&
    !/(interview|интервью|question|вопрос|verification|провер)/iu.test(fullText)
  ) {
    return {
      id: "mode:hr:missing_interview_lens",
      severity: "medium",
      detail: "HR report should turn public signals into fair interview or verification checks."
    };
  }
  if (
    mode === "osint_compliance" &&
    !/(lawful|legal|compliance|verification|провер|комплаенс|закон)/iu.test(fullText)
  ) {
    return {
      id: "mode:osint:missing_compliance_lens",
      severity: "medium",
      detail: "OSINT compliance report needs lawful verification and compliance framing."
    };
  }
  if (mode === "standard" && metrics && metrics.analyzedPosts > 0 && metrics.analyzedPosts < 6) {
    return {
      id: "mode:standard:thin_sample",
      severity: "low",
      detail: "Standard report should state that the selected sample is small."
    };
  }
  return undefined;
}

function sampleCoverageQualityFinding(metrics?: ReportMetrics): SectionQualityFinding | undefined {
  if (!metrics?.postsCount || !metrics.analyzedPosts) return undefined;
  if (metrics.analyzedPosts >= metrics.postsCount) return undefined;
  const coverage = metrics.analyzedPosts / metrics.postsCount;
  const percent = Math.round(coverage * 1000) / 10;
  if (coverage < 0.05) {
    return {
      id: "report:very_low_sample_coverage",
      severity: "medium",
      detail: `${metrics.analyzedPosts}/${metrics.postsCount} posts analyzed (${percent}%). Whole-profile conclusions should be low-confidence.`
    };
  }
  if (coverage < 0.1) {
    return {
      id: "report:low_sample_coverage",
      severity: "low",
      detail: `${metrics.analyzedPosts}/${metrics.postsCount} posts analyzed (${percent}%). Report should frame findings as selected-post signals.`
    };
  }
  return undefined;
}

function hasConfidenceLanguage(sections: ReportSectionView[]): boolean {
  return /(confidence|caveat|hypothesis|limited|низк|средн|высок|уверен|гипотез|огранич)/iu.test(
    sections.map((section) => section.content).join("\n")
  );
}

function looksGeneric(content: string): boolean {
  if (!content) return true;
  if (
    /(public profile|recurring pattern|practical recommendation|interesting profile|публичный профиль|повторяющийся паттерн|практическая рекомендация)/iu.test(
      content
    )
  ) {
    return true;
  }
  return (
    wordCount(content) < 45 && !/(https?:\/\/|@[A-Za-z0-9._]{3,32}|#\p{L}|\d{2,})/u.test(content)
  );
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hasInternalOperationalLeak(sections: ReportSectionView[]): boolean {
  return INTERNAL_OPERATIONAL_REPORT_RE.test(sections.map((section) => section.content).join("\n"));
}

function hasInternalSchemaLeak(sections: ReportSectionView[]): boolean {
  return INTERNAL_SCHEMA_TERM_RE.test(sections.map((section) => section.content).join("\n"));
}

const INTERNAL_OPERATIONAL_REPORT_RE =
  /\b(?:prod(?:uction)?[-\s]?e2e|e2e|ci|smoke\s+test|deploy(?:ment)?|pipeline|production\s+(?:eval(?:uation)?|test|smoke)|end-to-end\s+(?:eval(?:uation)?|test|smoke))\b|(?:пайплайн|депло[йя]|прод(?:овый|е)?\s+тест|сквозн(?:ой|ого)\s+тест)/iu;

const INTERNAL_SCHEMA_TERM_RE =
  /\b(?:analysisContext|evidenceMap|contentClusters|profileSignals|audienceSignals|riskSignals|opportunitySignals|sourceCatalog|postIds)\b/u;

function wordCount(value: string): number {
  return value.match(/[\p{L}\p{N}]{2,}/gu)?.length ?? 0;
}
