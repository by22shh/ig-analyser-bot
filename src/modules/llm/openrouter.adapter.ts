import { env } from "../../config/env.js";
import { mapWithConcurrency } from "../../util/concurrency.js";
import { reportPromptForMode, prompts } from "./prompts.js";
import {
  buildChatCompletionBody,
  buildVisionUserContent,
  type ChatUserContent
} from "./request.js";
import type { ChatInput, LlmProvider, ReportInput, VisionInput } from "./types.js";

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export class MockLlmProvider implements LlmProvider {
  async analyzeVision(input: VisionInput) {
    return input.posts.slice(0, env.ANALYSIS_MAX_IMAGES_ANALYZED ?? 30).map((post) => ({
      postId: post.id,
      status: "completed" as const,
      description: `[Image ID: ${post.id}] Visible signals: composed public lifestyle/work content, recurring clean visual style, context from caption: ${post.caption ?? "no caption"}.`,
      model: "mock-vision",
      promptVersion: prompts.vision.key
    }));
  }

  async generateReport(input: ReportInput) {
    const prompt = reportPromptForMode(input.mode);
    const languageHint = input.language === "ru" ? "RU" : "EN";
    const sections = prompt.requiredSections.map((title, index) => {
      const post = input.posts[index % Math.max(input.posts.length, 1)];
      const source = post?.url ? ` Source: ${post.url}` : "";
      return `[[SECTION]]\n${title}\n${languageHint}: Signal ${index + 1}. The public profile @${input.profile.username} shows a recurring pattern across posts and metadata. This is a hypothesis for verification, not a certainty.${source}`;
    });
    return {
      rawText: sections.join("\n\n"),
      model: "mock-reasoning",
      promptVersion: prompt.key
    };
  }

  async chat(input: ChatInput) {
    return {
      text:
        input.language === "ru"
          ? `По отчету: ${input.question}. Практичный ответ: используйте только публичные факты и формулируйте вывод как гипотезу для проверки.`
          : `Based on the report: ${input.question}. Practical answer: rely on public facts only and phrase the conclusion as a hypothesis to verify.`,
      model: "mock-chat",
      tokensIn: Math.ceil(input.reportText.length / 4),
      tokensOut: 80
    };
  }
}

export class OpenRouterLlmProvider implements LlmProvider {
  constructor(private readonly apiKey = env.OPENROUTER_API_KEY) {}

  async analyzeVision(input: VisionInput) {
    const posts = input.posts.slice(0, env.ANALYSIS_MAX_IMAGES_ANALYZED ?? 30);
    // Bounded concurrency: analyze up to VISION_BATCH_SIZE images at once rather
    // than strictly one-by-one. Each post is wrapped so a single failure yields a
    // "failed" item instead of rejecting the batch; result order is preserved.
    return mapWithConcurrency(posts, env.VISION_BATCH_SIZE ?? 5, async (post) => {
      try {
        const content = await this.chatCompletion({
          model: env.MODEL_VISION,
          system: prompts.vision.system,
          user: buildVisionUserContent({
            postId: post.id,
            caption: post.caption,
            imageUrl: post.displayUrl
          }),
          maxTokens: env.LLM_FINAL_OUTPUT_TOKEN_BUDGET ?? 4096
        });
        return {
          postId: post.id,
          status: "completed" as const,
          description: `[Image ID: ${post.id}] ${content.text}`,
          model: env.MODEL_VISION,
          promptVersion: prompts.vision.key
        };
      } catch (error) {
        return {
          postId: post.id,
          status: "failed" as const,
          description: null,
          model: env.MODEL_VISION,
          promptVersion: prompts.vision.key,
          errorCode: error instanceof Error ? error.message : "VISION_FAILED"
        };
      }
    });
  }

  async generateReport(input: ReportInput) {
    const prompt = reportPromptForMode(input.mode);
    const content = await this.chatCompletion({
      model: env.MODEL_REASONING,
      system: prompt.system,
      user: buildReportUserMessage(input),
      maxTokens: env.LLM_FINAL_OUTPUT_TOKEN_BUDGET ?? 4096
    });
    return {
      rawText: content.text,
      model: env.MODEL_REASONING,
      promptVersion: prompt.key
    };
  }

  async chat(input: ChatInput) {
    const content = await this.chatCompletion({
      model: env.MODEL_CHAT,
      system: prompts.chat.system,
      user: `Language: ${input.language}\nReport context:\n${input.reportText.slice(0, env.LLM_CHAT_INPUT_TOKEN_BUDGET ?? 12000)}\n\nQuestion:\n${input.question}`,
      maxTokens: env.LLM_CHAT_OUTPUT_TOKEN_BUDGET ?? 2048
    });
    return {
      text: content.text,
      model: env.MODEL_CHAT,
      tokensIn: content.tokensIn,
      tokensOut: content.tokensOut
    };
  }

  private async chatCompletion(input: {
    model: string;
    system: string;
    user: ChatUserContent;
    maxTokens: number;
  }) {
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY_MISSING");
    const started = Date.now();
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildChatCompletionBody(input)),
      signal: AbortSignal.timeout(120000)
    });
    if (response.status === 402) throw new Error("ACCESS_DENIED_CREDITS");
    if (!response.ok) throw new Error(`OPENROUTER_${response.status}`);
    const payload = (await response.json()) as OpenRouterResponse;
    const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) throw new Error("LLM_EMPTY_RESPONSE");
    return {
      text,
      tokensIn: payload.usage?.prompt_tokens,
      tokensOut: payload.usage?.completion_tokens,
      latencyMs: Date.now() - started
    };
  }
}

function buildReportUserMessage(input: ReportInput): string {
  const posts = input.posts.map((post) => ({
    id: post.id,
    url: post.url,
    timestamp: post.timestamp,
    caption: post.caption?.slice(0, 500),
    likes: post.likesCount,
    comments: post.commentsCount,
    hashtags: post.hashtags,
    mentions: post.mentions,
    latestComments: post.latestComments.slice(0, 5)
  }));
  return JSON.stringify(
    {
      language: input.language,
      mode: input.mode,
      targetPosition: input.targetPosition,
      goal: input.goal,
      profile: input.profile,
      posts,
      vision: input.vision
    },
    null,
    2
  ).slice(0, env.LLM_FINAL_INPUT_TOKEN_BUDGET ?? 24000);
}
