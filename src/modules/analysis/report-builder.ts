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
  ReportAnalysisHealth,
  ReportSource,
  ReportSectionView,
  StrategicReportView,
  VisionAnalysisItemView
} from "../reports/types.js";
import {
  contentQualityFindingsNeedRepair,
  evaluateReportContentQuality,
  renderContentQualityFindings,
  type ContentQualityRubric
} from "./content-quality.js";
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
  const analysisHealth = buildReportAnalysisHealth(metrics, vision, posts);
  const healthWarnings = analysisHealthWarnings(input.language, analysisHealth);
  let contentQualitySummary = evaluateReportContentQuality({
    sections,
    executiveSummary: buildExecutiveSummary(
      input.language,
      analysisHealth,
      summaryBulletsFor(generated, sections, input.language)
    ),
    warnings: healthWarnings,
    metrics
  });

  if (
    (missing.length ||
      shouldRepairSources(sections, weakSourceSections) ||
      groundingFindings.length ||
      qualityFindingsNeedRepair(qualitySummary.findings) ||
      contentQualityFindingsNeedRepair(contentQualitySummary.findings)) &&
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
        qualityFindings: [
          ...renderQualityFindings(qualitySummary.findings),
          ...renderContentQualityFindings(contentQualitySummary.findings)
        ]
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
      const repairedContentQualitySummary = evaluateReportContentQuality({
        sections: repairedSections,
        executiveSummary: buildExecutiveSummary(
          input.language,
          analysisHealth,
          summaryBulletsFor(repaired, repairedSections, input.language)
        ),
        warnings: healthWarnings,
        metrics
      });
      if (
        reportIssueScore(
          repairedSections,
          repairedMissing,
          repairedGrounding,
          repairedQualitySummary.findings,
          repairedContentQualitySummary
        ) <
        reportIssueScore(
          sections,
          missing,
          groundingFindings,
          qualitySummary.findings,
          contentQualitySummary
        )
      ) {
        generated = repaired;
        sections = repairedSections;
        missing = repairedMissing;
        weakSourceSections = repairedWeakSourceSections;
        groundingFindings = repairedGrounding;
        qualitySummary = repairedQualitySummary;
        contentQualitySummary = repairedContentQualitySummary;
      }
    }
  }

  const sanitizedSections = sanitizeSectionSources(sections, sourceCatalog);
  const sanitizedRawText = sanitizeRawText(generated.rawText, sourceCatalog);
  const sourceMap = sanitizedSections.flatMap((section) => section.sources);
  const bullets = sanitizeSummaryBullets(
    summaryBulletsFor(generated, sanitizedSections, input.language),
    sourceCatalog
  );
  const qualityWarning = renderQualityWarning(qualitySummary);
  const executiveSummary = buildExecutiveSummary(input.language, analysisHealth, bullets);

  return {
    mode: input.mode,
    username: profile.username,
    language: input.language,
    rawText: sanitizedRawText,
    sections: sanitizedSections,
    summary: {
      executiveSummary,
      bullets: bullets.length ? bullets : [`Public profile @${profile.username} was analyzed.`],
      warnings: [
        ...healthWarnings,
        ...(missing.length ? [`Missing/weak sections: ${missing.join(", ")}`] : []),
        ...(groundingFindings.length
          ? [`Unresolved grounding flags: ${groundingFindings.length}`]
          : []),
        ...(qualityWarning ? [qualityWarning] : [])
      ],
      analysisHealth,
      quality: qualitySummary,
      contentQuality: contentQualitySummary,
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

function sanitizeSectionSources(
  sections: ReportSectionView[],
  sourceCatalog: SourceCatalogEntry[]
): ReportSectionView[] {
  const knownUrls = sourceCatalogUrlMap(sourceCatalog);
  const knownPosts = sourceCatalogPostMap(sourceCatalog);

  return sections.map((section) => ({
    ...section,
    content: removeUnknownSourceUrls(section.content, knownUrls),
    sources: section.sources
      .map((source) => sanitizeSource(source, knownUrls, knownPosts))
      .filter((source): source is ReportSource => source != null)
  }));
}

function sanitizeRawText(rawText: string, sourceCatalog: SourceCatalogEntry[]): string {
  return removeUnknownSourceUrls(rawText, sourceCatalogUrlMap(sourceCatalog));
}

function sanitizeSummaryBullets(bullets: string[], sourceCatalog: SourceCatalogEntry[]): string[] {
  const knownUrls = sourceCatalogUrlMap(sourceCatalog);
  return bullets.map((bullet) => removeUnknownSourceUrls(bullet, knownUrls).trim()).filter(Boolean);
}

function sourceCatalogUrlMap(sourceCatalog: SourceCatalogEntry[]): Map<string, string> {
  const knownUrls = new Map<string, string>();
  for (const entry of sourceCatalog) {
    const normalized = normalizeUrl(entry.url);
    if (normalized && entry.url) knownUrls.set(normalized, entry.url);
  }
  return knownUrls;
}

function sourceCatalogPostMap(
  sourceCatalog: SourceCatalogEntry[]
): Map<string, SourceCatalogEntry> {
  const knownPosts = new Map<string, SourceCatalogEntry>();
  for (const entry of sourceCatalog) {
    if (entry.postId) knownPosts.set(entry.postId, entry);
  }
  return knownPosts;
}

function sanitizeSource(
  source: ReportSource,
  knownUrls: Map<string, string>,
  knownPosts: Map<string, SourceCatalogEntry>
): ReportSource | undefined {
  const knownPost = source.postId ? knownPosts.get(source.postId) : undefined;
  if (knownPost) {
    return {
      ...source,
      postId: source.postId,
      url: knownPost.url ?? knownUrl(source.url, knownUrls)
    };
  }

  const url = knownUrl(source.url, knownUrls);
  if (url) return { ...source, url };
  if (!source.url && !source.postId) return source;
  return undefined;
}

function removeUnknownSourceUrls(content: string, knownUrls: Map<string, string>): string {
  return content.replace(/https?:\/\/[^\s)]+/g, (url) =>
    knownUrl(url, knownUrls) ? url : "[removed unverified source]"
  );
}

function knownUrl(url: string | undefined, knownUrls: Map<string, string>): string | undefined {
  const normalized = normalizeUrl(url);
  return normalized ? knownUrls.get(normalized) : undefined;
}

function normalizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.trim().replace(/\/+$/, "");
}

