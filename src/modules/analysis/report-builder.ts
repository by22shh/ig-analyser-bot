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
  ReportDeliveryHealth,
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

const DELIVERY_MIN_QUALITY_SCORE = 80;
const DELIVERY_MIN_CONTENT_QUALITY_SCORE = 85;

type FinalReportCandidate = {
  rawText: string;
  sections: ReportSectionView[];
  sourceMap: ReportSource[];
  bullets: string[];
  executiveSummary: string;
  quality: ReturnType<typeof evaluateReportQuality>;
  contentQuality: ContentQualityRubric;
  missing: string[];
  groundingFindings: GroundingFinding[];
  deliveryGate: DeliveryGate;
};

type DeliveryGate = {
  passed: boolean;
  hardBlockers: boolean;
  reasons: string[];
  targetSectionTitles: string[];
  sourceCoverage: string;
};

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

  let finalCandidate = finalizeReportCandidate({
    generated,
    sections,
    mode: input.mode,
    language: input.language,
    username: profile.username,
    sourceCatalog,
    analysisHealth,
    healthWarnings,
    metrics,
    analysisContext
  });

  let targetedRepairAttempted = false;
  if (!finalCandidate.deliveryGate.passed && input.llm.repairReport) {
    targetedRepairAttempted = true;
    const targeted = await input.llm
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
        rawText: finalCandidate.rawText,
        missingSections: finalCandidate.missing,
        weakSourceSections: weakSourceSectionTitles(finalCandidate.sections),
        repairMode: "targeted",
        targetSectionTitles: finalCandidate.deliveryGate.targetSectionTitles,
        shipGateReasons: finalCandidate.deliveryGate.reasons,
        groundingFindings: renderGroundingFindings(finalCandidate.groundingFindings),
        qualityFindings: [
          ...renderQualityFindings(finalCandidate.quality.findings),
          ...renderContentQualityFindings(finalCandidate.contentQuality.findings),
          ...renderDeliveryGateFindings(finalCandidate.deliveryGate, input.language)
        ]
      })
      .catch(() => undefined);
    if (targeted) {
      const targetedSections = parseReportSections(targeted.rawText, input.mode);
      const targetedCandidate = finalizeReportCandidate({
        generated: targeted,
        sections: targetedSections,
        mode: input.mode,
        language: input.language,
        username: profile.username,
        sourceCatalog,
        analysisHealth,
        healthWarnings,
        metrics,
        analysisContext
      });
      if (deliveryIssueScore(targetedCandidate) < deliveryIssueScore(finalCandidate)) {
        generated = targeted;
        finalCandidate = targetedCandidate;
      }
    }
  }

  const qualityWarning = renderQualityWarning(finalCandidate.quality);
  const contentQualityWarning = renderContentQualityWarning(finalCandidate.contentQuality);
  const deliveryHealth = buildDeliveryHealth(
    finalCandidate.deliveryGate,
    finalCandidate.quality,
    finalCandidate.contentQuality,
    targetedRepairAttempted,
    Boolean(input.llm.repairReport)
  );
  const deliveryWarning = renderDeliveryHealthWarning(deliveryHealth, input.language);

  return {
    mode: input.mode,
    username: profile.username,
    language: input.language,
    rawText: finalCandidate.rawText,
    sections: finalCandidate.sections,
    summary: {
      executiveSummary: finalCandidate.executiveSummary,
      bullets: finalCandidate.bullets.length
        ? finalCandidate.bullets
        : [`Public profile @${profile.username} was analyzed.`],
      warnings: [
        ...healthWarnings,
        ...(finalCandidate.missing.length
          ? [`Missing/weak sections: ${finalCandidate.missing.join(", ")}`]
          : []),
        ...(finalCandidate.groundingFindings.length
          ? [`Unresolved grounding flags: ${finalCandidate.groundingFindings.length}`]
          : []),
        ...(qualityWarning ? [qualityWarning] : []),
        ...(contentQualityWarning ? [contentQualityWarning] : []),
        ...(deliveryWarning ? [deliveryWarning] : [])
      ],
      analysisHealth,
      deliveryHealth,
      quality: finalCandidate.quality,
      contentQuality: finalCandidate.contentQuality,
      evidence: analysisContextDigest(analysisContext)
    },
    metrics,
    sourceMap: finalCandidate.sourceMap,
    model: generated.model,
    promptVersion: generated.promptVersion,
    profile,
    posts,
    vision,
    analysisContext
  };
}

