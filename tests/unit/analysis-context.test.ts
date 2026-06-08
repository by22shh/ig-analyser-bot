import { describe, expect, it } from "vitest";
import {
  buildAnalysisContext,
  selectAnalysisPosts,
  selectVisionAnalysisPosts
} from "../../src/modules/analysis/context.js";
import type { InstagramPost, InstagramProfile } from "../../src/modules/instagram/types.js";
import { computeReportMetrics } from "../../src/modules/reports/metrics.js";

describe("analysis context", () => {
  it("selects high-signal posts instead of only newest chronological posts", () => {
    const posts = [
      makePost("recent", { timestamp: "2026-06-08T00:00:00Z", likesCount: 10 }),
      makePost("pinned", {
        timestamp: "2026-03-01T00:00:00Z",
        isPinned: true,
        caption: "Founder intro and launch notes"
      }),
      makePost("comments", {
        timestamp: "2026-02-01T00:00:00Z",
        caption: "Community workshop guide with practical tips",
        commentsCount: 100,
        latestComments: [{ ownerUsername: "alex", text: "Great guide and workshop" }]
      })
    ];

    const selection = selectAnalysisPosts(posts, { limit: 2 });

    expect(selection.selected.map((item) => item.postId)).toEqual(
      expect.arrayContaining(["comments", "pinned"])
    );
    expect(selection.selected.map((item) => item.postId)).not.toContain("recent");
    expect(selection.selected.find((item) => item.postId === "comments")?.reasons).toContain(
      "high_comments"
    );
    expect(selection.selected.find((item) => item.postId === "pinned")?.reasons).toContain(
      "pinned"
    );
    expect(selection.omittedCount).toBe(1);
  });

  it("builds deterministic profile, cluster, audience and mode evidence", () => {
    const posts = [
      makePost("p1", {
        caption: "Startup founder workshop guide. Email hello@example.com",
        hashtags: ["startup", "guide"],
        commentsCount: 8,
        latestComments: [
          { ownerUsername: "alex", text: "useful guide" },
          { ownerUsername: "alex", text: "next workshop please" }
        ],
        location: { name: "Dubai" }
      }),
      makePost("p2", {
        caption: "Sponsored brand promo with partner discount",
        likesCount: 50,
        commentsCount: 2
      })
    ];
    const profile: InstagramProfile = {
      username: "alice",
      fullName: "Alice Founder",
      biography: "Founder and product coach",
      followersCount: 1000,
      followsCount: 100,
      postsCount: 20,
      externalUrl: "https://example.com",
      isVerified: false,
      relatedProfiles: [],
      posts
    };
    const selection = selectAnalysisPosts(posts, { limit: 2 });
    const metrics = computeReportMetrics(profile, selection.posts);
    const context = buildAnalysisContext({
      mode: "influencer",
      profile,
      posts: selection.posts,
      selection,
      metrics,
      vision: []
    });

    expect(context.profileSignals.publicContacts).toContain("hello@example.com");
    expect(context.profileSignals.publicLinks).toContain("https://example.com");
    expect(context.contentClusters.map((cluster) => cluster.label)).toEqual(
      expect.arrayContaining(["work_and_expertise", "commercial_or_ads"])
    );
    expect(context.audienceSignals.frequentCommenters[0]).toMatchObject({
      username: "alex",
      count: 2
    });
    expect(context.modeGuidance.evidencePriorities.join(" ")).toContain("brand-safety");
    expect(context.evidenceMap.some((item) => item.id === "profile:published_contacts")).toBe(true);
  });

  it("keeps author replies out of audience signals", () => {
    const posts = [
      makePost("p1", {
        commentsCount: 4,
        latestComments: [
          { ownerUsername: "alice", text: "thanks for reading" },
          { ownerUsername: "friend", text: "useful guide" },
          { ownerUsername: "friend", text: "next workshop please" }
        ]
      })
    ];
    const profile: InstagramProfile = {
      username: "Alice",
      followersCount: 100,
      followsCount: 10,
      postsCount: 1,
      isVerified: false,
      relatedProfiles: [],
      posts
    };
    const selection = selectAnalysisPosts(posts, { limit: 1 });
    const metrics = computeReportMetrics(profile, selection.posts);

    const context = buildAnalysisContext({
      mode: "standard",
      profile,
      posts: selection.posts,
      selection,
      metrics,
      vision: []
    });

    expect(context.audienceSignals.frequentCommenters).toEqual([{ username: "friend", count: 2 }]);
    expect(context.audienceSignals.repeatedCommentTerms.map((item) => item.term)).not.toContain(
      "thanks"
    );
  });

  it("keeps the profile owner out of report digital circle metrics", () => {
    const posts = [
      makePost("p1", {
        mentions: ["alice"],
        taggedUsers: ["@alice"],
        latestComments: [
          { ownerUsername: "alice", text: "author reply" },
          { ownerUsername: "friend", text: "meaningful outside comment" }
        ]
      })
    ];
    const profile: InstagramProfile = {
      username: "Alice",
      followersCount: 100,
      followsCount: 10,
      postsCount: 1,
      isVerified: false,
      relatedProfiles: [],
      posts
    };

    const metrics = computeReportMetrics(profile, posts);

    expect(metrics.digitalCircle.some((item) => item.username === "alice")).toBe(false);
    expect(metrics.digitalCircle.some((item) => item.username === "friend")).toBe(true);
  });

  it("derives vision candidates from smart-selected posts for retry cache compatibility", () => {
    const posts = [
      makePost("recent", { timestamp: "2026-06-08T00:00:00Z", likesCount: 10 }),
      makePost("pinned", {
        timestamp: "2026-03-01T00:00:00Z",
        isPinned: true,
        caption: "Founder intro"
      }),
      makePost("comments", {
        timestamp: "2026-02-01T00:00:00Z",
        caption: "Community workshop guide",
        commentsCount: 100
      })
    ];

    const candidates = selectVisionAnalysisPosts(posts, { postLimit: 2, imageLimit: 2 });

    expect(candidates.map((post) => post.id)).toEqual(
      expect.arrayContaining(["pinned", "comments"])
    );
    expect(candidates.map((post) => post.id)).not.toContain("recent");
  });
});

function makePost(id: string, overrides: Partial<InstagramPost> = {}): InstagramPost {
  return {
    id,
    type: "Image",
    caption: "",
    hashtags: [],
    mentions: [],
    likesCount: 1,
    commentsCount: 0,
    latestComments: [],
    timestamp: "2026-01-01T00:00:00Z",
    url: `https://www.instagram.com/p/${id}/`,
    isPinned: false,
    childPosts: [],
    taggedUsers: [],
    ...overrides
  };
}
