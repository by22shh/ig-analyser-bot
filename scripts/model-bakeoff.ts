/**
 * Model bake-off: GPT-5.5 vs Claude Opus 4.8 (vs current Gemini baseline).
 *
 * Faithfully reuses the project's REAL prompts + structured schemas + vision
 * user-content builder, so the comparison reflects the production pipeline.
 *
 * Experiments:
 *   1. Vision   — one image, the real vision prompt + schema, per model.
 *   2. Reasoning (text-only) — identical frozen vision text + profile + metrics
 *      fed to the real report prompt + schema, per model.
 *   3. Reasoning (+image)    — same as (2) but the actual image is attached to
 *      the final call, to test "send photos to the final step vs text-only".
 *
 * Results are written to /tmp/bakeoff-results/*.json and a summary is printed.
 */
import fs from "node:fs";
import path from "node:path";
import { prompts } from "../src/modules/llm/prompts.js";
import { reportStandardPrompt } from "../src/prompts/report.standard.v1.js";
import {
  visionResponseFormat,
  reportResponseFormat,
  parseStructuredVision,
  renderVisionDescription
} from "../src/modules/llm/structured-output.js";
import { buildVisionUserContent } from "../src/modules/llm/request.js";
import { REQUIRED_SECTIONS } from "../src/modules/reports/parser.js";

const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY) throw new Error("set OPENROUTER_API_KEY");

const OUT_DIR = "/tmp/bakeoff-results";
fs.mkdirSync(OUT_DIR, { recursive: true });

const IMAGE_PATH = "/tmp/bakeoff.jpg";
const imageB64 = fs.readFileSync(IMAGE_PATH).toString("base64");
const imageDataUrl = `data:image/jpeg;base64,${imageB64}`;

const VISION_MODELS = ["openai/gpt-5.5", "anthropic/claude-opus-4.8", "google/gemini-2.5-flash"];
const REASONING_MODELS = ["openai/gpt-5.5", "anthropic/claude-opus-4.8", "google/gemini-2.5-pro"];

// Realistic single-post context built around the test image.
const POST_ID = "TEST_POST_1";
const POST_URL = "https://www.instagram.com/p/TEST_POST_1/";
const CAPTION = "Лучшие прогулки — вдоль моря 🤍 #сочи #морвокзал";

type Pricing = { prompt: number; completion: number };
const pricing: Record<string, Pricing> = {};

async function loadPricing() {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });
  const json = (await res.json()) as { data: Array<{ id: string; pricing?: Pricing }> };
  for (const m of json.data) {
    if (m.pricing)
      pricing[m.id] = {
        prompt: Number(m.pricing.prompt),
        completion: Number(m.pricing.completion)
      };
  }
}

type CallResult = {
  ok: boolean;
  tier: string;
  text: string;
  raw?: unknown;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
  latencyMs: number;
  error?: string;
};