function summaryBulletsFor(
  generated: { summaryBullets?: string[] },
  sections: ReportSectionView[],
  language: Locale
): string[] {
  return generated.summaryBullets?.length
    ? generated.summaryBullets.map((bullet) => cleanSummaryBullet(bullet, language))
    : sections
        .slice(0, 5)
        .map(
          (section) => `${section.title}: ${section.content.slice(0, 140).replace(/\s+/g, " ")}...`
        );
}

function buildReportAnalysisHealth(
  metrics: { analyzedPosts: number; postsCount: number },
  vision: VisionAnalysisItemView[],
  posts: Array<{ latestComments: Array<{ text: string }> }>
): ReportAnalysisHealth {
  const sampleCoveragePercent =
    metrics.postsCount > 0
      ? Math.round((metrics.analyzedPosts / metrics.postsCount) * 1000) / 10
      : undefined;
  const visionTotal = vision.length;
  const visionCompleted = vision.filter((item) => item.status === "completed").length;
  const postsWithCommentText = posts.filter((post) =>
    post.latestComments.some((comment) => comment.text.trim())
  ).length;
  const commentTextCount = posts.reduce(
    (sum, post) => sum + post.latestComments.filter((comment) => comment.text.trim()).length,
    0
  );
  return {
    formatLabel: reportFormatLabel(metrics.analyzedPosts, metrics.postsCount),
    analyzedPosts: metrics.analyzedPosts,
    postsCount: metrics.postsCount,
    sampleCoveragePercent,
    sampleCoverageLevel: sampleCoverageLevel(sampleCoveragePercent),
    visionCompleted,
    visionTotal,
    visionCompletionPercent: visionTotal
      ? Math.round((visionCompleted / visionTotal) * 1000) / 10
      : undefined,
    postsWithCommentText,
    commentCoveragePercent: metrics.analyzedPosts
      ? Math.round((postsWithCommentText / metrics.analyzedPosts) * 1000) / 10
      : undefined,
    commentTextCount
  };
}

function reportFormatLabel(analyzedPosts: number, postsCount: number): string {
  if (postsCount <= analyzedPosts) return "near-full public-post read";
  if (postsCount > 0 && analyzedPosts / postsCount >= 0.8) return "near-full public-post read";
  if (postsCount > analyzedPosts && analyzedPosts === 30) return "recent 30-post read";
  if (postsCount > analyzedPosts) return `recent ${analyzedPosts}-post read`;
  return "public-post read";
}

function sampleCoverageLevel(
  percent: number | undefined
): ReportAnalysisHealth["sampleCoverageLevel"] {
  if (percent === undefined) return "unknown";
  if (percent < 5) return "very_low";
  if (percent < 10) return "low";
  if (percent < 35) return "partial";
  if (percent < 80) return "broad";
  return "near_full";
}

function analysisHealthWarnings(language: Locale, health: ReportAnalysisHealth): string[] {
  const warnings: string[] = [];
  if (health.sampleCoverageLevel === "very_low" || health.sampleCoverageLevel === "low") {
    warnings.push(
      language === "ru"
        ? `Формат отчёта: ${health.formatLabel}; покрытие выборки ${health.sampleCoveragePercent ?? 0}% (${health.analyzedPosts}/${health.postsCount}). Выводы описывают выбранные публичные посты, а не весь профиль.`
        : `Report format: ${health.formatLabel}; sample coverage ${health.sampleCoveragePercent ?? 0}% (${health.analyzedPosts}/${health.postsCount}). Findings describe selected public posts, not the whole profile.`
    );
  }
  if (health.visionTotal > 0 && health.visionCompleted < health.visionTotal) {
    warnings.push(
      language === "ru"
        ? `Vision coverage: ${health.visionCompleted}/${health.visionTotal} визуальных элементов.`
        : `Vision coverage: ${health.visionCompleted}/${health.visionTotal} visual items.`
    );
  }
  return warnings;
}

