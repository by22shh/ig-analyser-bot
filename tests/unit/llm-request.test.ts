import { describe, expect, it } from "vitest";
import { buildChatCompletionBody, buildVisionUserContent } from "../../src/modules/llm/request.js";

describe("buildVisionUserContent", () => {
  it("attaches the image as an image_url part so the model can actually see it", () => {
    const content = buildVisionUserContent({
      postId: "p1",
      caption: "beach",
      imageUrl: "https://cdn/x.jpg"
    });
    expect(content).toContainEqual({ type: "text", text: expect.stringContaining("p1") });
    expect(content).toContainEqual({ type: "text", text: expect.stringContaining("beach") });
    expect(content).toContainEqual({ type: "image_url", image_url: { url: "https://cdn/x.jpg" } });
  });

  it("falls back to text-only when there is no image URL", () => {
    const content = buildVisionUserContent({ postId: "p2", caption: null, imageUrl: undefined });
    expect(content).toHaveLength(1);
    expect(content.map((part) => part.type)).toEqual(["text"]);
  });
});

describe("buildChatCompletionBody", () => {
  it("uses the per-call token budget instead of a single global cap", () => {
    const body = buildChatCompletionBody({
      model: "m",
      system: "sys",
      user: "hi",
      maxTokens: 2048
    });
    expect(body.max_tokens).toBe(2048);
    expect(body.model).toBe("m");
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "hi" }
    ]);
  });

  it("passes multimodal content arrays through untouched", () => {
    const user = [
      { type: "text" as const, text: "describe" },
      { type: "image_url" as const, image_url: { url: "u" } }
    ];
    const body = buildChatCompletionBody({ model: "m", system: "sys", user, maxTokens: 512 });
    expect(body.messages).toContainEqual({ role: "user", content: user });
  });

  it("passes structured output and provider controls when requested", () => {
    const body = buildChatCompletionBody({
      model: "m",
      system: "sys",
      user: "hi",
      maxTokens: 512,
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "x",
          strict: true,
          schema: { type: "object", additionalProperties: false }
        }
      },
      provider: { require_parameters: true, data_collection: "deny" },
      reasoning: { enabled: true, exclude: true },
      temperature: 0.2
    });

    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "x",
        strict: true,
        schema: { type: "object", additionalProperties: false }
      }
    });
    expect(body.provider).toEqual({ require_parameters: true, data_collection: "deny" });
    expect(body.reasoning).toEqual({ enabled: true, exclude: true });
    expect(body.temperature).toBe(0.2);
  });
});
