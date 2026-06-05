/**
 * Clean, uniform reasoning re-run: identical settings for all 3 models so the
 * QUALITY comparison is apples-to-apples.
 *   - reasoning {enabled, exclude:true}
 *   - NO response_format (project schemas use minItems/maxItems which OpenAI
 *     strict mode rejects; all models then emit [[SECTION]] prose anyway)
 *   - retry-on-empty (handles transient OpenRouter/OpenAI blips)
 *   - Exp2 = text-only vision; Exp3 = vision text + ACTUAL image attached
 */
import fs from "node:fs";
import path from "node:path";
import { reportStandardPrompt } from "../src/prompts/report.standard.v1.js";

const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY) throw new Error("set OPENROUTER_API_KEY");

const OUT_DIR = "/tmp/bakeoff-results";
fs.mkdirSync(OUT_DIR, { recursive: true });
const imageDataUrl = `data:image/jpeg;base64,${fs.readFileSync("/tmp/bakeoff.jpg").toString("base64")}`;
const frozenVision = fs.readFileSync(path.join(OUT_DIR, "frozen-vision.txt"), "utf8");

const MODELS = ["openai/gpt-5.5", "anthropic/claude-opus-4.8", "google/gemini-2.5-pro"];
const POST_ID = "TEST_POST_1";
const POST_URL = "https://www.instagram.com/p/TEST_POST_1/";
const CAPTION = "Лучшие прогулки — вдоль моря 🤍 #сочи #морвокзал";

function buildContext(visionText: string, withImageNote: boolean) {
  const likes = 1240,
    comments = 38,
    followers = 8400;
  return {
    task: "generate_report",
    language: "ru",
    mode: "standard",
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
      isVerified: false,
      relatedProfiles: ["@sochi.style", "@seaside.moods"]
    },
    metrics: {
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
      topPostsByLikes: [{ postId: POST_ID, url: POST_URL, likesCount: likes }],
      postTypeDistribution: { Image: 1 },
      hashtagFrequency: { сочи: 1, морвокзал: 1 }
    },
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
        pinned: false,
        location: "Морской вокзал, Сочи",
        caption: CAPTION,
        likes,
        comments,
        hashtags: ["сочи", "морвокзал"],
        mentions: [],
        taggedUsers: [],
        latestComments: [
          { ownerUsername: "marina_k", text: "Какая вы пара красивая 😍" },
          { ownerUsername: "denis.s", text: "Сочи топ! Где это место?" },
          { ownerUsername: "lera_99", text: "Кофта огонь, откуда?" }
        ]
      }
    ],
    vision: [
      {
        postId: POST_ID,
        status: "completed",
        description:
          visionText + (withImageNote ? "\n[Оригинал изображения поста приложен к запросу.]" : ""),
        errorCode: undefined
      }
    ]
  };
}

type Res = {
  ok: boolean;
  text: string;
  attempts: number;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
  error?: string;
};

async function callWithRetry(
  model: string,
  system: string,
  user: unknown,
  maxTokens: number
): Promise<Res> {
  const started = Date.now();
  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    max_tokens: maxTokens,
    reasoning: { enabled: true, exclude: true },
    usage: { include: true }
  };
  let lastErr = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(240000)
      });
      const payload = (await res.json()) as any;
      if (payload.error) {
        lastErr = JSON.stringify(payload.error).slice(0, 200);
      }
      const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
      if (text) {
        return {
          ok: true,
          text,
          attempts: attempt,
          latencyMs: Date.now() - started,
          promptTokens: payload.usage?.prompt_tokens,
          completionTokens: payload.usage?.completion_tokens,
          reasoningTokens: payload.usage?.completion_tokens_details?.reasoning_tokens,
          costUsd: payload.usage?.cost
        };
      }
      lastErr = lastErr || "EMPTY";
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  return { ok: false, text: "", attempts: 4, latencyMs: Date.now() - started, error: lastErr };
}

async function runExp(tag: string, label: string, withImage: boolean) {
  console.log(`\n===== ${label} =====`);
  const ctx = JSON.stringify(buildContext(frozenVision, withImage), null, 2);
  for (const model of MODELS) {
    process.stdout.write(`  ${model} ... `);
    const user = withImage
      ? [
          { type: "text", text: ctx },
          { type: "image_url", image_url: { url: imageDataUrl } }
        ]
      : ctx;
    const r = await callWithRetry(model, reportStandardPrompt.system, user, 16000);
    console.log(
      r.ok
        ? `ok x${r.attempts} ${r.latencyMs}ms in=${r.promptTokens} out=${r.completionTokens} reason=${r.reasoningTokens ?? "?"} $${(r.costUsd ?? 0).toFixed(4)} len=${r.text.length}`
        : `FAILED: ${r.error}`
    );
    fs.writeFileSync(
      path.join(OUT_DIR, `${tag}-${model.replace(/\//g, "_")}.json`),
      JSON.stringify({ model, withImage, ...r }, null, 2)
    );
  }
}

async function main() {
  await runExp("rr-exp2", "EXP2 (text-only vision) — uniform", false);
  await runExp("rr-exp3", "EXP3 (vision text + ACTUAL image) — uniform", true);
  console.log("\nsaved to", OUT_DIR);
}
main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
