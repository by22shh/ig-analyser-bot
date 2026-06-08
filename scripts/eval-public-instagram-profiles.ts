import { mkdir, writeFile } from "node:fs/promises";
import { evaluateReportContentQuality } from "../src/modules/analysis/content-quality.js";
import { buildStrategicReport } from "../src/modules/analysis/report-builder.js";
import { ApifyInstagramProfileProvider } from "../src/modules/instagram/apify.adapter.js";
import type { InstagramPost, InstagramProfile } from "../src/modules/instagram/types.js";
import { OpenRouterLlmProvider } from "../src/modules/llm/openrouter.adapter.js";

const DEFAULT_HANDLES = ["evachkaaaaa", "missstaccyy", "_daria.bers_", "fakeev", "mark.tales"];
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const OUT_DIR = process.env.EVAL_OUT_DIR ?? "docs/research/2026-06-08-instagram-profile-eval";
const PROFILE_PROVIDER = process.env.EVAL_PROFILE_PROVIDER === "apify" ? "apify" : "web";
const INSTAGRAM_APP_ID = "936619743392459";
const INSTAGRAM_ASBD_ID = "129477";

type CookieJar = Map<string, string>;

type WebProfileInfoResponse = {
  data?: {
    user?: WebUser;
  };
  message?: string;
  status?: string;
};

type WebUser = {
  username?: string;
  full_name?: string;
  biography?: string;
  bio_links?: Array<{ url?: string }>;
  external_url?: string | null;
  profile_pic_url_hd?: string;
  profile_pic_url?: string;
  is_verified?: boolean;
  is_private?: boolean;
  edge_followed_by?: { count?: number };
  edge_follow?: { count?: number };
  edge_owner_to_timeline_media?: {
    count?: number;
    edges?: Array<{ node?: WebPost }>;
  };
  edge_related_profiles?: {
    edges?: Array<{ node?: { username?: string } }>;
  };
};

type WebPost = {
  __typename?: string;
  id?: string;
  shortcode?: string;
  display_url?: string;
  thumbnail_src?: string;
  accessibility_caption?: string;
  taken_at_timestamp?: number;
  is_video?: boolean;
  video_view_count?: number;
  video_duration?: number;
  pinned_for_users?: unknown[];
  location?: { name?: string };
  edge_liked_by?: { count?: number };
  edge_media_preview_like?: { count?: number };
  edge_media_to_comment?: { count?: number };
  edge_media_to_caption?: {
    edges?: Array<{ node?: { text?: string } }>;
  };
  edge_media_to_tagged_user?: {
    edges?: Array<{ node?: { user?: { username?: string } } }>;
  };
  edge_sidecar_to_children?: {
    edges?: Array<{ node?: { id?: string; shortcode?: string } }>;
  };
};

type EvalProfileResult = {
  username: string;
  status: "completed" | "failed";
  error?: string;
  profile?: InstagramProfile;
  report?: Awaited<ReturnType<typeof buildStrategicReport>>;
};

const handles = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_HANDLES;

const jar: CookieJar = new Map();
await mkdir(`${OUT_DIR}/profiles`, { recursive: true });
await mkdir(`${OUT_DIR}/reports`, { recursive: true });

const csrfToken = PROFILE_PROVIDER === "web" ? await bootstrapInstagramSession(jar) : undefined;
const apify = PROFILE_PROVIDER === "apify" ? new ApifyInstagramProfileProvider() : undefined;
const llm = new OpenRouterLlmProvider();
const results: EvalProfileResult[] = [];

for (const username of handles) {
  console.log(`\n== ${username} ==`);
  let profile: InstagramProfile | undefined;
  try {
    profile =
      PROFILE_PROVIDER === "apify"
        ? await apify!.fetchProfile({
            username,
            postLimit: Number(process.env.EVAL_POST_LIMIT ?? 30),
            includeParentData: true
          })
        : await fetchPublicProfile(username, jar, csrfToken!);
    console.log(
      `profile: followers=${profile.followersCount}, posts=${profile.postsCount}, fetched=${profile.posts.length}`
    );
    await writeJson(`${OUT_DIR}/profiles/${username}.profile.json`, profile);

    const report = await buildStrategicReport({
      mode: "standard",
      language: "ru",
      profile,
      llm
    });
    await writeJson(`${OUT_DIR}/reports/${username}.report.json`, compactReport(report));
    await writeFile(`${OUT_DIR}/reports/${username}.raw.txt`, report.rawText, "utf8");
    results.push({ username, status: "completed", profile, report });
    console.log(
      `report: sections=${report.sections.length}, quality=${report.summary.quality?.score ?? "n/a"}, vision=${visionStatus(report.vision)}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ username, status: "failed", error: message, profile });
    console.log(`failed: ${message}`);
  }
}

await writeJson(
  `${OUT_DIR}/summary.json`,
  results.map((item) => summarizeResult(item))
);
await writeFile(`${OUT_DIR}/FINDINGS.md`, renderFindings(results), "utf8");
console.log(`\nWrote ${OUT_DIR}`);

async function bootstrapInstagramSession(jar: CookieJar): Promise<string> {
  const response = await fetchWithCookies("https://www.instagram.com/", jar, {
    headers: { "User-Agent": USER_AGENT }
  });
  if (!response.ok) throw new Error(`INSTAGRAM_BOOTSTRAP_${response.status}`);
  const csrf = jar.get("csrftoken");
  if (!csrf) throw new Error("INSTAGRAM_CSRF_MISSING");
  return csrf;
}

async function fetchPublicProfile(
  username: string,
  jar: CookieJar,
  csrfToken: string
): Promise<InstagramProfile> {
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
  const response = await fetchWithCookies(url, jar, {
    headers: {
      "User-Agent": USER_AGENT,
      "X-IG-App-ID": INSTAGRAM_APP_ID,
      "X-ASBD-ID": INSTAGRAM_ASBD_ID,
      "X-CSRFToken": csrfToken,
      Accept: "application/json",
      Referer: `https://www.instagram.com/${username}/`
    }
  });
  const payload = (await response.json()) as WebProfileInfoResponse;
  if (!response.ok)
    throw new Error(`INSTAGRAM_PROFILE_${response.status}_${payload.message ?? ""}`);
  if (!payload.data?.user) throw new Error(`INSTAGRAM_PROFILE_MISSING_${payload.status ?? ""}`);
  if (payload.data.user.is_private) throw new Error("INSTAGRAM_PROFILE_PRIVATE");
  return mapWebProfile(username, payload.data.user);
}

