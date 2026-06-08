import { env } from "../../config/env.js";
import type {
  FetchInstagramProfileInput,
  InstagramPost,
  InstagramProfile,
  InstagramProfileProvider
} from "./types.js";

type ApifyRun = { id: string; status: string; defaultDatasetId?: string };

export class MockInstagramProfileProvider implements InstagramProfileProvider {
  async fetchProfile(input: FetchInstagramProfileInput): Promise<InstagramProfile> {
    const now = Date.now();
    const posts: InstagramPost[] = Array.from(
      { length: Math.min(input.postLimit, 8) },
      (_, index) => ({
        id: `mock_${index + 1}`,
        type: index % 3 === 0 ? "Carousel" : "Image",
        caption: [
          "Building something useful with a small team and a lot of focus.",
          "Travel notes, coffee, and a quiet reminder that consistency wins.",
          "Client work, behind the scenes, and lessons from a launch."
        ][index % 3],
        hashtags: ["growth", "work", "public"].slice(0, (index % 3) + 1),
        mentions: index % 2 === 0 ? ["partner_account"] : [],
        likesCount: 250 + index * 37,
        commentsCount: 12 + index * 3,
        latestComments: [
          { ownerUsername: "friend_one", text: "Great work" },
          { ownerUsername: "partner_account", text: "This was a strong collaboration" }
        ],
        timestamp: new Date(now - index * 86400000 * 3).toISOString(),
        displayUrl: "https://example.com/mock-image.jpg",
        url: `https://www.instagram.com/p/mock${index + 1}/`,
        location: index % 2 === 0 ? { name: "Dubai" } : undefined,
        isPinned: index === 0,
        productType: "feed",
        musicInfo:
          index % 2 === 1 ? { songName: "Quiet Drive", artistName: "Mock Artist" } : undefined,
        childPosts: [],
        taggedUsers: index % 2 === 0 ? ["friend_one"] : []
      })
    );

    return {
      username: input.username,
      fullName: "Mock Public Profile",
      biography: "Founder, builder, public profile used for local tests.",
      followersCount: 14502,
      followsCount: 812,
      postsCount: 124,
      profilePicUrl: "https://example.com/avatar.jpg",
      externalUrl: "https://example.com",
      isVerified: false,
      relatedProfiles: ["partner_account", "friend_one"],
      posts,
      providerDatasetId: "mock-dataset"
    };
  }
}

export class ApifyInstagramProfileProvider implements InstagramProfileProvider {
  constructor(private readonly token = env.APIFY_TOKEN) {}

  async fetchProfile(input: FetchInstagramProfileInput): Promise<InstagramProfile> {
    if (!this.token) throw new Error("APIFY_TOKEN_MISSING");
    const actorInput = {
      directUrls: [`https://www.instagram.com/${input.username}`],
      resultsLimit: Math.max(1, input.postLimit),
      resultsType: "posts",
      searchType: "user",
      enhanceUserSearchWithFacebookPage: false,
      isUserReelFeedURL: false,
      addParentData: input.includeParentData,
      isUserTaggedFeedURL: false
    };
    const run = await this.startRun(actorInput);
    const finished = await this.pollRun(run.id);
    if (!finished.defaultDatasetId) throw new Error("APIFY_DATASET_MISSING");
    const items = await this.fetchDataset(finished.defaultDatasetId);
    return mapApifyItems(input.username, items, input.postLimit, finished.defaultDatasetId);
  }

