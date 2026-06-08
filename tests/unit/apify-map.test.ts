import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApifyInstagramProfileProvider,
  mapApifyItems
} from "../../src/modules/instagram/apify.adapter.js";

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

  it("keeps carousel child media urls for multi-image vision", () => {
    const profile = mapApifyItems(
      "alice",
      [
        {
          ...baseItem,
          displayUrl: "https://cdn.example/cover.jpg",
          childPosts: [
            { id: "child1", displayUrl: "https://cdn.example/child1.jpg" },
            { id: "child2", imageUrl: "https://cdn.example/child2.jpg" }
          ]
        }
      ],
      30
    );

    expect(profile.posts[0]?.childPosts).toEqual(["child1", "child2"]);
    expect(profile.posts[0]?.mediaUrls).toEqual([
      "https://cdn.example/cover.jpg",
      "https://cdn.example/child1.jpg",
      "https://cdn.example/child2.jpg"
    ]);
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

  it("normalizes negative provider counters to zero", () => {
    const profile = mapApifyItems(
      "alice",
      [
        {
          ...baseItem,
          likesCount: -1,
          commentsCount: -1,
          followersCount: -1,
          followsCount: -1,
          postsCount: -1
        }
      ],
      30
    );

    expect(profile.followersCount).toBe(0);
    expect(profile.followsCount).toBe(0);
    expect(profile.postsCount).toBe(0);
    expect(profile.posts[0]?.likesCount).toBe(0);
    expect(profile.posts[0]?.commentsCount).toBe(0);
  });

  it("uses dataSource as parent profile data when Apify attaches it to post items", () => {
    const profile = mapApifyItems(
      "alice",
      [
        {
          ...baseItem,
          ownerUsername: undefined,
          followersCount: undefined,
          biography: undefined,
          dataSource: {
            username: "alice",
            fullName: "Alice Example",
            biography: "profile from parent data",
            followersCount: 1234,
            followsCount: 55,
            postsCount: 88,
            profilePicUrl: "https://example.com/alice.jpg",
            relatedProfiles: [{ username: "brand_friend" }]
          }
        }
      ],
      30
    );

    expect(profile.fullName).toBe("Alice Example");
    expect(profile.biography).toBe("profile from parent data");
    expect(profile.followersCount).toBe(1234);
    expect(profile.followsCount).toBe(55);
    expect(profile.postsCount).toBe(88);
    expect(profile.profilePicUrl).toBe("https://example.com/alice.jpg");
    expect(profile.relatedProfiles).toEqual(["brand_friend"]);
  });
});

describe("ApifyInstagramProfileProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the configured post limit without silently inflating provider spend", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { id: "run-1", status: "RUNNING" } }))
      .mockResolvedValueOnce(
        jsonResponse({ data: { id: "run-1", status: "SUCCEEDED", defaultDatasetId: "ds-1" } })
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: "post1",
            type: "Image",
            ownerUsername: "alice",
            timestamp: "2026-06-01T00:00:00Z"
          }
        ])
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new ApifyInstagramProfileProvider("token");
    await provider.fetchProfile({ username: "alice", postLimit: 30, includeParentData: true });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      resultsLimit?: number;
      searchType?: string;
    };
    expect(body.resultsLimit).toBe(30);
    expect(body.searchType).toBe("user");
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