function finalizeReportCandidate(input: {
  generated: { rawText: string; summaryBullets?: string[] };
  sections: ReportSectionView[];
  mode: AnalysisMode;
  language: Locale;
  username: string;
  sourceCatalog: SourceCatalogEntry[];
  analysisHealth: ReportAnalysisHealth;
  healthWarnings: string[];
  metrics: Parameters<typeof evaluateReportQuality>[0]["metrics"];
  analysisContext: Parameters<typeof evaluateReportQuality>[0]["analysisContext"];
}): FinalReportCandidate {
  const sanitizedSections = sanitizeSectionSources(input.sections, input.sourceCatalog);
  const finalSectionsResult = finalizeUserFacingSections({
    sections: sanitizedSections,
    sourceCatalog: input.sourceCatalog,
    username: input.username,
    language: input.language,
    analysisHealth: input.analysisHealth
  });
  const sections = finalSectionsResult.sections;
  const sanitizedRawText = sanitizeUserFacingText(
    sanitizeRawText(input.generated.rawText, input.sourceCatalog),
    input.language
  );
  const rawText = finalSectionsResult.changed ? renderSectionsRawText(sections) : sanitizedRawText;
  const sourceMap = sections.flatMap((section) => section.sources);
  const bullets = sanitizeSummaryBullets(
    summaryBulletsFor(input.generated, sections, input.language),
    input.sourceCatalog
  );
  const executiveSummary = buildExecutiveSummary(input.language, input.analysisHealth, bullets);
  const quality = evaluateReportQuality({
    mode: input.mode,
    sections,
    metrics: input.metrics,
    analysisContext: input.analysisContext
  });
  const contentQuality = evaluateReportContentQuality({
    sections,
    executiveSummary,
    warnings: input.healthWarnings,
    metrics: input.metrics
  });
  const missing = validateRequiredSections(input.mode, sections);
  const groundingFindings = runDeterministicGrounding(sections, input.sourceCatalog).findings;
  const deliveryGate = evaluateDeliveryGate({
    sections,
    missing,
    groundingFindings,
    quality,
    contentQuality
  });
  return {
    rawText,
    sections,
    sourceMap,
    bullets,
    executiveSummary,
    quality,
    contentQuality,
    missing,
    groundingFindings,
    deliveryGate
  };
}

function evaluateDeliveryGate(input: {
  sections: ReportSectionView[];
  missing: string[];
  groundingFindings: GroundingFinding[];
  quality: ReturnType<typeof evaluateReportQuality>;
  contentQuality: ContentQualityRubric;
}): DeliveryGate {
  const reasons: string[] = [];
  const targetSectionTitles = new Set<string>();
  const sourcedCount = input.sections.filter((section) => section.sources.length).length;
  const sourceCoverage = `${sourcedCount}/${input.sections.length}`;
  const sourceCoverageIncomplete = sourcedCount < input.sections.length;
  const highFindings = [
    ...input.quality.findings.filter((finding) => finding.severity === "high"),
    ...input.contentQuality.findings.filter((finding) => finding.severity === "high")
  ];

  for (const title of input.missing) targetSectionTitles.add(title);
  for (const title of weakSourceSectionTitles(input.sections)) targetSectionTitles.add(title);
  for (const finding of input.quality.findings) {
    if (finding.title) targetSectionTitles.add(finding.title);
  }
  for (const title of contentQualityTargetSections(input.contentQuality, input.sections)) {
    targetSectionTitles.add(title);
  }

  if (input.missing.length) reasons.push(`missing_sections:${input.missing.join(", ")}`);
  if (sourceCoverageIncomplete) reasons.push(`source_coverage:${sourceCoverage}`);
  if (input.groundingFindings.length) reasons.push(`grounding:${input.groundingFindings.length}`);
  if (input.quality.score < DELIVERY_MIN_QUALITY_SCORE) {
    reasons.push(`quality_score:${input.quality.score}<${DELIVERY_MIN_QUALITY_SCORE}`);
  }
  if (input.contentQuality.score < DELIVERY_MIN_CONTENT_QUALITY_SCORE) {
    reasons.push(
      `content_quality_score:${input.contentQuality.score}<${DELIVERY_MIN_CONTENT_QUALITY_SCORE}`
    );
  }
  if (highFindings.length) reasons.push(`high_findings:${highFindings.length}`);

  const hardBlockers =
    input.missing.length > 0 ||
    sourceCoverageIncomplete ||
    input.groundingFindings.length > 0 ||
    highFindings.length > 0 ||
    input.quality.score < DELIVERY_MIN_QUALITY_SCORE;

  return {
    passed: reasons.length === 0,
    hardBlockers,
    reasons,
    targetSectionTitles: [...targetSectionTitles],
    sourceCoverage
  };
}