  private async startRun(actorInput: unknown): Promise<ApifyRun> {
    const response = await fetch("https://api.apify.com/v2/acts/apify~instagram-scraper/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`
      },
      body: JSON.stringify(actorInput),
      signal: AbortSignal.timeout(30000)
    });
    if (response.status === 401) throw new Error("APIFY_INVALID_TOKEN");
    if (response.status === 402) throw new Error("APIFY_CREDITS_EXHAUSTED");
    if (!response.ok) throw new Error(`APIFY_START_FAILED_${response.status}`);
    const payload = (await response.json()) as { data: ApifyRun };
    return payload.data;
  }

  private async pollRun(runId: string): Promise<ApifyRun> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const response = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error(`APIFY_POLL_FAILED_${response.status}`);
      const payload = (await response.json()) as { data: ApifyRun };
      if (["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(payload.data.status)) {
        if (payload.data.status !== "SUCCEEDED") throw new Error(`APIFY_${payload.data.status}`);
        return payload.data;
      }
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    throw new Error("APIFY_TIMEOUT");
  }

  private async fetchDataset(datasetId: string): Promise<unknown[]> {
    const response = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true`,
      {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(30000)
      }
    );
    if (!response.ok) throw new Error(`APIFY_DATASET_FAILED_${response.status}`);
    return (await response.json()) as unknown[];
  }
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

// The real apify~instagram-scraper returns taggedUsers / relatedProfiles /
// mentions as either bare strings or objects ({ username, ... }). Accept both so
// the Digital Circle and related-profile metrics populate on real data.
function usernameArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const usernames = value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return str(record.username ?? record.ownerUsername ?? record.fullName ?? record.full_name);
      }
      return undefined;
    })
    .filter((item): item is string => typeof item === "string" && item.length > 0);
  return [...new Set(usernames)];
}

// childPosts arrive as strings or objects ({ id, shortCode }); keep their ids.
function idArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return str(record.id ?? record.shortCode ?? record.code);
      }
      return undefined;
    })
    .filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function mapApifyItems(
  username: string,
  items: unknown[],
  postLimit: number,
  datasetId?: string
): InstagramProfile {
  if (!items.length) throw new Error("PROFILE_NOT_FOUND_OR_PRIVATE");
  const records = items as Array<Record<string, unknown>>;
  const first = records[0] ?? {};
  const profileSource =
    record(first.dataSource) ?? record(first.owner) ?? record(first.ownerData) ?? first;
  const owner = str(
    first.ownerUsername ?? first.username ?? profileSource.ownerUsername ?? profileSource.username
  );
  if (owner && owner.toLowerCase() !== username.toLowerCase()) {
    throw new Error("IDENTITY_MISMATCH");
  }
  const posts = records
    .map((item, index): InstagramPost => {
      const comments = Array.isArray(item.latestComments)
        ? (item.latestComments as Array<Record<string, unknown>>).slice(0, 5).map((comment) => ({
            ownerUsername: str(comment.ownerUsername ?? comment.owner),
            text: str(comment.text) ?? "",
            timestamp: str(comment.timestamp)
          }))
        : [];
      return {
        id: str(item.id ?? item.shortCode) ?? `post_${index}`,
        type: str(item.type) ?? "Image",
        caption: str(item.caption),
        hashtags: stringArray(item.hashtags),
        mentions: usernameArray(item.mentions),
        likesCount: num(item.likesCount),
        commentsCount: num(item.commentsCount),
        latestComments: comments,
        timestamp: str(item.timestamp),
        displayUrl: str(item.displayUrl ?? item.imageUrl),
        url: str(item.url),
        videoViewCount: num(item.videoViewCount) || undefined,
        videoDuration: num(item.videoDuration) || undefined,
        location:
          item.location && typeof item.location === "object"
            ? (item.location as Record<string, unknown>)
            : undefined,
        isPinned: Boolean(item.isPinned),
        productType: str(item.productType),
        musicInfo:
          item.musicInfo && typeof item.musicInfo === "object"
            ? (item.musicInfo as Record<string, unknown>)
            : undefined,
        childPosts: idArray(item.childPosts),
        taggedUsers: usernameArray(item.taggedUsers)
      };
    })
    .sort((a, b) => Date.parse(b.timestamp ?? "0") - Date.parse(a.timestamp ?? "0"))
    .slice(0, postLimit);

  return {
    username,
    fullName: str(profileSource.fullName ?? profileSource.full_name ?? first.ownerFullName),
    biography: str(profileSource.biography ?? first.biography),
    followersCount: num(
      profileSource.followersCount ?? profileSource.followers ?? first.followersCount
    ),
    followsCount: num(profileSource.followsCount ?? profileSource.follows ?? first.followsCount),
    postsCount: num(profileSource.postsCount ?? profileSource.posts ?? first.postsCount),
    profilePicUrl: str(
      profileSource.profilePicUrl ?? profileSource.profilePic ?? first.profilePicUrl
    ),
    externalUrl: str(profileSource.externalUrl ?? first.externalUrl),
    isVerified: Boolean(profileSource.isVerified ?? first.isVerified),
    relatedProfiles: usernameArray(profileSource.relatedProfiles ?? first.relatedProfiles),
    posts,
    providerDatasetId: datasetId
  };
}
