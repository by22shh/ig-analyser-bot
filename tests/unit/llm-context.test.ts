import { describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { buildAnalysisContext, selectAnalysisPosts } from "../../src/modules/analysis/context.js";
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

  it("strips internal operational goals from report context", () => {
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
      metrics: computeReportMetrics(profile, [post]),
      goal: "Production end-to-end evaluation after deploy"
    });
    const context = JSON.parse(message) as { goal?: string; qualityRules: string[] };

    expect(context.goal).toBeUndefined();
    expect(context.qualityRules.join(" ")).toContain("never mention operational");
  });

  it("keeps user-facing goals in report context", () => {
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
      metrics: computeReportMetrics(profile, [post]),
      goal: "Подобрать уважительную тему для первого сообщения"
    });
    const context = JSON.parse(message) as { goal?: string };

    expect(context.goal).toBe("Подобрать уважительную тему для первого сообщения");
  });

  it("injects compact deterministic analysis context", () => {
    const post: InstagramPost = {
      id: "p1",
      type: "Image",
      caption: "Founder launch guide with public email hello@example.com",
      hashtags: ["launch"],
      mentions: [],
      likesCount: 50,
      commentsCount: 5,
      latestComments: [{ ownerUsername: "alex", text: "useful guide" }],
      timestamp: "2026-06-01T00:00:00Z",
      url: "https://www.instagram.com/p/p1/",
      isPinned: true,
      childPosts: [],
      taggedUsers: []
    };
    const profile: InstagramProfile = {
      username: "alice",
      fullName: "Alice Founder",
      biography: "Founder",
      followersCount: 1000,
      followsCount: 100,
      postsCount: 1,
      isVerified: false,
      relatedProfiles: [],
      posts: [post]
    };
    const selection = selectAnalysisPosts([post], { limit: 1 });
    const metrics = computeReportMetrics(profile, selection.posts);
    const analysisContext = buildAnalysisContext({
      mode: "standard",
      profile,
      posts: selection.posts,
      selection,
      metrics,
      vision: []
    });

    const message = buildReportUserMessage({
      mode: "standard",
      language: "ru",
      profile,
      posts: selection.posts,
      vision: [],
      metrics,
      analysisContext
    });
    const context = JSON.parse(message) as {
      analysisContext: {
        selectedPostIds: string[];
        profileSignals: { publicContacts: string[] };
        evidenceMap: Array<{ id: string }>;
      };
      qualityRules: string[];
    };

    expect(context.analysisContext.selectedPostIds).toEqual(["p1"]);
    expect(context.analysisContext.profileSignals.publicContacts).toContain("hello@example.com");
    expect(context.analysisContext.evidenceMap.map((item) => item.id)).toContain("post:p1");
    expect(context.qualityRules.join(" ")).toContain("analysisContext.evidenceMap");
  });

  it("keeps oversized report contexts as valid JSON under the configured budget", () => {
    const previousBudget = env.LLM_FINAL_INPUT_TOKEN_BUDGET;
    env.LLM_FINAL_INPUT_TOKEN_BUDGET = 24000;
    try {
      const posts: InstagramPost[] = Array.from({ length: 30 }, (_, index) => ({
        id: `p${index}`,
        type: "Image",
        caption: `caption ${index} ${"x".repeat(5000)}`,
        hashtags: ["launch", "public"],
        mentions: ["partner"],
        likesCount: 100 + index,
        commentsCount: 10,
        latestComments: Array.from({ length: 8 }, (__, commentIndex) => ({
          ownerUsername: `commenter${commentIndex}`,
          text: `comment ${commentIndex} ${"y".repeat(800)}`,
          timestamp: "2026-06-01T00:00:00Z"
        })),
        timestamp: "2026-06-01T00:00:00Z",
        url: `https://www.instagram.com/p/${index}/`,
        isPinned: false,
        childPosts: [],
        taggedUsers: []
      }));
      const profile: InstagramProfile = {
        username: "alice",
        followersCount: 1000,
        followsCount: 100,
        postsCount: 30,
        isVerified: false,
        relatedProfiles: [],
        posts
      };

      const message = buildReportUserMessage({
        mode: "standard",
        language: "ru",
        profile,
        posts,
        vision: posts.map((post) => ({
          postId: post.id,
          status: "completed",
          description: `[Image ID: ${post.id}] ${"z".repeat(3000)}`,
          model: "m",
          promptVersion: "v"
        })),
        metrics: computeReportMetrics(profile, posts)
      });
      const context = JSON.parse(message) as { posts: unknown[] };

      expect(message.length).toBeLessThanOrEqual(24000);
      expect(context.posts.length).toBeLessThan(posts.length);
    } finally {
      env.LLM_FINAL_INPUT_TOKEN_BUDGET = previousBudget;
    }
  });
});