function buildDeliveryHealth(
  gate: DeliveryGate,
  quality: ReturnType<typeof evaluateReportQuality>,
  contentQuality: ContentQualityRubric,
  targetedRepairAttempted: boolean,
  repairAvailable: boolean
): ReportDeliveryHealth {
  let status: ReportDeliveryHealth["status"];
  if (gate.passed) {
    status = "ready";
  } else if (!targetedRepairAttempted && repairAvailable) {
    status = "needs_repair";
  } else if (gate.hardBlockers) {
    status = "failed_quality";
  } else {
    status = "limited";
  }
  return {
    status,
    reasons: gate.reasons,
    qualityScore: quality.score,
    contentQualityScore: contentQuality.score,
    sourceCoverage: gate.sourceCoverage,
    repaired: targetedRepairAttempted
  };
}

function renderDeliveryHealthWarning(
  health: ReportDeliveryHealth,
  language: Locale
): string | undefined {
  if (health.status === "ready") return undefined;
  const label =
    language === "ru"
      ? `Статус качества отчёта: ${health.status}`
      : `Report delivery health: ${health.status}`;
  return `${label}; quality=${health.qualityScore}, content=${health.contentQualityScore}, sources=${health.sourceCoverage}`;
}

function renderDeliveryGateFindings(gate: DeliveryGate, language: Locale): string[] {
  if (!gate.reasons.length) return [];
  const target =
    gate.targetSectionTitles.length > 0
      ? gate.targetSectionTitles.join(", ")
      : language === "ru"
        ? "только проблемные секции"
        : "only flagged sections";
  const practicalInstruction =
    language === "ru"
      ? "Для практических секций добавь 2-3 сценария, конкретный первый шаг, что написать, что не писать, почему зацепка безопасна, и как понять, что контакт не стоит продолжать."
      : "For practical sections add 2-3 scenarios, a concrete first step, what to write, what not to write, why the hook is safe, and how to know not to continue contact.";
  return [
    `SHIP_GATE failed: ${gate.reasons.join("; ")}`,
    `TARGETED_REPAIR_ONLY_SECTIONS: ${target}`,
    practicalInstruction
  ];
}

function deliveryIssueScore(candidate: FinalReportCandidate): number {
  const gatePenalty = candidate.deliveryGate.reasons.length * 12;
  const hardPenalty = candidate.deliveryGate.hardBlockers ? 50 : 0;
  const groundingPenalty = candidate.groundingFindings.length * 8;
  const missingPenalty = candidate.missing.length * 20;
  const sourcePenalty = candidate.sections.filter((section) => !section.sources.length).length * 20;
  return (
    gatePenalty +
    hardPenalty +
    groundingPenalty +
    missingPenalty +
    sourcePenalty +
    Math.max(0, DELIVERY_MIN_QUALITY_SCORE - candidate.quality.score) +
    Math.max(0, DELIVERY_MIN_CONTENT_QUALITY_SCORE - candidate.contentQuality.score)
  );
}

function contentQualityTargetSections(
  contentQuality: ContentQualityRubric,
  sections: ReportSectionView[]
): string[] {
  const targets = new Set<string>();
  const practicalTitles = sections.filter((section) => practicalSectionTitle(section.title));
  for (const finding of contentQuality.findings) {
    for (const section of sections) {
      if (finding.detail.includes(section.title)) targets.add(section.title);
    }
    if (
      finding.id === "content:weak_practical_detail" ||
      finding.id === "content:low_practical_value"
    ) {
      for (const section of practicalTitles) targets.add(section.title);
    }
  }
  return [...targets];
}

function practicalSectionTitle(title: string): boolean {
  return /потенциальная польза|триггеры|зацепки|коммуникационные рекомендации|готовые фразы|общая оценка|potential value|triggers|hooks|communication recommendations|ready phrases|overall profile value/i.test(
    title
  );
}

function finalizeUserFacingSections(input: {
  sections: ReportSectionView[];
  sourceCatalog: SourceCatalogEntry[];
  username: string;
  language: Locale;
  analysisHealth: ReportAnalysisHealth;
}): { sections: ReportSectionView[]; changed: boolean } {
  const profileSource = input.sourceCatalog.find((entry) =>
    normalizeUrl(entry.url)?.endsWith(`instagram.com/${input.username}`)
  );
  let changed = false;
  const sections = input.sections.map((section) => {
    const cleanedContent = sanitizeUserFacingText(section.content, input.language);
    const cleanedSources = section.sources.map((source) => ({
      ...source,
      label: sanitizeUserFacingText(source.label, input.language)
    }));
    let content = applyLowEvidenceTemplate(section.title, cleanedContent, input);
    let sources = cleanedSources;
    if (!sources.length && profileSource?.url) {
      sources = [
        {
          url: profileSource.url,
          label:
            input.language === "ru"
              ? "Публичный профиль и выбранная публичная выборка"
              : "Public profile and selected public sample"
        }
      ];
      content = appendProfileEvidence(content, profileSource.url, input.language);
    }
    if (
      content !== section.content ||
      sources.length !== section.sources.length ||
      sources.some((source, index) => source.label !== section.sources[index]?.label)
    ) {
      changed = true;
    }
    return {
      ...section,
      content,
      sources
    };
  });
  return { sections, changed };
}