async function fetchWithCookies(url: string, jar: CookieJar, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = renderCookieHeader(jar);
  if (cookie) headers.set("Cookie", cookie);
  const response = await fetchWithRetry(url, { ...init, headers });
  rememberCookies(jar, response.headers);
  return response;
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("FETCH_FAILED");
}

function rememberCookies(jar: CookieJar, headers: Headers) {
  const setCookies =
    "getSetCookie" in headers && typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie")].filter((item): item is string => Boolean(item));
  for (const header of setCookies) {
    for (const match of header.matchAll(/(?:^|,\s*)(csrftoken|mid|ig_did|ig_nrcb)=([^;]+)/g)) {
      const [, key, value] = match;
      if (key && value) jar.set(key, value);
    }
  }
}

function renderCookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function mapWebProfile(username: string, user: WebUser): InstagramProfile {
  const posts = (user.edge_owner_to_timeline_media?.edges ?? [])
    .map((edge, index) => mapWebPost(edge.node, index))
    .filter((post): post is InstagramPost => Boolean(post));
  return {
    username: user.username ?? username,
    fullName: user.full_name,
    biography: user.biography,
    followersCount: numberOrZero(user.edge_followed_by?.count),
    followsCount: numberOrZero(user.edge_follow?.count),
    postsCount: numberOrZero(user.edge_owner_to_timeline_media?.count),
    profilePicUrl: user.profile_pic_url_hd ?? user.profile_pic_url,
    externalUrl: user.external_url ?? user.bio_links?.find((link) => link.url)?.url,
    isVerified: Boolean(user.is_verified),
    relatedProfiles: (user.edge_related_profiles?.edges ?? [])
      .map((edge) => edge.node?.username)
      .filter((item): item is string => Boolean(item)),
    posts,
    providerDatasetId: "instagram-web-profile-info"
  };
}

function mapWebPost(post: WebPost | undefined, index: number): InstagramPost | undefined {
  if (!post) return undefined;
  const caption = post.edge_media_to_caption?.edges?.[0]?.node?.text;
  const shortcode = post.shortcode;
  return {
    id: post.id ?? shortcode ?? `web_post_${index}`,
    type: webPostType(post),
    caption,
    hashtags: extractHashtags(caption),
    mentions: extractMentions(caption),
    likesCount: numberOrZero(post.edge_liked_by?.count ?? post.edge_media_preview_like?.count),
    commentsCount: numberOrZero(post.edge_media_to_comment?.count),
    latestComments: [],
    timestamp:
      typeof post.taken_at_timestamp === "number"
        ? new Date(post.taken_at_timestamp * 1000).toISOString()
        : undefined,
    displayUrl: post.display_url ?? post.thumbnail_src,
    url: shortcode ? `https://www.instagram.com/p/${shortcode}/` : undefined,
    videoViewCount: numberOrUndefined(post.video_view_count),
    videoDuration: numberOrUndefined(post.video_duration),
    location: post.location?.name ? post.location : undefined,
    isPinned: Boolean(post.pinned_for_users?.length),
    productType: post.is_video ? "video" : "feed",
    childPosts: (post.edge_sidecar_to_children?.edges ?? [])
      .map((edge) => edge.node?.shortcode ?? edge.node?.id)
      .filter((item): item is string => Boolean(item)),
    taggedUsers: (post.edge_media_to_tagged_user?.edges ?? [])
      .map((edge) => edge.node?.user?.username)
      .filter((item): item is string => Boolean(item))
  };
}

function webPostType(post: WebPost): string {
  if (post.__typename === "GraphSidecar") return "Carousel";
  if (post.__typename === "GraphVideo" || post.is_video) return "Video";
  return "Image";
}

