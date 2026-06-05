/**
 * End-to-end smoke of the REAL reasoning path after the v2 changes:
 * OpenRouterLlmProvider.generateReport (gpt-5.5, structured, no temperature,
 * reasoning.effort) → parse sections → verifyGrounding (LLM pass) →
 * deterministic grounding. Confirms the wiring, not just the mocks.
 *
 * Usage: OPENROUTER_API_KEY=… npx tsx scripts/smoke-reasoning.ts
 */
import { OpenRouterLlmProvider } from "../src/modules/llm/openrouter.adapter.js";
import { computeReportMetrics } from "../src/modules/reports/metrics.js";
import { parseReportSections, validateRequiredSections } from "../src/modules/reports/parser.js";
import { runDeterministicGrounding } from "../src/modules/llm/grounding.js";
import { env } from "../src/config/env.js";
import type { InstagramPost, InstagramProfile } from "../src/modules/instagram/types.js";

const post: InstagramPost = {
  id: "P1",
  type: "Image",
  caption: "Лучшие прогулки — вдоль моря 🤍 #сочи #морвокзал",
  hashtags: ["сочи", "морвокзал"],
  mentions: [],
  likesCount: 1240,
  commentsCount: 38,
  latestComments: [
    { ownerUsername: "marina_k", text: "Какая вы пара красивая 😍" },
    { ownerUsername: "denis.s", text: "Сочи топ! Где это место?" },
    { ownerUsername: "lera_99", text: "Кофта огонь, откуда?" }
  ],
  timestamp: "2026-05-30T15:20:00.000Z",
  url: "https://www.instagram.com/p/P1/",
  location: { name: "Морской вокзал, Сочи" },
  isPinned: false,
  childPosts: [],
  taggedUsers: []
};
const profile: InstagramProfile = {
  username: "alina.mood",
  fullName: "Alina",
  biography: "Сочи 🌊 | кофе, закаты, прогулки | fashion lover",
  followersCount: 8400,
  followsCount: 612,
  postsCount: 143,
  isVerified: false,
  relatedProfiles: ["@sochi.style", "@seaside.moods"],
  posts: [post]
};

async function main() {
  console.log("MODEL_REASONING:", env.MODEL_REASONING, "effort:", env.MODEL_REASONING_EFFORT);
  console.log("MODEL_GROUNDING:", env.MODEL_GROUNDING, "grounding check:", env.LLM_GROUNDING_CHECK);
  const llm = new OpenRouterLlmProvider();
  const metrics = computeReportMetrics(profile, profile.posts);

  const started = Date.now();
  const report = await llm.generateReport({
    mode: "standard",
    language: "ru",
    profile,
    posts: profile.posts,
    vision: [
      {
        postId: "P1",
        status: "completed",
        description:
          "[Image ID: P1]\n- Visible fact: two people on a seafront promenade, lighthouse behind.\n- Text (verbatim): AUTOMNE-H | FALL/WINTER 24-25 COLLECTION | Heavy Cotton\n- Note: likely a screenshot/repost, not an original upload.",
        model: "google/gemini-2.5-flash",
        promptVersion: "vision.detail.v3"
      }
    ],
    metrics,
    goal: "Понять человека и найти заходы для знакомства/диалога"
  });
  console.log(
    `\ngenerateReport: model=${report.model} in ${Date.now() - started}ms, ${report.rawText.length} chars`
  );

  const sections = parseReportSections(report.rawText, "standard");
  const missing = validateRequiredSections("standard", sections);
  console.log(
    `parsed sections: ${sections.length} | [[SECTION]] markers: ${report.rawText.includes("[[SECTION]]") || sections.length > 1} | missing required: ${missing.length}`
  );
  console.log("section titles:", sections.map((s) => s.title).slice(0, 20));

  const det = runDeterministicGrounding(
    sections,
    profile.posts.map((p) => ({ postId: p.id, url: p.url }))
  );
  console.log(`\ndeterministic grounding findings: ${det.findings.length}`, det.findings);

  const grounded = await llm.verifyGrounding({
    language: "ru",
    sections,
    sourceCatalog: profile.posts.map((p) => ({ postId: p.id, url: p.url }))
  });
  console.log(`LLM grounding findings: ${grounded.findings.length}`, grounded.findings.slice(0, 6));

  // Surface whether the report mentions the couple safely (must NOT assert a relationship).
  const audience = sections.find((s) => s.title.includes("Аудитория"));
  if (audience) console.log("\n[Аудитория excerpt]:", audience.content.slice(0, 280));
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
