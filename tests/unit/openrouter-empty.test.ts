import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterLlmProvider } from "../../src/modules/llm/openrouter.adapter.js";

describe("OpenRouterLlmProvider", () => {
  afterEach(() => {
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
});