function extractHashtags(value: string | undefined): string[] {
  return unique((value?.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((tag) => tag.slice(1).toLowerCase()));
}

function extractMentions(value: string | undefined): string[] {
  return unique(
    (value?.match(/@[A-Za-z0-9._]{2,32}/g) ?? []).map((tag) => tag.slice(1).toLowerCase())
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function compactReport(report: Awaited<ReturnType<typeof buildStrategicReport>>) {
  return {
    mode: report.mode,
    username: report.username,
    language: report.language,
    model: report.model,
    promptVersion: report.promptVersion,
    sections: report.sections,
    summary: report.summary,
    metrics: report.metrics,
    contentQuality: reportContentQuality(report),
    sourceMap: report.sourceMap,
    posts: report.posts.map((post) => ({
      id: post.id,
      type: post.type,
      timestamp: post.timestamp,
      url: post.url,
      caption: post.caption,
      likesCount: post.likesCount,
      commentsCount: post.commentsCount,
      hashtags: post.hashtags,
      mentions: post.mentions,
      isPinned: post.isPinned,
      taggedUsers: post.taggedUsers
    })),
    vision: report.vision,
    analysisContext: report.analysisContext
  };
}

function summarizeResult(item: EvalProfileResult) {
  if (item.status === "failed") {
    return {
      username: item.username,
      status: item.status,
      error: item.error,
      ...(item.profile
        ? {
            followersCount: item.profile.followersCount,
            followsCount: item.profile.followsCount,
            postsCount: item.profile.postsCount,
            fetchedPosts: item.profile.posts.length
          }
        : {})
    };
  }
  const report = item.report;
  const profile = item.profile;
  if (!report || !profile)
    return { username: item.username, status: "failed", error: "missing result" };
  return {
    username: item.username,
    status: item.status,
    followersCount: profile.followersCount,
    followsCount: profile.followsCount,
    postsCount: profile.postsCount,
    fetchedPosts: profile.posts.length,
    reportSections: report.sections.length,
    requiredSections: 17,
    qualityScore: report.summary.quality?.score,
    qualityFindings: report.summary.quality?.findings.length,
    contentQuality: reportContentQuality(report),
    sourceCoverage: `${report.sections.filter((section) => section.sources.length).length}/${report.sections.length}`,
    warnings: report.summary.warnings,
    metrics: report.metrics,
    vision: countVision(report.vision)
  };
}

function reportContentQuality(report: Awaited<ReturnType<typeof buildStrategicReport>>) {
  return evaluateReportContentQuality({
    sections: report.sections,
    executiveSummary: report.summary.executiveSummary,
    warnings: report.summary.warnings,
    metrics: report.metrics
  });
}

function countVision(vision: Array<{ status: string }>): Record<string, number> {
  return vision.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
}

function visionStatus(vision: Array<{ status: string }>): string {
  const counts = countVision(vision);
  return Object.entries(counts)
    .map(([key, value]) => `${key}:${value}`)
    .join(", ");
}

function renderFindings(results: EvalProfileResult[]): string {
  const completed = results.filter((item) => item.status === "completed");
  const rows = completed.map((item) => {
    const profile = item.profile!;
    const report = item.report!;
    const sourced = report.sections.filter((section) => section.sources.length).length;
    const contentQuality = reportContentQuality(report);
    return [
      profile.username,
      profile.followersCount,
      profile.postsCount,
      profile.posts.length,
      report.metrics.engagementRate.toFixed(2),
      visionStatus(report.vision) || "none",
      report.sections.length,
      `${sourced}/${report.sections.length}`,
      report.summary.quality?.score ?? "n/a",
      contentQuality.score,
      report.summary.warnings.join(" | ") || "none"
    ];
  });

  return `# Instagram Profile Eval

Date: 2026-06-08

Provider path used: ${
    PROFILE_PROVIDER === "apify"
      ? "Apify apify~instagram-scraper"
      : "public Instagram web_profile_info endpoint"
  } for profile/post input, then current project buildStrategicReport pipeline with OpenRouter vision/reasoning, deterministic grounding, quality evaluation, and repair when triggered.

Important limitation: ${
    PROFILE_PROVIDER === "apify"
      ? "this run uses APIFY_TOKEN from the environment and exercises production-like ingestion."
      : "APIFY_TOKEN is not present locally. In local non-production service mode this would select MockInstagramProfileProvider; production mode should fail configuration validation instead of silently using mock credentials. This eval isolates the analysis/report algorithm from that missing production ingestion credential."
  }

| Profile | Followers | IG posts | Fetched posts | Engagement % | Vision | Sections | Source coverage | Quality | Content quality | Warnings |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---|
${rows.map((row) => `| ${row.join(" | ")} |`).join("\n")}

Failed profiles:
${
  results
    .filter((item) => item.status === "failed")
    .map((item) => {
      const profileNote = item.profile
        ? ` (profile fetched: followers=${item.profile.followersCount}, posts=${item.profile.postsCount}, fetched=${item.profile.posts.length})`
        : "";
      return `- ${item.username}: ${item.error}${profileNote}`;
    })
    .join("\n") || "- none"
}
`;
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
