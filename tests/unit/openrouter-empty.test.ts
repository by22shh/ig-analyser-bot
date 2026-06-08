import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../src/config/env.js";
import { OpenRouterLlmProvider } from "../../src/modules/llm/openrouter.adapter.js";

const originalImageCapMb = env.ANALYSIS_MAX_IMAGE_DOWNLOAD_MB;

describe("OpenRouterLlmProvider", () => {
  afterEach(() => {
    env.ANALYSIS_MAX_IMAGE_DOWNLOAD_MB = originalImageCapMb;
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
          url: "https://www.instagram.com/p/p1/",
          isPinned: false,
          childPosts: [],
          taggedUsers: []
        }
      ]
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result[0]).toMatchObject({
      postId: "p1",
      status: "completed",
      description: "[Image ID: p1] Visible public facts."
    });
  });

  it("does not send image content to OpenRouter when the download exceeds the configured cap", async () => {
    env.ANALYSIS_MAX_IMAGE_DOWNLOAD_MB = 1;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", {
          status: 200,
          headers: {
            "content-type": "image/jpeg",
            "content-length": String(2 * 1024 * 1024)
          }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "Visible public facts." } }] })
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterLlmProvider("token");
    await provider.analyzeVision({
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

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://cdn.example/huge.jpg");
    const openRouterBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit).body)
    ) as { messages: Array<{ content: Array<{ type: string }> }> };
    expect(openRouterBody.messages[1]?.content).toEqual([
      expect.objectContaining({ type: "text" })
    ]);
  });
});