function buildExecutiveSummary(
  language: Locale,
  health: ReportAnalysisHealth,
  bullets: string[]
): string {
  const first = bullets[0]?.replace(/\s+/g, " ").trim();
  if (language === "ru") {
    return [
      `Что это значит: это ${health.formatLabel} по публичным данным Instagram.`,
      `Покрытие: ${health.analyzedPosts}/${health.postsCount} постов (${health.sampleCoveragePercent ?? 0}%), vision ${health.visionCompleted}/${health.visionTotal}, покрытие комментариев ${health.postsWithCommentText}/${health.analyzedPosts} (${health.commentCoveragePercent ?? 0}%), текстовых комментариев: ${health.commentTextCount}.`,
      first ? `Главный сигнал: ${first}` : undefined
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    `What this means: this is a ${health.formatLabel} from public Instagram data.`,
    `Coverage: ${health.analyzedPosts}/${health.postsCount} posts (${health.sampleCoveragePercent ?? 0}%), vision ${health.visionCompleted}/${health.visionTotal}, comment coverage ${health.postsWithCommentText}/${health.analyzedPosts} (${health.commentCoveragePercent ?? 0}%), comment texts: ${health.commentTextCount}.`,
    first ? `Main signal: ${first}` : undefined
  ]
    .filter(Boolean)
    .join(" ");
}

function cleanSummaryBullet(bullet: string, language: Locale): string {
  const replacements =
    language === "ru" ? INTERNAL_SUMMARY_REPLACEMENTS_RU : INTERNAL_SUMMARY_REPLACEMENTS_EN;
  return replacements
    .reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), bullet)
    .replace(/\s+/g, " ")
    .trim();
}

const INTERNAL_SUMMARY_REPLACEMENTS_RU: Array<[RegExp, string]> = [
  [/\banalysisContext\b/g, "сводка анализа"],
  [/\bevidenceMap\b/g, "сводка источников"],
  [/\bcontentClusters\b/g, "тематические кластеры"],
  [/\bprofileSignals\b/g, "сигналы профиля"],
  [/\baudienceSignals\b/g, "сигналы аудитории"],
  [/\briskSignals\b/g, "сигналы риска"],
  [/\bopportunitySignals\b/g, "сигналы для зацепок"],
  [/\bsourceCatalog\b/g, "источники"],
  [/\bpostIds\b/g, "ID постов"],
  [/\brecurring commenters\b/gi, "повторяющиеся комментаторы"],
  [/\bstrongest signals\b/gi, "самые сильные сигналы"]
];

const INTERNAL_SUMMARY_REPLACEMENTS_EN: Array<[RegExp, string]> = [
  [/\banalysisContext\b/g, "analysis summary"],
  [/\bevidenceMap\b/g, "evidence summary"],
  [/\bcontentClusters\b/g, "content clusters"],
  [/\bprofileSignals\b/g, "profile signals"],
  [/\baudienceSignals\b/g, "audience signals"],
  [/\briskSignals\b/g, "risk signals"],
  [/\bopportunitySignals\b/g, "conversation-hook signals"],
  [/\bsourceCatalog\b/g, "sources"],
  [/\bpostIds\b/g, "posts"]
];

function weakSourceSectionTitles(sections: Array<{ title: string; sources: unknown[] }>): string[] {
  return sections.filter((section) => !section.sources.length).map((section) => section.title);
}

function shouldRepairSources(
  sections: Array<{ sources: unknown[] }>,
  weakSourceSections: string[]
): boolean {
  if (!sections.length) return false;
  return weakSourceSections.length > 0;
}

function reportIssueScore(
  sections: Array<{ sources: unknown[] }>,
  missingSections: string[],
  groundingFindings: GroundingFinding[] = [],
  qualityFindings: SectionQualityFinding[] = [],
  contentQuality?: ContentQualityRubric
): number {
  const qualityPenalty = qualityFindings.reduce((sum, finding) => {
    if (finding.severity === "high") return sum + 6;
    if (finding.severity === "medium") return sum + 3;
    return sum;
  }, 0);
  const contentQualityPenalty = contentQuality
    ? Math.ceil((100 - contentQuality.score) / 5) +
      contentQuality.findings.reduce((sum, finding) => {
        if (finding.severity === "high") return sum + 8;
        if (finding.severity === "medium") return sum + 4;
        return sum + 1;
      }, 0)
    : 0;
  return (
    missingSections.length * 10 +
    sections.filter((section) => !section.sources.length).length +
    groundingFindings.length * 5 +
    qualityPenalty +
    contentQualityPenalty
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
