import { describe, expect, it } from "vitest";
import { buildReportUserMessage } from "../../src/modules/llm/openrouter.adapter.js";
import type { InstagramPost, InstagramProfile } from "../../src/modules/instagram/types.js";
import { computeReportMetrics } from "../../src/modules/reports/metrics.js";

describe("buildReportUserMessage", () => {
  it("adds metrics and source catalog while avoiding duplicated profile posts", () => {
    const post: InstagramPost = {
      id: "p1",
      type: "Image",
      caption: "launch notes and public work context",
      hashtags: ["launch"],
      mentions: ["partner"],
      likesCount: 100,
      commentsCount: 10,
      latestComments: [{ ownerUsername: "friend", text: "thoughtful launch detail" }],
      timestamp: "2026-06-01T00:00:00Z",
      displayUrl: "https://cdn.example/p1.jpg",
      url: "https://www.instagram.com/p/p1/",
      location: { name: "Dubai" },
      isPinned: true,
      productType: "feed",
      musicInfo: { songName: "Quiet Drive" },
      childPosts: [],
      taggedUsers: ["partner"]
    };
    const profile: InstagramProfile = {
      username: "alice",
      fullName: "Alice",
      biography: "Founder",
      followersCount: 1000,
      followsCount: 100,
      postsCount: 10,
      isVerified: false,
      relatedProfiles: ["partner"],
      posts: [post]
    };

    const message = buildReportUserMessage({
      mode: "standard",
      language: "ru",
      profile,
      posts: [post],
      vision: [
        {
          postId: "p1",
          status: "completed",
          description: "[Image ID: p1] Visible fact: desk setup",
          model: "m",
          promptVersion: "v"
        }
      ],
      metrics: computeReportMetrics(profile, [post])
    });
    const context = JSON.parse(message) as {
      profile: Record<string, unknown>;
      metrics: Record<string, unknown>;
      sourceCatalog: Array<Record<string, unknown>>;
      posts: Array<Record<string, unknown>>;
      qualityRules: string[];
    };

    expect(context.profile.posts).toBeUndefined();
    expect(context.metrics.engagementRate).toBe(11);
    expect(context.sourceCatalog[0]).toMatchObject({
      postId: "p1",
      url: "https://www.instagram.com/p/p1/"
    });
    expect(context.posts[0]).toMatchObject({ pinned: true, location: "Dubai" });
    expect(context.qualityRules.join(" ")).toContain("Every non-obvious claim");
  });

  it("injects section guides for the standard mode", () => {
    const post: InstagramPost = {
      id: "p1",
      type: "Image",
      caption: "c",
      hashtags: [],
      mentions: [],
      likesCount: 1,
      commentsCount: 0,
      latestComments: [],
      timestamp: "2026-06-01T00:00:00Z",
      url: "https://www.instagram.com/p/p1/",
      isPinned: false,
      childPosts: [],
      taggedUsers: []
    };
    const profile: InstagramProfile = {
      username: "alice",
      followersCount: 10,
      followsCount: 5,
      postsCount: 1,
      isVerified: false,
      relatedProfiles: [],
      posts: [post]
    };

    const message = buildReportUserMessage({
      mode: "standard",
      language: "ru",
      profile,
      posts: [post],
      vision: [],
      metrics: computeReportMetrics(profile, [post])
    });
    const context = JSON.parse(message) as { sectionGuides: Record<string, string> };

    expect(context.sectionGuides["Основные темы и приоритеты"]).toBeTruthy();
  });
});
