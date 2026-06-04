import { describe, expect, it } from "vitest";
import { mapApifyItems } from "../../src/modules/instagram/apify.adapter.js";

// The real apify~instagram-scraper returns taggedUsers / relatedProfiles as
// arrays of objects ({ username, full_name, ... }) and childPosts as objects
// ({ id, shortCode }), not bare strings. The mapper must extract usernames/ids
// from either shape so the Digital Circle and related-profile metrics populate
// on real data (the mock provider happens to emit strings, which hid this).
describe("mapApifyItems", () => {
  const baseItem = {
    id: "post1",
    type: "Image",
    caption: "hello world",
    ownerUsername: "alice",
    hashtags: ["travel"],
    likesCount: 10,
    commentsCount: 2,
    timestamp: "2026-06-01T00:00:00Z",
    latestComments: [{ ownerUsername: "dave", text: "great post here" }],
    followersCount: 100,
    biography: "bio"
  };

  it("extracts usernames from object-shaped taggedUsers / mentions / relatedProfiles", () => {
    const profile = mapApifyItems(
      "alice",
      [
        {
          ...baseItem,
          mentions: [{ username: "bob" }],
          taggedUsers: [{ username: "carol", full_name: "Carol" }],
          relatedProfiles: [{ username: "erin" }]
        }
      ],
      30,
      "ds1"
    );
    expect(profile.posts[0]?.taggedUsers).toEqual(["carol"]);
    expect(profile.posts[0]?.mentions).toEqual(["bob"]);
    expect(profile.relatedProfiles).toEqual(["erin"]);
  });

  it("extracts ids from object-shaped childPosts", () => {
    const profile = mapApifyItems(
      "alice",
      [{ ...baseItem, childPosts: [{ id: "child1" }, { shortCode: "child2" }] }],
      30
    );
    expect(profile.posts[0]?.childPosts).toEqual(["child1", "child2"]);
  });

  it("still accepts bare-string arrays (backward compatible)", () => {
    const profile = mapApifyItems(
      "alice",
      [{ ...baseItem, taggedUsers: ["frank"], mentions: ["grace"], relatedProfiles: ["heidi"] }],
      30
    );
    expect(profile.posts[0]?.taggedUsers).toEqual(["frank"]);
    expect(profile.posts[0]?.mentions).toEqual(["grace"]);
    expect(profile.relatedProfiles).toEqual(["heidi"]);
  });
});
