import type { AnalysisMode, Locale } from "../../telegram/constants.js";
import type { InstagramProfile } from "../instagram/types.js";
import type { LlmProvider } from "../llm/types.js";
import { computeReportMetrics } from "../reports/metrics.js";
import { parseReportSections, validateRequiredSections } from "../reports/parser.js";
import type { StrategicReportView, VisionAnalysisItemView } from "../reports/types.js";

export async function buildStrategicReport(input: {
  mode: AnalysisMode;
  language: Locale;
  profile: InstagramProfile;
  llm: LlmProvider;
  targetPosition?: string;
  goal?: string;
  vision?: VisionAnalysisItemView[];
}): Promise<StrategicReportView> {
  const posts = input.profile.posts;
  const vision = input.vision ?? (await input.llm.analyzeVision({ profile: input.profile, posts }));
  const metrics = computeReportMetrics(input.profile, posts);
  let generated = await input.llm.generateReport({
    mode: input.mode,
    language: input.language,
    profile: input.profile,
    posts,
    vision,
    metrics,
    targetPosition: input.targetPosition,
    goal: input.goal
  });
  let sections = parseReportSections(generated.rawText, input.mode);
  let missing = validateRequiredSections(input.mode, sections);
  const weakSourceSections = weakSourceSectionTitles(sections);

  if (
    (missing.length || shouldRepairSources(sections, weakSourceSections)) &&
    input.llm.repairReport
  ) {
    const repaired = await input.llm
      .repairReport({
        mode: input.mode,
        language: input.language,
        profile: input.profile,
        posts,
        vision,
        metrics,
        targetPosition: input.targetPosition,
        goal: input.goal,
        rawText: generated.rawText,
        missingSections: missing,
        weakSourceSections
      })
      .catch(() => undefined);
    if (repaired) {
      const repairedSections = parseReportSections(repaired.rawText, input.mode);
      const repairedMissing = validateRequiredSections(input.mode, repairedSections);
      if (
        reportIssueScore(repairedSections, repairedMissing) < reportIssueScore(sections, missing)
      ) {
        generated = repaired;
        sections = repairedSections;
        missing = repairedMissing;
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

  return {
    mode: input.mode,
    username: input.profile.username,
    language: input.language,
    rawText: generated.rawText,
    sections,
    summary: {
      bullets: bullets.length
        ? bullets
        : [`Public profile @${input.profile.username} was analyzed.`],
      warnings: missing.length ? [`Missing/weak sections: ${missing.join(", ")}`] : []
    },
    metrics,
    sourceMap,
    model: generated.model,
    promptVersion: generated.promptVersion,
    profile: input.profile,
    posts,
    vision
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
  missingSections: string[]
): number {
  return missingSections.length * 10 + sections.filter((section) => !section.sources.length).length;
}
