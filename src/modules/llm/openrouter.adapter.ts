import { env } from "../../config/env.js";
import { mapWithConcurrency } from "../../util/concurrency.js";
import { REQUIRED_SECTIONS } from "../reports/parser.js";
import { reportPromptForMode, prompts } from "./prompts.js";
import {
  buildChatCompletionBody,
  buildVisionUserContent,
  type ChatUserContent,
  type JsonSchemaResponseFormat,
  type ProviderPreferences,
  type ReasoningConfig
} from "./request.js";
import {
  parseStructuredReport,
  parseStructuredVision,
  renderStructuredReport,
  renderVisionDescription,
  reportResponseFormat,
  visionResponseFormat
} from "./structured-output.js";
import type {
  ChatInput,
  LlmProvider,
  ReportInput,
  ReportRepairInput,
  VisionInput
} from "./types.js";

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
        const visionRequest = {
          model: env.MODEL_VISION,
          system: prompts.vision.system,
          user: buildVisionUserContent({
            postId: post.id,
            caption: post.caption,
            imageUrl: post.displayUrl
          }),
          maxTokens: env.LLM_VISION_OUTPUT_TOKEN_BUDGET ?? 700,
          responseFormat: env.LLM_STRUCTURED_OUTPUTS ? visionResponseFormat : undefined,
          provider: structuredProvider(),
          temperature: 0.1
        };
        const content = await this.chatCompletion(visionRequest).catch((error: unknown) => {
          if (!env.LLM_STRUCTURED_OUTPUTS || !canFallbackFromStructuredError(error)) throw error;
          return this.chatCompletion({
            ...visionRequest,
            responseFormat: undefined,
            provider: undefined
          });
        });
        const description =
          env.LLM_STRUCTURED_OUTPUTS && content.structured
            ? tryRenderStructuredVision(post.id, content.text)
            : `[Image ID: ${post.id}] ${content.text}`;
        return {
          postId: post.id,
          status: "completed" as const,
          description,
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
    if (env.LLM_STRUCTURED_OUTPUTS) {
      try {
        const content = await this.chatCompletion({
          model: env.MODEL_REASONING,
          system: prompt.system,
          user: buildReportUserMessage(input),
          maxTokens: env.LLM_FINAL_OUTPUT_TOKEN_BUDGET ?? 4096,
          responseFormat: reportResponseFormat(REQUIRED_SECTIONS[input.mode]),
          provider: structuredProvider(),
          reasoning: { enabled: true, exclude: true },
          temperature: 0.2
        });
        const structured = parseStructuredReport(content.text);
        return {
          rawText: renderStructuredReport(structured),
          model: env.MODEL_REASONING,
          promptVersion: prompt.key,
          summaryBullets: structured.summaryBullets
        };
      } catch (error) {
        if (!canFallbackFromStructuredError(error)) throw error;
      }
    }
    const content = await this.chatCompletion({
      model: env.MODEL_REASONING,
      system: prompt.system,
      user: buildReportUserMessage(input),
      maxTokens: env.LLM_FINAL_OUTPUT_TOKEN_BUDGET ?? 4096,
      temperature: 0.2
    });
    return {
      rawText: content.text,
      model: env.MODEL_REASONING,
      promptVersion: prompt.key
    };
  }

  async repairReport(input: ReportRepairInput) {
    const prompt = reportPromptForMode(input.mode);
    const system = `${prompt.system}

You are repairing a report that was already generated. Preserve supported content, add missing required sections, and attach evidence URLs/post IDs from the supplied source catalog. Do not invent facts. Return the complete repaired report.`;
    if (env.LLM_STRUCTURED_OUTPUTS) {
      try {
        const content = await this.chatCompletion({
          model: env.MODEL_REASONING,
          system,
          user: buildReportRepairUserMessage(input),
          maxTokens: env.LLM_REPAIR_OUTPUT_TOKEN_BUDGET ?? 4096,
          responseFormat: reportResponseFormat(REQUIRED_SECTIONS[input.mode]),
          provider: structuredProvider(),
          reasoning: { enabled: true, exclude: true },
          temperature: 0.1
        });
        const structured = parseStructuredReport(content.text);
        return {
          rawText: renderStructuredReport(structured),
          model: env.MODEL_REASONING,
          promptVersion: `${prompt.key}.repair`,
          summaryBullets: structured.summaryBullets
        };
      } catch (error) {
        if (!canFallbackFromStructuredError(error)) throw error;
      }
    }
    const content = await this.chatCompletion({
      model: env.MODEL_REASONING,
      system,
      user: buildReportRepairUserMessage(input),
      maxTokens: env.LLM_REPAIR_OUTPUT_TOKEN_BUDGET ?? 4096,
      temperature: 0.1
    });
    return {
      rawText: content.text,
      model: env.MODEL_REASONING,
      promptVersion: `${prompt.key}.repair`
    };
  }

  async chat(input: ChatInput) {
    // LLM_CHAT_INPUT_TOKEN_BUDGET is applied as a *character* cap (not a token
    // count): a deliberately conservative bound (~4 chars/token keeps us well
    // under the model context window) that needs no tokenizer.
    const content = await this.chatCompletion({
      model: env.MODEL_CHAT,
      system: prompts.chat.system,
      user: `Language: ${input.language}\nReport context:\n${input.reportText.slice(0, env.LLM_CHAT_INPUT_TOKEN_BUDGET ?? 12000)}\n\nQuestion:\n${input.question}`,
      maxTokens: env.LLM_CHAT_OUTPUT_TOKEN_BUDGET ?? 2048,
      temperature: 0.2
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
    responseFormat?: JsonSchemaResponseFormat;
    provider?: ProviderPreferences;
    reasoning?: ReasoningConfig;
    temperature?: number;
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
      structured: Boolean(input.responseFormat),
      tokensIn: payload.usage?.prompt_tokens,
      tokensOut: payload.usage?.completion_tokens,
      latencyMs: Date.now() - started
    };
  }
}

