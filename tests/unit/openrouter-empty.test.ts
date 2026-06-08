import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn()
}));

const imageRequestMocks = vi.hoisted(() => {
  const state = {
    responses: [] as Array<{
      statusCode: number;
      headers?: Record<string, string | string[]>;
      chunks?: Array<Buffer | string>;
      error?: Error;
    }>,
    calls: [] as Array<{
      protocol: string;
      url: string;
      lookupAddress?: string;
      lookupFamily?: number;
    }>,
    reset() {
      this.responses = [];
      this.calls = [];
    }
  };

  const makeRequest =
    (protocol: string) =>
    (
      url: URL,
      options: {
        lookup?: (
          hostname: string,
          options: Record<string, unknown>,
          callback: (error: Error | null, address: string, family: number) => void
        ) => void;
      },
      callback: (response: {
        statusCode: number;
        headers: Record<string, string | string[]>;
        resume: () => void;
        on: (event: string, handler: (chunk?: Buffer | string | Error) => void) => unknown;
      }) => void
    ) => {
      const requestListeners: Record<string, Array<(error: Error) => void>> = {};
      const call: (typeof state.calls)[number] = { protocol, url: url.toString() };
      state.calls.push(call);

      const request = {
        setTimeout: vi.fn(),
        on: vi.fn((event: string, handler: (error: Error) => void) => {
          (requestListeners[event] ??= []).push(handler);
          return request;
        }),
        end: vi.fn(() => {
          const queued = state.responses.shift();
          if (!queued) {
            for (const handler of requestListeners.error ?? []) {
              handler(new Error("IMAGE_REQUEST_NOT_MOCKED"));
            }
            return request;
          }
          options.lookup?.(url.hostname, {}, (error, address, family) => {
            if (error) {
              for (const handler of requestListeners.error ?? []) handler(error);
              return;
            }
            call.lookupAddress = address;
            call.lookupFamily = family;
            if (queued.error) {
              for (const handler of requestListeners.error ?? []) handler(queued.error);
              return;
            }

            const responseListeners: Record<
              string,
              Array<(chunk?: Buffer | string | Error) => void>
            > = {};
            const response = {
              statusCode: queued.statusCode,
              headers: queued.headers ?? {},
              resume: vi.fn(),
              on: vi.fn((event: string, handler: (chunk?: Buffer | string | Error) => void) => {
                (responseListeners[event] ??= []).push(handler);
                return response;
              })
            };
            callback(response);
            queueMicrotask(() => {
              for (const chunk of queued.chunks ?? []) {
                for (const handler of responseListeners.data ?? []) handler(chunk);
              }
              for (const handler of responseListeners.end ?? []) handler();
            });
          });
          return request;
        }),
        destroy: vi.fn((error?: Error) => {
          if (error) {
            for (const handler of requestListeners.error ?? []) handler(error);
          }
          return request;
        })
      };
      return request;
    };

  return { state, makeRequest };
});

vi.mock("node:dns/promises", () => ({
  lookup: dnsMocks.lookup
}));

vi.mock("node:http", () => ({
  request: imageRequestMocks.makeRequest("http:")
}));

vi.mock("node:https", () => ({
  request: imageRequestMocks.makeRequest("https:")
}));

import { env } from "../../src/config/env.js";
import { OpenRouterLlmProvider } from "../../src/modules/llm/openrouter.adapter.js";

const originalImageCapMb = env.ANALYSIS_MAX_IMAGE_DOWNLOAD_MB;
const originalStructuredOutputs = env.LLM_STRUCTURED_OUTPUTS;

describe("OpenRouterLlmProvider", () => {
  beforeEach(() => {
    dnsMocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    imageRequestMocks.state.reset();
  });

  afterEach(() => {
    env.ANALYSIS_MAX_IMAGE_DOWNLOAD_MB = originalImageCapMb;
    env.LLM_STRUCTURED_OUTPUTS = originalStructuredOutputs;
    dnsMocks.lookup.mockReset();
    imageRequestMocks.state.reset();
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
    imageRequestMocks.state.responses.push({
      statusCode: 200,
      headers: { "content-type": "image/jpeg" },
      chunks: [Buffer.from("image-bytes")]
    });
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
          displayUrl: "https://cdn.example/post.jpg",
          url: "https://www.instagram.com/p/p1/",
          isPinned: false,
          childPosts: [],
          taggedUsers: []
        }
      ]
    });

    expect(imageRequestMocks.state.calls).toHaveLength(1);
    expect(imageRequestMocks.state.calls[0]).toMatchObject({
      protocol: "https:",
      url: "https://cdn.example/post.jpg",
      lookupAddress: "93.184.216.34",
      lookupFamily: 4
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result[0]).toMatchObject({
      postId: "p1",
      status: "completed",
      description: "[Image ID: p1] Visible public facts."
    });
  });

  it("falls back to text report when the structured response is empty", async () => {
    env.LLM_STRUCTURED_OUTPUTS = true;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: " " } }] }))
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "[[SECTION]]\nОсновные темы и приоритеты\nText fallback report with public evidence."
                }
              }
            ]
          })
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterLlmProvider("token");
    const result = await provider.generateReport(reportInput());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body?: string } | undefined)?.body ?? "{}"
    );
    const secondBody = JSON.parse(
      (fetchMock.mock.calls[1]?.[1] as { body?: string } | undefined)?.body ?? "{}"
    );
    expect(firstBody.response_format).toBeDefined();
    expect(secondBody.response_format).toBeUndefined();
    expect(result.rawText).toContain("Text fallback report");
  });

  it("marks vision as skipped when the image download exceeds the configured cap", async () => {
    env.ANALYSIS_MAX_IMAGE_DOWNLOAD_MB = 1;
    imageRequestMocks.state.responses.push({
      statusCode: 200,
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(2 * 1024 * 1024)
      }
    });
    const fetchMock = vi.fn();
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

    expect(imageRequestMocks.state.calls[0]?.url).toBe("https://cdn.example/huge.jpg");
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(imageRequestMocks.state.calls).toHaveLength(0);
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
    expect(imageRequestMocks.state.calls).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({
      postId: "p1",
      status: "skipped",
      errorCode: "IMAGE_URL_PRIVATE"
    });
  });

  it("checks redirect targets before following image downloads", async () => {
    imageRequestMocks.state.responses.push({
      statusCode: 302,
      headers: { location: "http://127.0.0.1/metadata" }
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterLlmProvider("token");
    const result = await provider.analyzeVision(visionInput("https://cdn.example/redirect.jpg"));

    expect(imageRequestMocks.state.calls).toHaveLength(1);
    expect(imageRequestMocks.state.calls[0]?.url).toBe("https://cdn.example/redirect.jpg");
    expect(fetchMock).not.toHaveBeenCalled();
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

function reportInput() {
  return {
    mode: "standard" as const,
    language: "ru" as const,
    profile: {
      username: "alice",
      followersCount: 1000,
      followsCount: 100,
      postsCount: 1,
      isVerified: false,
      relatedProfiles: [],
      posts: []
    },
    posts: [
      {
        id: "p1",
        type: "Image",
        caption: "Public caption",
        hashtags: [],
        mentions: [],
        likesCount: 10,
        commentsCount: 1,
        latestComments: [],
        timestamp: "2026-06-01T00:00:00Z",
        displayUrl: "https://cdn.example/post.jpg",
        url: "https://www.instagram.com/p/p1/",
        isPinned: false,
        childPosts: [],
        taggedUsers: []
      }
    ],
    vision: []
  };
}
