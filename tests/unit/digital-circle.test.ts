import { describe, expect, it } from "vitest";
import { computeDigitalCircle } from "../../src/modules/reports/digital-circle.js";
import type { InstagramPost } from "../../src/modules/instagram/types.js";

describe("digital circle", () => {
  it("scores tags, mentions and meaningful comments", () => {
    const posts: InstagramPost[] = [
      {
        id: "1",
        type: "Image",
        hashtags: [],
        mentions: ["partner"],
        likesCount: 10,
        commentsCount: 2,
        latestComments: [
          { ownerUsername: "friend", text: "This is a thoughtful comment", timestamp: "2026-06-01T00:00:00Z" },
          { ownerUsername: "spam", text: "wow" }
        ],
        timestamp: "2026-06-01T00:00:00Z",
        isPinned: false,
        childPosts: [],
        taggedUsers: ["partner"]
      }
    ];
    const result = computeDigitalCircle(posts);
    expect(result[0]?.username).toBe("partner");
    expect(result.some((item) => item.username === "friend")).toBe(true);
    expect(result.some((item) => item.username === "spam")).toBe(false);
  });
});