export function buildReportUserMessage(input: ReportInput): string {
  return buildBudgetedReportContext(input, { repair: false });
}

export function buildReportRepairUserMessage(input: ReportRepairInput): string {
  return buildBudgetedReportContext(input, {
    repair: true,
    rawText: input.rawText,
    missingSections: input.missingSections,
    weakSourceSections: input.weakSourceSections
  });
}

function buildBudgetedReportContext(
  input: ReportInput,
  repair: {
    repair: boolean;
    rawText?: string;
    missingSections?: string[];
    weakSourceSections?: string[];
  }
): string {
  const budget = env.LLM_FINAL_INPUT_TOKEN_BUDGET ?? 24000;
  const attempts = [
    { captionChars: 500, commentCount: 5, commentChars: 220, visionChars: 1600 },
    { captionChars: 320, commentCount: 3, commentChars: 160, visionChars: 1000 },
    { captionChars: 220, commentCount: 2, commentChars: 120, visionChars: 700 },
    { captionChars: 140, commentCount: 1, commentChars: 90, visionChars: 450 }
  ];

  let last = "";
  for (const attempt of attempts) {
    const json = JSON.stringify(buildReportContext(input, repair, attempt), null, 2);
    last = json;
    if (json.length <= budget) return json;
  }
  return last.slice(0, budget);
}

function buildReportContext(
  input: ReportInput,
  repair: {
    repair: boolean;
    rawText?: string;
    missingSections?: string[];
    weakSourceSections?: string[];
  },
  limits: { captionChars: number; commentCount: number; commentChars: number; visionChars: number }
) {
  const prompt = reportPromptForMode(input.mode);
  const posts = input.posts.map((post) => ({
    id: post.id,
    url: post.url,
    timestamp: post.timestamp,
    type: post.type,
    productType: post.productType,
    pinned: post.isPinned,
    location: post.location?.name,
    music: post.musicInfo?.songName,
    caption: truncate(post.caption, limits.captionChars),
    likes: post.likesCount,
    comments: post.commentsCount,
    hashtags: post.hashtags,
    mentions: post.mentions,
    taggedUsers: post.taggedUsers,
    latestComments: post.latestComments.slice(0, limits.commentCount).map((comment) => ({
      ownerUsername: comment.ownerUsername,
      text: truncate(comment.text, limits.commentChars),
      timestamp: comment.timestamp
    }))
  }));

  return {
    task: repair.repair ? "repair_report" : "generate_report",
    language: input.language,
    mode: input.mode,
    targetPosition: input.targetPosition,
    goal: input.goal,
    requiredSections: prompt.requiredSections,
    qualityRules: [
      "Every non-obvious claim needs evidence from sourceCatalog, post metadata, comments, metrics, or vision.",
      "Prefer specific observable facts over generic personality claims.",
      "Use low/medium/high confidence and say when public data is insufficient.",
      "Do not infer protected traits, private life facts, identity, medical, political, religious, or sensitive attributes."
    ],
    profile: {
      username: input.profile.username,
      fullName: input.profile.fullName,
      biography: input.profile.biography,
      followersCount: input.profile.followersCount,
      followsCount: input.profile.followsCount,
      postsCount: input.profile.postsCount,
      externalUrl: input.profile.externalUrl,
      isVerified: input.profile.isVerified,
      relatedProfiles: input.profile.relatedProfiles
    },
    metrics: input.metrics,
    sourceCatalog: input.posts.map((post) => ({
      postId: post.id,
      url: post.url,
      timestamp: post.timestamp,
      captionSnippet: truncate(post.caption, 160)
    })),
    posts,
    vision: input.vision.map((item) => ({
      postId: item.postId,
      status: item.status,
      description: truncate(item.description, limits.visionChars),
      errorCode: item.errorCode
    })),
    repair: repair.repair
      ? {
          missingSections: repair.missingSections,
          weakSourceSections: repair.weakSourceSections,
          previousReport: truncate(repair.rawText, 8000)
        }
      : undefined
  };
}

function truncate(value: string | null | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}…` : value;
}

function structuredProvider(): ProviderPreferences | undefined {
  if (!env.LLM_STRUCTURED_OUTPUTS) return undefined;
  return { require_parameters: true, data_collection: "deny" };
}

function tryRenderStructuredVision(postId: string, text: string): string {
  try {
    return renderVisionDescription(postId, parseStructuredVision(text));
  } catch {
    return `[Image ID: ${postId}] ${text}`;
  }
}

function canFallbackFromStructuredError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message === "STRUCTURED_JSON_PARSE_FAILED" ||
    error.message === "STRUCTURED_REPORT_PARSE_FAILED" ||
    error.message.startsWith("OPENROUTER_400") ||
    error.message.startsWith("OPENROUTER_422")
  );
}
