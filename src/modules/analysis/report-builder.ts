import type { AnalysisMode, Locale } from "../../telegram/constants.js";
import type { InstagramProfile } from "../instagram/types.js";
import type { LlmProvider } from "../llm/types.js";
import { computeReportMetrics } from "../reports/metrics.js";
import { parseReportSections, validateRequiredSections } from "../reports/parser.js";
import type { StrategicReportView } from "../reports/types.js";

export async function buildStrategicReport(input: {
  mode: AnalysisMode;
  language: Locale;
  profile: InstagramProfile;
  llm: LlmProvider;
  targetPosition?: string;
  goal?: string;
}): Promise<StrategicReportView> {
  const posts = input.profile.posts;
  const vision = await input.llm.analyzeVision({ profile: input.profile, posts });
  const generated = await input.llm.generateReport({
    mode: input.mode,
    language: input.language,
    profile: input.profile,
    posts,
    vision,
    targetPosition: input.targetPosition,
    goal: input.goal
  });
  const sections = parseReportSections(generated.rawText, input.mode);
  const missing = validateRequiredSections(input.mode, sections);
  const metrics = computeReportMetrics(input.profile, posts);
  const sourceMap = sections.flatMap((section) => section.sources);
  const bullets = sections
    .slice(0, 5)
    .map((section) => `${section.title}: ${section.content.slice(0, 140).replace(/\s+/g, " ")}...`);

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
