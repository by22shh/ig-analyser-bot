import { Buffer } from "node:buffer";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "../../config/env.js";
import { sectionGuidesForMode } from "../../prompts/section-guides.js";
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
  groundingResponseFormat,
  parseGroundingResponse,
  type GroundingResult
} from "./grounding.js";
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
  GroundingVerifyInput,
  LlmProvider,
  ReportInput,
  ReportRepairInput,
  VisionInput
} from "./types.js";

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  // OpenRouter sometimes returns HTTP 200 with an embedded provider error (e.g.
  // Anthropic rejecting response_format). Surface it so structured calls can
  // fall back to text mode instead of failing as an empty response.
  error?: { message?: string; code?: number };
};

const IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000;
const IMAGE_DOWNLOAD_MAX_REDIRECTS = 3;
const BLOCKED_IMAGE_HOSTS = new Set(["localhost", "localhost.localdomain"]);
const BLOCKED_IPV4_CIDRS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3]
] as const;
const BLOCKED_IPV6_CIDRS = [
  ["::", 128],
  ["::1", 128],
  ["::", 96],
  ["::ffff:0:0", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8]
] as const;

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
        const image = await boundedImageDataUrl(post.displayUrl);
        if (!image.dataUrl) {
          return {
            postId: post.id,
            status: "skipped" as const,
            description: null,
            model: env.MODEL_VISION,
            promptVersion: prompts.vision.key,
            errorCode: image.errorCode
          };
        }
        const visionRequest = {
          model: env.MODEL_VISION,
          system: prompts.vision.system,
          user: buildVisionUserContent({
            postId: post.id,
            caption: post.caption,
            imageUrl: image.dataUrl
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
          maxTokens: env.LLM_FINAL_OUTPUT_TOKEN_BUDGET ?? 8000,
          responseFormat: reportResponseFormat(REQUIRED_SECTIONS[input.mode]),
          provider: structuredProvider(),
          // No temperature: gpt-5.5 (a reasoning model) rejects temperature≠1.
          reasoning: reasoningConfig()
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
      maxTokens: env.LLM_FINAL_OUTPUT_TOKEN_BUDGET ?? 8000,
      reasoning: reasoningConfig()
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

You are repairing a report that was already generated. Preserve supported content, add missing required sections, and attach evidence URLs/post IDs from the supplied source catalog. Do not invent facts. If repair.groundingFindings are present, fix each one: remove or clearly down-confidence forbidden_inference claims (e.g. relationship/identity/health), rephrase unsupported_claim items as hedged hypotheses or drop them, and delete any fabricated_source citation not in the source catalog. Return the complete repaired report.`;
    if (env.LLM_STRUCTURED_OUTPUTS) {
      try {
        const content = await this.chatCompletion({
          model: env.MODEL_REASONING,
          system,
          user: buildReportRepairUserMessage(input),
          maxTokens: env.LLM_REPAIR_OUTPUT_TOKEN_BUDGET ?? 8000,
          responseFormat: reportResponseFormat(REQUIRED_SECTIONS[input.mode]),
          provider: structuredProvider(),
          reasoning: reasoningConfig()
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
      maxTokens: env.LLM_REPAIR_OUTPUT_TOKEN_BUDGET ?? 8000,
      reasoning: reasoningConfig()
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

  async verifyGrounding(input: GroundingVerifyInput): Promise<GroundingResult> {
    if (!env.LLM_GROUNDING_CHECK) return { findings: [] };
    const payload = JSON.stringify({
      language: input.language,
      sourceCatalog: input.sourceCatalog,
      sections: input.sections.map((section) => ({
        title: section.title,
        content: section.content.slice(0, 1500),
        citedSources: section.sources
          .map((source) => source.url ?? source.postId)
          .filter((value): value is string => Boolean(value))
      }))
    });
    try {
      const content = await this.chatCompletion({
        model: env.MODEL_GROUNDING,
        system: prompts.grounding.system,
        user: payload,
        maxTokens: 1500,
        responseFormat: env.LLM_STRUCTURED_OUTPUTS ? groundingResponseFormat : undefined,
        provider: structuredProvider(),
        temperature: 0.1
      });
      return parseGroundingResponse(content.text);
    } catch {
      // Grounding is advisory; a failed pass must not fail the report.
      return { findings: [] };
    }
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
      signal: AbortSignal.timeout(env.LLM_REQUEST_TIMEOUT_MS ?? 180000)
    });
    if (response.status === 402) throw new Error("ACCESS_DENIED_CREDITS");
    if (!response.ok) throw new Error(`OPENROUTER_${response.status}`);
    const payload = (await response.json()) as OpenRouterResponse;
    if (payload.error) throw new Error("OPENROUTER_PROVIDER_ERROR");
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
    weakSourceSections: input.weakSourceSections,
    groundingFindings: input.groundingFindings
  });
}

function buildBudgetedReportContext(
  input: ReportInput,
  repair: {
    repair: boolean;
    rawText?: string;
    missingSections?: string[];
    weakSourceSections?: string[];
    groundingFindings?: string[];
  }
): string {
  const budget = env.LLM_FINAL_INPUT_TOKEN_BUDGET ?? 24000;
  const attempts = [
    { captionChars: 500, commentCount: 5, commentChars: 220, visionChars: 1600 },
    { captionChars: 320, commentCount: 3, commentChars: 160, visionChars: 1000 },
    { captionChars: 220, commentCount: 2, commentChars: 120, visionChars: 700 },
    { captionChars: 140, commentCount: 1, commentChars: 90, visionChars: 450 }
  ];

  for (const postLimit of budgetedPostLimits(input.posts.length)) {
    const limitedInput = limitReportInput(input, postLimit);
    for (const attempt of attempts) {
      const json = JSON.stringify(buildReportContext(limitedInput, repair, attempt), null, 2);
      if (json.length <= budget) return json;
    }
  }

  return JSON.stringify(buildMinimalReportContext(input, repair), null, 2);
}

function budgetedPostLimits(totalPosts: number): number[] {
  if (totalPosts <= 0) return [0];
  return [
    ...new Set([totalPosts, 24, 18, 12, 8, 5, 3, 1, 0].filter((limit) => limit <= totalPosts))
  ];
}

function limitReportInput(input: ReportInput, postLimit: number): ReportInput {
  if (postLimit >= input.posts.length) return input;
  const posts = input.posts.slice(0, postLimit);
  const keptPostIds = new Set(posts.map((post) => post.id));
  return {
    ...input,
    posts,
    vision: input.vision.filter((item) => keptPostIds.has(item.postId))
  };
}

function buildMinimalReportContext(
  input: ReportInput,
  repair: {
    repair: boolean;
    rawText?: string;
    missingSections?: string[];
    weakSourceSections?: string[];
    groundingFindings?: string[];
  }
) {
  const prompt = reportPromptForMode(input.mode);
  return {
    task: repair.repair ? "repair_report" : "generate_report",
    language: input.language,
    mode: input.mode,
    targetPosition: input.targetPosition,
    goal: input.goal,
    requiredSections: prompt.requiredSections,
    sectionGuides: sectionGuidesForMode(input.mode),
    qualityRules: [
      "Use only the compact profile and metric evidence in this payload.",
      "Explicitly say when post-level evidence was compressed out of the context.",
      "Do not infer protected traits, private life facts, identity, medical, political, religious, or sensitive attributes."
    ],
    profile: {
      username: input.profile.username,
      fullName: input.profile.fullName,
      biography: truncate(input.profile.biography, 280),
      followersCount: input.profile.followersCount,
      followsCount: input.profile.followsCount,
      postsCount: input.profile.postsCount,
      externalUrl: input.profile.externalUrl,
      isVerified: input.profile.isVerified
    },
    metrics: input.metrics,
    sourceCatalog: [],
    posts: [],
    vision: [],
    repair: repair.repair
      ? {
          missingSections: repair.missingSections,
          weakSourceSections: repair.weakSourceSections,
          groundingFindings: repair.groundingFindings,
          previousReport: truncate(repair.rawText, 1200)
        }
      : undefined
  };
}

function buildReportContext(
  input: ReportInput,
  repair: {
    repair: boolean;
    rawText?: string;
    missingSections?: string[];
    weakSourceSections?: string[];
    groundingFindings?: string[];
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
    sectionGuides: sectionGuidesForMode(input.mode),
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
          groundingFindings: repair.groundingFindings,
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

function reasoningConfig(): ReasoningConfig {
  return { enabled: true, exclude: true, effort: env.MODEL_REASONING_EFFORT };
}

function tryRenderStructuredVision(postId: string, text: string): string {
  try {
    return renderVisionDescription(postId, parseStructuredVision(text));
  } catch {
    return `[Image ID: ${postId}] ${text}`;
  }
}

async function boundedImageDataUrl(imageUrl: string | null | undefined): Promise<{
  dataUrl?: string;
  errorCode: string;
}> {
  if (!imageUrl) return { errorCode: "IMAGE_URL_MISSING" };
  try {
    const maxBytes = Math.max(
      1,
      Math.floor((env.ANALYSIS_MAX_IMAGE_DOWNLOAD_MB ?? 8) * 1024 * 1024)
    );
    const response = await fetchPublicImage(imageUrl);
    if (!response.ok) throw new Error(`IMAGE_DOWNLOAD_${response.status}`);
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error("IMAGE_TOO_LARGE");
    }
    const rawContentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (rawContentType && !rawContentType.startsWith("image/")) {
      throw new Error("IMAGE_UNSUPPORTED_TYPE");
    }

    const chunks: Buffer[] = [];
    let received = 0;
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) throw new Error("IMAGE_TOO_LARGE");
        chunks.push(Buffer.from(value));
      }
    } else {
      const bytes = Buffer.from(await response.arrayBuffer());
      received = bytes.byteLength;
      if (received > maxBytes) throw new Error("IMAGE_TOO_LARGE");
      chunks.push(bytes);
    }

    return {
      dataUrl: `data:${rawContentType || "image/jpeg"};base64,${Buffer.concat(chunks).toString("base64")}`,
      errorCode: "ok"
    };
  } catch (error) {
    return { errorCode: error instanceof Error ? error.message : "IMAGE_DOWNLOAD_FAILED" };
  }
}

async function fetchPublicImage(imageUrl: string, redirectCount = 0): Promise<Response> {
  const url = await validatedPublicHttpUrl(imageUrl);
  const response = await fetch(url.toString(), {
    redirect: "manual",
    signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS)
  });

  if (!redirectStatus(response.status)) return response;
  if (redirectCount >= IMAGE_DOWNLOAD_MAX_REDIRECTS) throw new Error("IMAGE_REDIRECT_LIMIT");
  const location = response.headers.get("location");
  if (!location) throw new Error("IMAGE_REDIRECT_MISSING_LOCATION");
  return fetchPublicImage(new URL(location, url).toString(), redirectCount + 1);
}

function redirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

async function validatedPublicHttpUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("IMAGE_URL_UNSUPPORTED");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("IMAGE_URL_UNSUPPORTED");
  }
  if (url.username || url.password) throw new Error("IMAGE_URL_UNSUPPORTED");
  await assertPublicHostname(url.hostname);
  return url;
}

async function assertPublicHostname(hostname: string): Promise<void> {
  const normalized = normalizeHostname(hostname);
  if (!normalized || BLOCKED_IMAGE_HOSTS.has(normalized)) throw new Error("IMAGE_URL_PRIVATE");

  const literalFamily = isIP(normalized);
  if (literalFamily === 4 || literalFamily === 6) {
    if (ipIsBlocked(normalized, literalFamily)) throw new Error("IMAGE_URL_PRIVATE");
    return;
  }

  const addresses = await dnsLookup(normalized, { all: true, verbatim: true });
  if (!addresses.length) throw new Error("IMAGE_DNS_EMPTY");
  if (addresses.some(({ address, family }) => ipIsBlocked(address, family === 6 ? 6 : 4))) {
    throw new Error("IMAGE_URL_PRIVATE");
  }
}

function normalizeHostname(hostname: string): string {
  return hostname
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "")
    .toLowerCase();
}

function ipIsBlocked(address: string, family: 4 | 6): boolean {
  const parsed = family === 4 ? parseIpv4(address) : parseIpv6(address);
  if (parsed === undefined) return true;
  const blocks = family === 4 ? BLOCKED_IPV4_CIDRS : BLOCKED_IPV6_CIDRS;
  return blocks.some(([base, prefix]) =>
    cidrContains(parsed, parseIp(base, family), prefix, family)
  );
}

function parseIp(address: string, family: 4 | 6): bigint {
  const parsed = family === 4 ? parseIpv4(address) : parseIpv6(address);
  if (parsed === undefined) throw new Error("IMAGE_IP_PARSE_FAILED");
  return parsed;
}

function cidrContains(value: bigint, base: bigint, prefix: number, family: 4 | 6): boolean {
  const bits = family === 4 ? 32 : 128;
  if (prefix <= 0) return true;
  const shift = BigInt(bits - prefix);
  return value >> shift === base >> shift;
}

function parseIpv4(address: string): bigint | undefined {
  const octets = address.split(".");
  if (octets.length !== 4) return undefined;
  return octets.reduce<bigint | undefined>((acc, item) => {
    if (acc === undefined || !/^\d{1,3}$/.test(item)) return undefined;
    const parsed = Number(item);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) return undefined;
    return (acc << 8n) + BigInt(parsed);
  }, 0n);
}

function parseIpv6(address: string): bigint | undefined {
  let value = address.toLowerCase();
  if (value.includes("%")) return undefined;
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const embeddedIpv4 = parseIpv4(value.slice(lastColon + 1));
    if (lastColon < 0 || embeddedIpv4 === undefined) return undefined;
    value = `${value.slice(0, lastColon)}:${((embeddedIpv4 >> 16n) & 0xffffn).toString(16)}:${(embeddedIpv4 & 0xffffn).toString(16)}`;
  }

  const sides = value.split("::");
  if (sides.length > 2) return undefined;
  const head = sides[0] ? sides[0].split(":") : [];
  const tail = sides[1] ? sides[1].split(":") : [];
  if (head.some((part) => !part) || tail.some((part) => !part)) return undefined;
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (sides.length === 1 && missing !== 0)) return undefined;

  const hextets = [...head, ...Array<string>(missing).fill("0"), ...tail].map((part) => {
    if (!/^[\da-f]{1,4}$/i.test(part)) return undefined;
    const parsed = Number.parseInt(part, 16);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0xffff ? parsed : undefined;
  });
  if (hextets.some((part) => part === undefined)) return undefined;
  return hextets.reduce<bigint>((acc, item) => (acc << 16n) + BigInt(item ?? 0), 0n);
}

function canFallbackFromStructuredError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message === "STRUCTURED_JSON_PARSE_FAILED" ||
    error.message === "STRUCTURED_REPORT_PARSE_FAILED" ||
    // A provider that does not support response_format (e.g. Anthropic via
    // OpenRouter returns an embedded "Provider returned error" or a 404 route)
    // must degrade to text [[SECTION]] mode rather than fail the whole report.
    error.message === "OPENROUTER_PROVIDER_ERROR" ||
    error.message.startsWith("OPENROUTER_400") ||
    error.message.startsWith("OPENROUTER_404") ||
    error.message.startsWith("OPENROUTER_422")
  );
}
