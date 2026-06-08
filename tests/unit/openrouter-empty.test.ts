import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn()
}));

vi.mock("node:dns/promises", () => ({
  lookup: dnsMocks.lookup
}));

import { env } from "../../src/config/env.js";
import { OpenRouterLlmProvider } from "../../src/modules/llm/openrouter.adapter.js";

const originalImageCapMb = env.ANALYSIS_MAX_IMAGE_DOWNLOAD_MB;

describe("OpenRouterLlmProvider", () => {
  beforeEach(() => {
    dnsMocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  afterEach(() => {
    env.ANALYSIS_MAX_IMAGE_DOWNLOAD_MB = originalImageCapMb;
    dnsMocks.lookup.mockReset();
    vi.unstubAllGlobals();
  });

  it("treats an empty model response as a failed call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: " " } }] })))
    );

    const provider = new OpenRouterLlmProvider("token");

    await expect(
      provider.chat({ language: "en", reportText: "Report context", question: "Question?" })
    ).rejects.toThrow("LLM_EMPTY_RESPONSE");
  });

  it("falls back to text vision when structured output is not supported", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("image-bytes", {
          status: 200,
          headers: { "content-type": "image/jpeg" }
        })
      )
      .mockResolvedValueOnce(new Response("{}", { status: 400 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "Visible public facts." } }] })
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterLlmProvider("token");
    const result = await provider.analyzeVision({
      profile: {
        username: "alice",
        followersCount: 1,
        followsCount: 1,
        postsCount: 1,
        isVerified: false,
        relatedProfiles: [],
        posts: []
      },
      posts: [
        {
          id: "p1",
          type: "Image",
          caption: "caption",
          hashtags: [],
          mentions: [],
          likesCount: 1,
          commentsCount: 0,
          latestComments: [],
          timestamp: "2026-06-01T00:00:00Z",
          displayUrl: "https://cdn.example/post.jpg",
          url: "https://www.instagram.com/p/p1/",
          isPinned: false,
          childPosts: [],
          taggedUsers: []
        }
      ]
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result[0]).toMatchObject({
      postId: "p1",
      status: "completed",
      description: "[Image ID: p1] Visible public facts."
    });
  });

  it("marks vision as skipped when the image download exceeds the configured cap", async () => {
    env.ANALYSIS_MAX_IMAGE_DOWNLOAD_MB = 1;
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response("", {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(2 * 1024 * 1024)
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterLlmProvider("token");
    const result = await provider.analyzeVision({
      profile: {
        username: "alice",
        followersCount: 1,
        followsCount: 1,
        postsCount: 1,
        isVerified: false,
        relatedProfiles: [],
        posts: []
      },
      posts: [
        {
          id: "p1",
          type: "Image",
          caption: "caption",
          hashtags: [],
          mentions: [],
          likesCount: 1,
          commentsCount: 0,
          latestComments: [],
          timestamp: "2026-06-01T00:00:00Z",
          displayUrl: "https://cdn.example/huge.jpg",
          url: "https://www.instagram.com/p/p1/",
          isPinned: false,
          childPosts: [],
          taggedUsers: []
        }
      ]
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://cdn.example/huge.jpg");
    expect(result[0]).toMatchObject({
      postId: "p1",
      status: "skipped",
      description: null,
      errorCode: "IMAGE_TOO_LARGE"
    });
  });

  it("does not fetch private IP literal image URLs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterLlmProvider("token");
    const result = await provider.analyzeVision(visionInput("http://127.0.0.1/internal.jpg"));

    expect(dnsMocks.lookup).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({
      postId: "p1",
      status: "skipped",
      errorCode: "IMAGE_URL_PRIVATE"
    });
  });

  it("does not fetch image URLs whose DNS resolves to a private address", async () => {
    dnsMocks.lookup.mockResolvedValueOnce([{ address: "10.0.0.5", family: 4 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterLlmProvider("token");
    const result = await provider.analyzeVision(visionInput("https://cdn.example/private.jpg"));

    expect(dnsMocks.lookup).toHaveBeenCalledWith("cdn.example", { all: true, verbatim: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({
      postId: "p1",
      status: "skipped",
      errorCode: "IMAGE_URL_PRIVATE"
    });
  });

  it("checks redirect targets before following image downloads", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response("", {
        status: 302,
        headers: { location: "http://127.0.0.1/metadata" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterLlmProvider("token");
    const result = await provider.analyzeVision(visionInput("https://cdn.example/redirect.jpg"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://cdn.example/redirect.jpg");
    expect(result[0]).toMatchObject({
      postId: "p1",
      status: "skipped",
      errorCode: "IMAGE_URL_PRIVATE"
    });
  });
});

function visionInput(displayUrl: string) {
  return {
    profile: {
      username: "alice",
      followersCount: 1,
      followsCount: 1,
      postsCount: 1,
      isVerified: false,
      relatedProfiles: [],
      posts: []
    },
    posts: [
      {
        id: "p1",
        type: "Image",
        caption: "caption",
        hashtags: [],
        mentions: [],
        likesCount: 1,
        commentsCount: 0,
        latestComments: [],
        timestamp: "2026-06-01T00:00:00Z",
        displayUrl,
        url: "https://www.instagram.com/p/p1/",
        isPinned: false,
        childPosts: [],
        taggedUsers: []
      }
    ]
  };
}