async function callOnce(body: Record<string, unknown>): Promise<{
  text: string;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
  raw: unknown;
}> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, usage: { include: true } }),
    signal: AbortSignal.timeout(180000)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP_${res.status}: ${errText.slice(0, 400)}`);
  }
  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      cost?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };
  const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
  return {
    text,
    promptTokens: payload.usage?.prompt_tokens,
    completionTokens: payload.usage?.completion_tokens,
    reasoningTokens: payload.usage?.completion_tokens_details?.reasoning_tokens,
    costUsd: payload.usage?.cost,
    raw: payload
  };
}

/** Retry ladder: full body → drop response_format/provider → bare. */
async function robustCall(
  model: string,
  system: string,
  user: unknown,
  opts: {
    maxTokens: number;
    responseFormat?: unknown;
    reasoning?: unknown;
    temperature?: number;
  }
): Promise<CallResult> {
  const started = Date.now();
  const base = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    max_tokens: opts.maxTokens
  };
  const ladder: Array<{ tier: string; body: Record<string, unknown> }> = [
    {
      tier: "full",
      body: {
        ...base,
        response_format: opts.responseFormat,
        provider: opts.responseFormat
          ? { require_parameters: true, data_collection: "deny" }
          : undefined,
        reasoning: opts.reasoning,
        temperature: opts.temperature
      }
    },
    {
      tier: "no-structured",
      body: { ...base, reasoning: opts.reasoning }
    },
    {
      tier: "bare",
      body: { ...base }
    }
  ];

  let lastErr = "";
  for (const step of ladder) {
    const cleanBody = Object.fromEntries(
      Object.entries(step.body).filter(([, v]) => v !== undefined)
    );
    try {
      const r = await callOnce(cleanBody);
      if (!r.text) {
        lastErr = "EMPTY_RESPONSE";
        continue;
      }
      return {
        ok: true,
        tier: step.tier,
        text: r.text,
        raw: r.raw,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        reasoningTokens: r.reasoningTokens,
        costUsd: r.costUsd,
        latencyMs: Date.now() - started
      };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      // Only fall through on param-related failures; otherwise report.
      if (!/HTTP_(400|422|404)/.test(lastErr) && step.tier !== "full") break;
    }
  }
  return { ok: false, tier: "failed", text: "", latencyMs: Date.now() - started, error: lastErr };
}

function costFromTokens(model: string, prompt = 0, completion = 0): number | undefined {
  const p = pricing[model];
  if (!p) return undefined;
  return prompt * p.prompt + completion * p.completion;
}

function fmtUsd(n?: number): string {
  return n == null ? "n/a" : `$${n.toFixed(5)}`;
}

// ----- Build the report context (faithful copy of openrouter.adapter buildReportContext) -----
function buildReasoningContext(visionDescription: string, withImageNote = false) {
  const likes = 1240;
  const comments = 38;
  const followers = 8400;
  const metrics = {
    followersCount: followers,
    followsCount: 612,
    postsCount: 143,
    analyzedPosts: 1,
    avgLikes: likes,
    avgComments: comments,
    medianLikes: likes,
    medianComments: comments,
    engagementRate: ((likes + comments) / 1 / followers) * 100,
    frequencyDays: 0,
    pinnedPostsCount: 0,
    uniqueLocations: [],
    uniqueMusic: [],
    relatedProfiles: ["@sochi.style", "@seaside.moods"],
    topPostsByLikes: [{ postId: POST_ID, url: POST_URL, likesCount: likes }],
    topPostsByComments: [{ postId: POST_ID, url: POST_URL, commentsCount: comments }],
    postTypeDistribution: { Image: 1 },
    hashtagFrequency: { сочи: 1, морвокзал: 1 },
    mentionFrequency: {},
    digitalCircle: []
  };

  return {
    task: "generate_report",
    language: "ru",
    mode: "standard",
    targetPosition: undefined,
    goal: "Понять человека и найти заходы для знакомства/диалога",
    requiredSections: reportStandardPrompt.requiredSections,
    qualityRules: [
      "Every non-obvious claim needs evidence from sourceCatalog, post metadata, comments, metrics, or vision.",
      "Prefer specific observable facts over generic personality claims.",
      "Use low/medium/high confidence and say when public data is insufficient.",
      "Do not infer protected traits, private life facts, identity, medical, political, religious, or sensitive attributes."
    ],
    profile: {
      username: "alina.mood",
      fullName: "Alina",
      biography: "Сочи 🌊 | кофе, закаты, прогулки | fashion lover",
      followersCount: followers,
      followsCount: 612,
      postsCount: 143,
      externalUrl: undefined,
      isVerified: false,
      relatedProfiles: ["@sochi.style", "@seaside.moods"]
    },
    metrics,
    sourceCatalog: [
      {
        postId: POST_ID,
        url: POST_URL,
        timestamp: "2026-05-30T15:20:00.000Z",
        captionSnippet: CAPTION
      }
    ],
    posts: [
      {
        id: POST_ID,
        url: POST_URL,
        timestamp: "2026-05-30T15:20:00.000Z",
        type: "Image",
        productType: undefined,
        pinned: false,
        location: "Морской вокзал, Сочи",
        music: undefined,
        caption: CAPTION,
        likes,
        comments,
        hashtags: ["сочи", "морвокзал"],
        mentions: [],
        taggedUsers: [],
        latestComments: [
          {
            ownerUsername: "marina_k",
            text: "Какая вы пара красивая 😍",
            timestamp: "2026-05-30T16:00:00.000Z"
          },
          {
            ownerUsername: "denis.s",
            text: "Сочи топ! Где это место?",
            timestamp: "2026-05-30T16:10:00.000Z"
          },
          {
            ownerUsername: "lera_99",
            text: "Кофта огонь, откуда?",
            timestamp: "2026-05-30T17:02:00.000Z"
          }
        ]
      }
    ],
    vision: [
      {
        postId: POST_ID,
        status: "completed",
        description:
          visionDescription +
          (withImageNote ? "\n[Оригинальное изображение этого поста приложено к запросу.]" : ""),
        errorCode: undefined
      }
    ]
  };
}

async function runVision() {
  console.log("\n===== EXPERIMENT 1: VISION (image → structured facts) =====");
  const userContent = buildVisionUserContent({
    postId: POST_ID,
    caption: CAPTION,
    imageUrl: imageDataUrl
  });
  const results: Record<string, CallResult> = {};
  for (const model of VISION_MODELS) {
    process.stdout.write(`  ${model} ... `);
    const r = await robustCall(model, prompts.vision.system, userContent, {
      maxTokens: 900,
      responseFormat: visionResponseFormat,
      temperature: 0.1
    });
    // Render via the real renderer when structured parse works.
    let rendered = r.text;
    try {
      rendered = renderVisionDescription(POST_ID, parseStructuredVision(r.text));
    } catch {
      /* keep raw */
    }
    const cost = r.costUsd ?? costFromTokens(model, r.promptTokens, r.completionTokens);
    results[model] = { ...r, text: rendered, costUsd: cost };
    console.log(
      r.ok
        ? `ok [${r.tier}] ${r.latencyMs}ms in=${r.promptTokens} out=${r.completionTokens} ${fmtUsd(cost)}`
        : `FAILED: ${r.error}`
    );
    fs.writeFileSync(
      path.join(OUT_DIR, `exp1-vision-${model.replace(/\//g, "_")}.json`),
      JSON.stringify({ model, rendered, ...r, costUsd: cost }, null, 2)
    );
  }
  return results;
}

