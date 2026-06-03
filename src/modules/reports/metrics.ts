import type { InstagramPost, InstagramProfile } from "../instagram/types.js";
import { computeDigitalCircle } from "./digital-circle.js";
import type { ReportMetrics } from "./types.js";

export function computeReportMetrics(
  profile: InstagramProfile,
  posts: InstagramPost[]
): ReportMetrics {
  const analyzedPosts = posts.length;
  const likes = posts.map((post) => post.likesCount);
  const comments = posts.map((post) => post.commentsCount);
  const totalLikes = likes.reduce((sum, value) => sum + value, 0);
  const totalComments = comments.reduce((sum, value) => sum + value, 0);
  const timestamps = posts
    .map((post) => Date.parse(post.timestamp ?? "0"))
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  const newest = timestamps[0];
  const oldest = timestamps[timestamps.length - 1];
  const frequencyDays =
    newest && oldest && timestamps.length > 1
      ? (newest - oldest) / 86400000 / (timestamps.length - 1)
      : 0;

  return {
    followersCount: profile.followersCount,
    followsCount: profile.followsCount,
    postsCount: profile.postsCount,
    analyzedPosts,
    avgLikes: analyzedPosts ? totalLikes / analyzedPosts : 0,
    avgComments: analyzedPosts ? totalComments / analyzedPosts : 0,
    medianLikes: median(likes),
    medianComments: median(comments),
    engagementRate:
      analyzedPosts && profile.followersCount
        ? ((totalLikes + totalComments) / analyzedPosts / profile.followersCount) * 100
        : 0,
    frequencyDays,
    pinnedPostsCount: posts.filter((post) => post.isPinned).length,
    uniqueLocations: unique(posts.map((post) => post.location?.name).filter(Boolean) as string[]),
    uniqueMusic: unique(posts.map((post) => post.musicInfo?.songName).filter(Boolean) as string[]),
    relatedProfiles: profile.relatedProfiles,
    topPostsByLikes: [...posts]
      .sort((a, b) => b.likesCount - a.likesCount)
      .slice(0, 3)
      .map((post) => ({ postId: post.id, url: post.url, likesCount: post.likesCount })),
    topPostsByComments: [...posts]
      .sort((a, b) => b.commentsCount - a.commentsCount)
      .slice(0, 3)
      .map((post) => ({ postId: post.id, url: post.url, commentsCount: post.commentsCount })),
    postTypeDistribution: frequency(posts.map((post) => post.type)),
    hashtagFrequency: frequency(
      posts.flatMap((post) => post.hashtags.map((tag) => tag.toLowerCase()))
    ),
    mentionFrequency: frequency(
      posts.flatMap((post) => post.mentions.map((mention) => mention.toLowerCase()))
    ),
    digitalCircle: computeDigitalCircle(posts)
  };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].slice(0, 20);
}

function frequency(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    if (!value) return acc;
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}
