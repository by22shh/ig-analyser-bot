import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";

type GoldenConfig = {
  defaults: {
    requiredSections: number;
    minSourceCoveragePercent: number;
    minVisionCompletionPercent: number;
    maxPromptLeakMatches: number;
    allowRawVisionJson: boolean;
    minQualityScore: number;
    minContentQualityScore: number;
  };
  profiles: Array<{
    username: string;
    minFetchedPosts: number;
    mustMentionAny?: string[];
    mustWarnForCoverage?: boolean;
  }>;
};

type SummaryItem = {
  username: string;
  status: string;
  fetchedPosts?: number;
  postsCount?: number;
  reportSections?: number;
  qualityScore?: number;
  contentQuality?: { score?: number };
  sourceCoverage?: string;
  warnings?: string[];
  vision?: Record<string, number>;
  qa?: {
    promptLeakMatches?: string[];
    rawVisionJsonItems?: number;
    missingSourceSections?: string[];
  };
};

const configPath = process.env.GOLDEN_EVAL_CONFIG ?? "docs/eval/golden-instagram-standard.json";
const config = JSON.parse(await readFile(configPath, "utf8")) as GoldenConfig;
const evalDir = process.argv[2] ?? process.env.EVAL_OUT_DIR ?? (await findLatestEvalDir(config));
if (!evalDir) {
  throw new Error(
    "Usage: pnpm eval-golden <eval-output-dir> (or keep a complete eval under docs/research)"
  );
}
const summary = JSON.parse(await readFile(`${evalDir}/summary.json`, "utf8")) as SummaryItem[];
const byUsername = new Map(summary.map((item) => [item.username, item]));
const failures: string[] = [];

for (const profile of config.profiles) {
  const item = byUsername.get(profile.username);
  if (!item) {
    failures.push(`${profile.username}: missing from summary`);
    continue;
  }
  if (item.status !== "completed") {
    failures.push(`${profile.username}: status=${item.status}`);
    continue;
  }
  if ((item.fetchedPosts ?? 0) < Math.min(profile.minFetchedPosts, item.postsCount ?? Infinity)) {
    failures.push(
      `${profile.username}: fetchedPosts ${item.fetchedPosts ?? 0} < ${profile.minFetchedPosts}`
    );
  }
  if ((item.reportSections ?? 0) < config.defaults.requiredSections) {
    failures.push(
      `${profile.username}: sections ${item.reportSections ?? 0} < ${config.defaults.requiredSections}`
    );
  }
  const sourceCoverage = parseSourceCoverage(item.sourceCoverage);
  if (sourceCoverage < config.defaults.minSourceCoveragePercent) {
    failures.push(
      `${profile.username}: source coverage ${sourceCoverage}% < ${config.defaults.minSourceCoveragePercent}%`
    );
  }
  const visionCompletion = parseVisionCompletion(item.vision);
  if (visionCompletion < config.defaults.minVisionCompletionPercent) {
    failures.push(
      `${profile.username}: vision completion ${visionCompletion}% < ${config.defaults.minVisionCompletionPercent}%`
    );
  }
  if ((item.qualityScore ?? 0) < config.defaults.minQualityScore) {
    failures.push(
      `${profile.username}: quality ${item.qualityScore ?? 0} < ${config.defaults.minQualityScore}`
    );
  }
  if ((item.contentQuality?.score ?? 0) < config.defaults.minContentQualityScore) {
    failures.push(
      `${profile.username}: content quality ${item.contentQuality?.score ?? 0} < ${config.defaults.minContentQualityScore}`
    );
  }
  if ((item.qa?.promptLeakMatches?.length ?? 0) > config.defaults.maxPromptLeakMatches) {
    failures.push(`${profile.username}: prompt leakage detected in summary QA`);
  }
  if (!config.defaults.allowRawVisionJson && (item.qa?.rawVisionJsonItems ?? 0) > 0) {
    failures.push(`${profile.username}: raw vision JSON detected in summary QA`);
  }
  if ((item.qa?.missingSourceSections?.length ?? 0) > 0) {
    failures.push(`${profile.username}: missing source sections ${item.qa?.missingSourceSections}`);
  }

  const rawPath = `${evalDir}/reports/${profile.username}.raw.txt`;
  const reportPath = `${evalDir}/reports/${profile.username}.report.json`;
  if (!existsSync(rawPath) || !existsSync(reportPath)) {
    failures.push(`${profile.username}: missing report artifacts`);
    continue;
  }
  const raw = await readFile(rawPath, "utf8");
  const report = JSON.parse(await readFile(reportPath, "utf8")) as {
    summary?: { warnings?: string[]; evidencePack?: unknown; repairTelemetry?: unknown };
    evidencePack?: unknown;
  };
  const rawLeaks = countMatches(
    raw,
    /\b(?:70\+|3\+\s*(?:фраз|phrases?)|evidence-tied|respectful next steps?|ready-to-send neutral phrases?|word-count|word count|min(?:imum)? words?|rubric targets?|repair instructions?)\b/giu
  );
  if (rawLeaks > config.defaults.maxPromptLeakMatches) {
    failures.push(`${profile.username}: ${rawLeaks} prompt leakage matches in raw report`);
  }
  const rawVisionJson = countMatches(
    raw,
    /"(?:visibleFacts|visualStyle|textOverlays|textVerbatim|isLikelyScreenshot|uncertainty)"\s*:/giu
  );
  if (!config.defaults.allowRawVisionJson && rawVisionJson > 0) {
    failures.push(`${profile.username}: raw vision JSON leaked into report`);
  }
  if (profile.mustMentionAny?.length && !mentionsAny(raw, profile.mustMentionAny)) {
    failures.push(`${profile.username}: raw report misses expected topic markers`);
  }
  if (
    profile.mustWarnForCoverage &&
    !(item.warnings ?? []).some((warning) => /покрыт|coverage|выборк/i.test(warning))
  ) {
    failures.push(`${profile.username}: expected top-level coverage warning`);
  }
  if (!report.evidencePack && !report.summary?.evidencePack) {
    failures.push(`${profile.username}: evidencePack missing from report artifact`);
  }
  if (!report.summary?.repairTelemetry) {
    failures.push(`${profile.username}: repairTelemetry missing from report summary`);
  }
}