async function runReasoning(
  label: string,
  fileTag: string,
  withImage: boolean,
  visionText: string
) {
  console.log(`\n===== ${label} =====`);
  const ctx = buildReasoningContext(visionText, withImage);
  const ctxJson = JSON.stringify(ctx, null, 2);
  const results: Record<string, CallResult> = {};
  for (const model of REASONING_MODELS) {
    process.stdout.write(`  ${model} ... `);
    const userMsg = withImage
      ? [
          { type: "text", text: ctxJson },
          { type: "image_url", image_url: { url: imageDataUrl } }
        ]
      : ctxJson;
    const r = await robustCall(model, reportStandardPrompt.system, userMsg, {
      maxTokens: 16000,
      responseFormat: reportResponseFormat(REQUIRED_SECTIONS.standard),
      reasoning: { enabled: true, exclude: true },
      temperature: 0.2
    });
    const cost = r.costUsd ?? costFromTokens(model, r.promptTokens, r.completionTokens);
    results[model] = { ...r, costUsd: cost };
    console.log(
      r.ok
        ? `ok [${r.tier}] ${r.latencyMs}ms in=${r.promptTokens} out=${r.completionTokens} reason=${r.reasoningTokens ?? "?"} ${fmtUsd(cost)}`
        : `FAILED: ${r.error}`
    );
    fs.writeFileSync(
      path.join(OUT_DIR, `${fileTag}-${model.replace(/\//g, "_")}.json`),
      JSON.stringify({ model, withImage, ...r, costUsd: cost }, null, 2)
    );
  }
  return results;
}

async function main() {
  await loadPricing();
  console.log(
    "image bytes:",
    imageB64.length,
    "b64 chars; models priced:",
    Object.keys(pricing).length
  );

  const vision = await runVision();

  // Freeze the production-representative vision text (current prod uses gemini-flash).
  const frozen =
    vision["google/gemini-2.5-flash"]?.text ||
    vision["anthropic/claude-opus-4.8"]?.text ||
    vision["openai/gpt-5.5"]?.text ||
    "[Image ID: TEST_POST_1] (vision unavailable)";
  fs.writeFileSync(path.join(OUT_DIR, "frozen-vision.txt"), frozen);
  console.log(
    "\n--- Frozen shared vision text (from gemini-2.5-flash) ---\n" + frozen.slice(0, 600)
  );

  await runReasoning("EXPERIMENT 2: REASONING (text-only vision)", "exp2-textonly", false, frozen);

  await runReasoning(
    "EXPERIMENT 3: REASONING (vision text + ACTUAL IMAGE attached)",
    "exp3-withimage",
    true,
    frozen
  );

  console.log("\nAll results saved to", OUT_DIR);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
