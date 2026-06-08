import type { AnalysisMode, Locale } from "../../telegram/constants.js";
import { env } from "../../config/env.js";
import type { InstagramProfile } from "../instagram/types.js";
import {
  renderGroundingFindings,
  runDeterministicGrounding,
  type GroundingFinding,
  type SourceCatalogEntry
} from "../llm/grounding.js";
import type { LlmProvider } from "../llm/types.js";
import { computeReportMetrics } from "../reports/metrics.js";
import { parseReportSections, validateRequiredSections } from "../reports/parser.js";
import type {
  ReportSectionView,
  StrategicReportView,
  VisionAnalysisItemView
} from "../reports/types.js";
import { analysisContextDigest, buildAnalysisContext, selectAnalysisPosts } from "./context.js";
import {
  evaluateReportQuality,
  qualityFindingsNeedRepair,
  renderQualityFindings,
  renderQualityWarning,
  type SectionQualityFinding
} from "./report-quality.js";

export async function buildStrategicReport(input: {
  mode: AnalysisMode;
  language: Locale;
  profile: InstagramProfile;
  llm: LlmProvider;
  targetPosition?: string;
  goal?: string;
  vision?: VisionAnalysisItemView[];
}): Promise<StrategicReportView> {
  const selection = selectAnalysisPosts(input.profile.posts, {
    limit: env.ANALYSIS_POST_LIMIT ?? 30
  });
  const posts = selection.posts;
  const selectedPostIds = new Set(posts.map((post) => post.id));
  const profile = { ...input.profile, posts };
  const analyzedVision = input.vision ?? (await input.llm.analyzeVision({ profile, posts }));
  const vision = analyzedVision.filter((item) => selectedPostIds.has(item.postId));
  const metrics = computeReportMetrics(profile, posts);
  const analysisContext = buildAnalysisContext({
    mode: input.mode,
    profile,
    posts,
    selection,
    metrics,
    vision
  });
  let generated = await input.llm.generateReport({
    mode: input.mode,
    language: input.language,
    profile,
    posts,
    vision,
    metrics,
    analysisContext,
    targetPosition: input.targetPosition,
    goal: input.goal
  });
  let sections = parseReportSections(generated.rawText, input.mode);
  let missing = validateRequiredSections(input.mode, sections);
  let weakSourceSections = weakSourceSectionTitles(sections);
  const sourceCatalog: SourceCatalogEntry[] = [
    { url: `https://www.instagram.com/${profile.username}/` },
    ...(profile.externalUrl ? [{ url: profile.externalUrl }] : []),
    ...posts.map((post) => ({
      postId: post.id,
      url: post.url
    }))
  ];
  let groundingFindings = await runGrounding(input.llm, input.language, sections, sourceCatalog);
  let qualitySummary = evaluateReportQuality({
    mode: input.mode,
    sections,
    metrics,
    analysisContext
  });

  if (
    (missing.length ||
      shouldRepairSources(sections, weakSourceSections) ||
      groundingFindings.length ||
      qualityFindingsNeedRepair(qualitySummary.findings)) &&
    input.llm.repairReport
  ) {
    const repaired = await input.llm
      .repairReport({
        mode: input.mode,
        language: input.language,
        profile,
        posts,
        vision,
        metrics,
        analysisContext,
        targetPosition: input.targetPosition,
        goal: input.goal,
        rawText: generated.rawText,
        missingSections: missing,
        weakSourceSections,
        groundingFindings: renderGroundingFindings(groundingFindings),
        qualityFindings: renderQualityFindings(qualitySummary.findings)
      })
      .catch(() => undefined);
    if (repaired) {
      const repairedSections = parseReportSections(repaired.rawText, input.mode);
      const repairedMissing = validateRequiredSections(input.mode, repairedSections);
      const repairedGrounding = runDeterministicGrounding(repairedSections, sourceCatalog).findings;
      const repairedWeakSourceSections = weakSourceSectionTitles(repairedSections);
      const repairedQualitySummary = evaluateReportQuality({
        mode: input.mode,
        sections: repairedSections,
        metrics,
        analysisContext
      });
      if (
        reportIssueScore(
          repairedSections,
          repairedMissing,
          repairedGrounding,
          repairedQualitySummary.findings
        ) < reportIssueScore(sections, missing, groundingFindings, qualitySummary.findings)
      ) {
        generated = repaired;
        sections = repairedSections;
        missing = repairedMissing;
        weakSourceSections = repairedWeakSourceSections;
        groundingFindings = repairedGrounding;
        qualitySummary = repairedQualitySummary;
      }
    }
  }

  const sourceMap = sections.flatMap((section) => section.sources);
  const bullets = generated.summaryBullets?.length
    ? generated.summaryBullets
    : sections
        .slice(0, 5)
        .map(
          (section) => `${section.title}: ${section.content.slice(0, 140).replace(/\s+/g, " ")}...`
        );
  const qualityWarning = renderQualityWarning(qualitySummary);

  return {
    mode: input.mode,
    username: profile.username,
    language: input.language,
    rawText: generated.rawText,
    sections,
    summary: {
      bullets: bullets.length ? bullets : [`Public profile @${profile.username} was analyzed.`],
      warnings: [
        ...(missing.length ? [`Missing/weak sections: ${missing.join(", ")}`] : []),
        ...(groundingFindings.length
          ? [`Unresolved grounding flags: ${groundingFindings.length}`]
          : []),
        ...(qualityWarning ? [qualityWarning] : [])
      ],
      quality: qualitySummary,
      evidence: analysisContextDigest(analysisContext)
    },
    metrics,
    sourceMap,
    model: generated.model,
    promptVersion: generated.promptVersion,
    profile,
    posts,
    vision,
    analysisContext
  };
}

function weakSourceSectionTitles(sections: Array<{ title: string; sources: unknown[] }>): string[] {
  return sections.filter((section) => !section.sources.length).map((section) => section.title);
}

function shouldRepairSources(
  sections: Array<{ sources: unknown[] }>,
  weakSourceSections: string[]
): boolean {
  if (!sections.length) return false;
  return weakSourceSections.length > Math.ceil(sections.length / 2);
}

function reportIssueScore(
  sections: Array<{ sources: unknown[] }>,
  missingSections: string[],
  groundingFindings: GroundingFinding[] = [],
  qualityFindings: SectionQualityFinding[] = []
): number {
  const qualityPenalty = qualityFindings.reduce((sum, finding) => {
    if (finding.severity === "high") return sum + 6;
    if (finding.severity === "medium") return sum + 3;
    return sum;
  }, 0);
  return (
    missingSections.length * 10 +
    sections.filter((section) => !section.sources.length).length +
    groundingFindings.length * 5 +
    qualityPenalty
  );
}

/**
 * Deterministic grounding (always on) plus the optional LLM grounding pass when
 * the provider implements it (it gates itself on LLM_GROUNDING_CHECK). A failed
 * LLM pass degrades to the deterministic findings only.
 */
async function runGrounding(
  llm: LlmProvider,
  language: Locale,
  sections: ReportSectionView[],
  sourceCatalog: SourceCatalogEntry[]
): Promise<GroundingFinding[]> {
  const findings = runDeterministicGrounding(sections, sourceCatalog).findings;
  if (!llm.verifyGrounding) return findings;
  const llmResult = await llm
    .verifyGrounding({ language, sections, sourceCatalog })
    .catch(() => ({ findings: [] as GroundingFinding[] }));
  return [...findings, ...llmResult.findings];
}