function appendProfileEvidence(content: string, profileUrl: string, language: Locale): string {
  if (content.includes(profileUrl)) return content;
  const evidenceLabel =
    language === "ru"
      ? "Публичный профиль и выбранная публичная выборка"
      : "Public profile and selected public sample";
  return `${content.trim()}\n\nEvidence:\n- ${evidenceLabel}: ${profileUrl}`.trim();
}

function applyLowEvidenceTemplate(
  title: string,
  content: string,
  input: {
    language: Locale;
    analysisHealth: ReportAnalysisHealth;
  }
): string {
  if (input.language !== "ru") return content;
  const normalizedTitle = title.toLowerCase();
  const lowEvidence =
    /нет|не обнаруж|недостаточ|не видно|не позволяет|insufficient|no direct|no profession/iu.test(
      content
    );
  if (/профессия и статус/.test(normalizedTitle) && lowEvidence) {
    return [
      "По публичному профилю и выбранной выборке прямых признаков профессии, должности или рабочего статуса не видно.",
      "Это не доказывает их отсутствие; это только ограничивает вывод по открытым данным.",
      "Практический вывод: не строить обращение вокруг работы, дохода или статуса, пока нет отдельного публичного подтверждения.",
      "Безопасный следующий шаг: использовать нейтральную тему из конкретного поста, а не предполагать профессию.",
      `Ограничение: проанализировано ${input.analysisHealth.analyzedPosts}/${input.analysisHealth.postsCount} публичных постов, сторис и личные ответы не видны.`,
      "Confidence: low"
    ].join(" ");
  }
  if (/ошибки|слепые зоны|барьеры/.test(normalizedTitle)) {
    const mentionsLimits = /сторис|директ|direct|личн|нет данных|огранич|выборк|готовност/iu.test(
      content
    );
    if (mentionsLimits && (content.length < 360 || !/\nEvidence\s*:/iu.test(content))) {
      return [
        "Главные ограничения анализа: сторис, архив, личные ответы и реакции в Direct недоступны, поэтому отчет описывает только выбранные публичные посты.",
        `Покрытие выборки: ${input.analysisHealth.analyzedPosts}/${input.analysisHealth.postsCount} постов (${input.analysisHealth.sampleCoveragePercent ?? 0}%).`,
        "Это не доказывает отсутствие интересов, контактов или готовности к диалогу; это только снижает уверенность выводов.",
        "Практический барьер: если в био нет публичных контактов или явного CTA, контакт лучше начинать с одного нейтрального комментария по посту и не продолжать без ответа.",
        "Что не делать: не делать выводы о личной жизни, статусе, доходе или намерениях по косвенным визуальным деталям.",
        "Confidence: medium"
      ].join(" ");
    }
  }
  return content;
}

function renderSectionsRawText(sections: ReportSectionView[]): string {
  return sections
    .map((section) => {
      const content = section.content.trim();
      const evidence =
        section.sources.length && !/\nEvidence\s*:/iu.test(content)
          ? `\n\nEvidence:\n${section.sources.map(renderSourceLine).join("\n")}`
          : "";
      return `[[SECTION]]\n${section.title}\n${content}${evidence}`;
    })
    .join("\n\n");
}

function renderSourceLine(source: ReportSource): string {
  const ref = source.postId ? `[${source.postId}] ` : "";
  const url = source.url ? ` ${source.url}` : "";
  return `- ${ref}${source.label}${url}`.trimEnd();
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

function renderContentQualityWarning(summary: ContentQualityRubric): string | undefined {
  const important = summary.findings.filter((finding) => finding.severity !== "low");
  if (!important.length && summary.score >= 85) return undefined;
  return `Content quality flags: score ${summary.score}/100, ${important.length} medium/high findings`;
}

function sanitizeUserFacingText(
  value: string,
  language: Locale,
  options: { compact?: boolean } = {}
): string {
  const replacements =
    language === "ru" ? INTERNAL_SUMMARY_REPLACEMENTS_RU : INTERNAL_SUMMARY_REPLACEMENTS_EN;
  const cleaned = replacements.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value
  );
  if (options.compact) return cleaned.replace(/\s+/g, " ").trim();
  return cleaned
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanSummaryBullet(bullet: string, language: Locale): string {
  return sanitizeUserFacingText(bullet, language, { compact: true });
}

const INTERNAL_SUMMARY_REPLACEMENTS_RU: Array<[RegExp, string]> = [
  [
    /No profession hints in profileSignals or selected posts/giu,
    "В публичных данных профиля и выбранных постах нет прямых указаний на профессию"
  ],
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
  [
    /No profession hints in profileSignals or selected posts/giu,
    "No direct profession hints in the public profile data or selected posts"
  ],
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