if (failures.length) {
  console.error("Golden eval failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Golden eval passed for ${config.profiles.length} profiles in ${evalDir}`);

function parseSourceCoverage(value: string | undefined): number {
  const match = value?.match(/^(\d+)\/(\d+)$/);
  if (!match) return 0;
  const [, rawDone, rawTotal] = match;
  const done = Number(rawDone);
  const total = Number(rawTotal);
  return total > 0 ? Math.round((done / total) * 1000) / 10 : 0;
}

function parseVisionCompletion(vision: Record<string, number> | undefined): number {
  const entries = Object.entries(vision ?? {});
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const completed = vision?.completed ?? 0;
  return total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;
}

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function mentionsAny(value: string, markers: string[]): boolean {
  const normalized = value.toLowerCase();
  return markers.some((marker) => normalized.includes(marker.toLowerCase()));
}

async function findLatestEvalDir(config: GoldenConfig): Promise<string | undefined> {
  const root = "docs/research";
  if (!existsSync(root)) return undefined;

  const entries = await readdir(root, { withFileTypes: true });
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const dir = `${root}/${entry.name}`;
        const summaryPath = `${dir}/summary.json`;
        if (!existsSync(summaryPath)) return undefined;
        if (!config.profiles.every((profile) => hasReportArtifacts(dir, profile.username))) {
          return undefined;
        }
        const summaryStat = await stat(summaryPath);
        return { dir, mtimeMs: summaryStat.mtimeMs };
      })
  );

  return candidates
    .filter((candidate): candidate is { dir: string; mtimeMs: number } => Boolean(candidate))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.dir;
}

function hasReportArtifacts(dir: string, username: string): boolean {
  return (
    existsSync(`${dir}/reports/${username}.raw.txt`) &&
    existsSync(`${dir}/reports/${username}.report.json`)
  );
}
