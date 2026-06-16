import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { chromium } from "playwright";

export const smokeStepIds = [
  "telegram",
  "yookassa",
  "openrouter",
  "apify",
  "facecheck",
  "s3",
  "pdf"
] as const;

export type SmokeStepId = (typeof smokeStepIds)[number];
export type SmokeMode = "dry-run" | "live";
export type SmokeStatus = "pass" | "fail" | "skip";

export type ProviderSmokeOptions = {
  mode: SmokeMode;
  staging: boolean;
  steps: SmokeStepId[];
};

export type SmokeStepResult = {
  step: SmokeStepId;
  status: SmokeStatus;
  summary: string;
  details: string[];
};

export type SmokeRunResult = {
  mode: SmokeMode;
  staging: boolean;
  results: SmokeStepResult[];
};

type SmokeStepDefinition = {
  id: SmokeStepId;
  title: string;
  requiredEnv: string[];
  dryRunDetails: string[];
  live: (env: NodeJS.ProcessEnv) => Promise<SmokeStepResult>;
};

const defaultOptions: ProviderSmokeOptions = {
  mode: "dry-run",
  staging: false,
  steps: [...smokeStepIds]
};

const secretEnvKeys = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "YOOKASSA_SECRET_KEY",
  "OPENROUTER_API_KEY",
  "APIFY_TOKEN",
  "FACECHECK_API_TOKEN",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY"
];

const secretShapePattern =
  /(xox[baprs]-[A-Za-z0-9-]+|gh[pousr]_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+|AKIA[0-9A-Z]{16}|bot[0-9]+:[A-Za-z0-9_-]{20,})/g;

const stepDefinitions: Record<SmokeStepId, SmokeStepDefinition> = {
  telegram: {
    id: "telegram",
    title: "Telegram webhook config",
    requiredEnv: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_URL", "TELEGRAM_WEBHOOK_SECRET"],
    dryRunDetails: [
      "would validate webhook URL shape and secret-token presence",
      "would call getWebhookInfo without mutating webhook config"
    ],
    live: checkTelegram
  },
  yookassa: {
    id: "yookassa",
    title: "YooKassa test payment metadata",
    requiredEnv: [
      "YOOKASSA_SHOP_ID",
      "YOOKASSA_SECRET_KEY",
      "YOOKASSA_RETURN_URL",
      "YOOKASSA_API_BASE_URL"
    ],
    dryRunDetails: [
      "would create a 1 RUB test payment with smoke metadata",
      "would verify idempotence key and metadata round-trip"
    ],
    live: checkYooKassa
  },
  openrouter: {
    id: "openrouter",
    title: "OpenRouter structured/fallback contract",
    requiredEnv: ["OPENROUTER_API_KEY"],
    dryRunDetails: [
      "would send a tiny structured JSON request",
      "would retry without response_format if the provider rejects structured output"
    ],
    live: checkOpenRouter
  },
  apify: {
    id: "apify",
    title: "Apify actor and dataset contract",
    requiredEnv: ["APIFY_TOKEN", "APIFY_SMOKE_DATASET_ID"],
    dryRunDetails: [
      "would read apify~instagram-scraper actor metadata",
      "would read a configured staging dataset sample without starting a paid actor run"
    ],
    live: checkApify
  },
  facecheck: {
    id: "facecheck",
    title: "FaceCheck mode boundary",
    requiredEnv: ["FACECHECK_TESTING_MODE"],
    dryRunDetails: [
      "would verify test/demo mode boundary",
      "would require FACECHECK_API_TOKEN only when real photo search is explicitly enabled"
    ],
    live: checkFaceCheck
  },
  s3: {
    id: "s3",
    title: "S3 signed URL contract",
    requiredEnv: ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
    dryRunDetails: [
      "would construct an S3 client with staging credentials",
      "would generate a presigned GET URL for a smoke key without printing credentials"
    ],
    live: checkS3
  },
  pdf: {
    id: "pdf",
    title: "PDF render dependency",
    requiredEnv: [],
    dryRunDetails: [
      "would launch Playwright Chromium",
      "would render a minimal PDF buffer and close the browser"
    ],
    live: checkPdf
  }
};

export function parseSmokeArgs(args: string[]): ProviderSmokeOptions {
  const options: ProviderSmokeOptions = { ...defaultOptions, steps: [...defaultOptions.steps] };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--dry-run") {
      options.mode = "dry-run";
      continue;
    }
    if (arg === "--live") {
      options.mode = "live";
      continue;
    }
    if (arg === "--staging") {
      options.staging = true;
      continue;
    }
    if (arg === "--step" || arg === "--steps" || arg === "--only") {
      options.steps = parseSteps(args[++index]);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      throw new SmokeHelpRequested();
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.mode === "live" && !options.staging) {
    throw new Error("Live smoke requires explicit --staging opt-in");
  }

  return options;
}

export async function runProviderContractSmoke(
  options: ProviderSmokeOptions,
  env: NodeJS.ProcessEnv = process.env
): Promise<SmokeRunResult> {
  const results: SmokeStepResult[] = [];
  for (const step of options.steps) {
    const definition = stepDefinitions[step];
    if (options.mode === "dry-run") {
      results.push({
        step,
        status: "pass",
        summary: `${definition.title} dry-run planned`,
        details: [
          `required env for live: ${definition.requiredEnv.length ? definition.requiredEnv.join(", ") : "none"}`,
          ...definition.dryRunDetails
        ]
      });
      continue;
    }

    const missing = missingRequiredEnv(definition.requiredEnv, env);
    if (missing.length > 0) {
      results.push({
        step,
        status: "fail",
        summary: `${definition.title} refused before live call`,
        details: [`missing env: ${missing.join(", ")}`]
      });
      continue;
    }

    try {
      results.push(await definition.live(env));
    } catch (error) {
      results.push({
        step,
        status: "fail",
        summary: `${definition.title} failed`,
        details: [error instanceof Error ? error.message : String(error)]
      });
    }
  }

  return { mode: options.mode, staging: options.staging, results };
}

export function formatSmokeReport(
  result: SmokeRunResult,
  env: NodeJS.ProcessEnv = process.env
): string {
  const totals = summarizeResults(result.results);
  const lines = [
    `Provider contract smoke (mode=${result.mode}, staging=${result.staging ? "yes" : "no"}, steps=${result.results.length})`
  ];
  for (const item of result.results) {
    lines.push(`${item.status.toUpperCase()} ${item.step}: ${item.summary}`);
    for (const detail of item.details) {
      lines.push(`  - ${detail}`);
    }
  }
  lines.push(`Summary: pass=${totals.pass} fail=${totals.fail} skip=${totals.skip}`);
  return redactSmokeText(lines.join("\n"), env);
}

export function redactSmokeText(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let redacted = text;
  for (const key of secretEnvKeys) {
    const value = env[key];
    if (value && value.length >= 4) {
      redacted = redacted.split(value).join(`[REDACTED_${key}]`);
    }
  }
  return redacted.replace(secretShapePattern, "[REDACTED_SECRET]");
}

export class SmokeHelpRequested extends Error {
  constructor() {
    super("SMOKE_HELP_REQUESTED");
  }
}

function parseSteps(value: string | undefined): SmokeStepId[] {
  if (!value) throw new Error("--step requires a comma-separated value");
  const steps = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!steps.length) throw new Error("--step requires at least one step");
  for (const step of steps) {
    if (!smokeStepIds.includes(step as SmokeStepId)) {
      throw new Error(`Unknown smoke step: ${step}`);
    }
  }
  return steps as SmokeStepId[];
}

function missingRequiredEnv(keys: string[], env: NodeJS.ProcessEnv): string[] {
  return keys.filter((key) => !env[key]?.trim());
}

function summarizeResults(results: SmokeStepResult[]) {
  return results.reduce(
    (accumulator, result) => {
      accumulator[result.status] += 1;
      return accumulator;
    },
    { pass: 0, fail: 0, skip: 0 } satisfies Record<SmokeStatus, number>
  );
}

function pass(step: SmokeStepId, summary: string, details: string[] = []): SmokeStepResult {
  return { step, status: "pass", summary, details };
}

function fail(step: SmokeStepId, summary: string, details: string[] = []): SmokeStepResult {
  return { step, status: "fail", summary, details };
}

async function checkTelegram(env: NodeJS.ProcessEnv): Promise<SmokeStepResult> {
  assertHttpsUrl("TELEGRAM_WEBHOOK_URL", env.TELEGRAM_WEBHOOK_URL);
  const apiRoot = env.TELEGRAM_API_ROOT || "https://api.telegram.org";
  const response = await fetch(
    `${apiRoot.replace(/\/$/, "")}/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`,
    {
      signal: AbortSignal.timeout(15000)
    }
  );
  if (!response.ok)
    return fail("telegram", "Telegram getWebhookInfo failed", [`status=${response.status}`]);
  return pass("telegram", "Telegram webhook contract reachable", [
    "getWebhookInfo returned HTTP 200",
    "webhook URL is HTTPS",
    "webhook secret is configured"
  ]);
}

async function checkYooKassa(env: NodeJS.ProcessEnv): Promise<SmokeStepResult> {
  if (env.YOOKASSA_TEST_MODE !== "true" && env.YOOKASSA_TEST_MODE !== "1") {
    return fail("yookassa", "YooKassa live smoke requires test mode", [
      "set YOOKASSA_TEST_MODE=true in staging"
    ]);
  }
  assertHttpsUrl("YOOKASSA_RETURN_URL", env.YOOKASSA_RETURN_URL);
  const idempotenceKey = `smoke:${randomUUID()}`;
  const payload = {
    amount: { value: "1.00", currency: "RUB" },
    capture: true,
    confirmation: { type: "redirect", return_url: env.YOOKASSA_RETURN_URL },
    description: "staging provider contract smoke",
    metadata: { smoke: "provider-contract", source: "codex" }
  };
  const response = await fetch(`${(env.YOOKASSA_API_BASE_URL ?? "").replace(/\/$/, "")}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString("base64")}`,
      "Content-Type": "application/json",
      "Idempotence-Key": idempotenceKey
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok)
    return fail("yookassa", "YooKassa payment create failed", [`status=${response.status}`]);
  const body = (await response.json()) as { id?: string; metadata?: Record<string, string> };
  if (body.metadata?.smoke !== "provider-contract") {
    return fail("yookassa", "YooKassa metadata round-trip failed");
  }
  return pass("yookassa", "YooKassa test payment contract passed", [
    "created test payment",
    "metadata round-trip confirmed"
  ]);
}

async function checkOpenRouter(env: NodeJS.ProcessEnv): Promise<SmokeStepResult> {
  const model = env.MODEL_REASONING || "x-ai/grok-4.3";
  const structuredBody = {
    model,
    messages: [
      { role: "system", content: "Return only JSON for a provider contract smoke." },
      { role: "user", content: 'Return {"ok":true}.' }
    ],
    max_tokens: 40,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "smoke_response",
        strict: true,
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
          additionalProperties: false
        }
      }
    }
  };
  const structured = await openRouterRequest(env.OPENROUTER_API_KEY ?? "", structuredBody);
  if (structured.ok) {
    return pass("openrouter", "OpenRouter structured contract passed", [`model=${model}`]);
  }

  const fallback = await openRouterRequest(env.OPENROUTER_API_KEY ?? "", {
    model,
    messages: [{ role: "user", content: "Reply with OK for provider contract smoke." }],
    max_tokens: 20
  });
  if (!fallback.ok) {
    return fail("openrouter", "OpenRouter structured and fallback calls failed", [
      `structured_status=${structured.status}`,
      `fallback_status=${fallback.status}`
    ]);
  }
  return pass("openrouter", "OpenRouter fallback contract passed", [
    `structured_status=${structured.status}`,
    `model=${model}`
  ]);
}

async function checkApify(env: NodeJS.ProcessEnv): Promise<SmokeStepResult> {
  const headers = { Authorization: `Bearer ${env.APIFY_TOKEN}` };
  const actor = await fetch("https://api.apify.com/v2/acts/apify~instagram-scraper", {
    headers,
    signal: AbortSignal.timeout(15000)
  });
  if (!actor.ok)
    return fail("apify", "Apify actor metadata check failed", [`status=${actor.status}`]);
  const dataset = await fetch(
    `https://api.apify.com/v2/datasets/${env.APIFY_SMOKE_DATASET_ID}/items?clean=true&limit=1`,
    { headers, signal: AbortSignal.timeout(15000) }
  );
  if (!dataset.ok)
    return fail("apify", "Apify dataset sample check failed", [`status=${dataset.status}`]);
  return pass("apify", "Apify actor and dataset contracts passed", [
    "actor metadata reachable",
    "staging dataset sample reachable"
  ]);
}

async function checkFaceCheck(env: NodeJS.ProcessEnv): Promise<SmokeStepResult> {
  const testingMode = env.FACECHECK_TESTING_MODE === "true" || env.FACECHECK_TESTING_MODE === "1";
  const photoSearchEnabled =
    env.FEATURE_PHOTO_SEARCH === "true" || env.FEATURE_PHOTO_SEARCH === "1";
  if (testingMode) {
    return pass("facecheck", "FaceCheck staging boundary is in testing mode", [
      "no live upload performed",
      "real token not required while FACECHECK_TESTING_MODE=true"
    ]);
  }
  if (photoSearchEnabled && !env.FACECHECK_API_TOKEN?.trim()) {
    return fail("facecheck", "FaceCheck real mode requires FACECHECK_API_TOKEN");
  }
  return pass("facecheck", "FaceCheck real-mode boundary configured", [
    photoSearchEnabled ? "photo search enabled with token present" : "photo search disabled"
  ]);
}

async function checkS3(env: NodeJS.ProcessEnv): Promise<SmokeStepResult> {
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT || undefined,
    region: env.S3_REGION || "auto",
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? ""
    }
  });
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: "smoke/provider-contract.txt" }),
    { expiresIn: 60 }
  );
  if (!url.startsWith("http")) return fail("s3", "S3 signed URL did not produce an HTTP URL");
  return pass("s3", "S3 signed URL contract passed", ["generated 60s presigned GET URL"]);
}

async function checkPdf(): Promise<SmokeStepResult> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<html><body><h1>Smoke</h1></body></html>", { waitUntil: "load" });
    const bytes = await page.pdf({ format: "A4" });
    if (bytes.length <= 0) return fail("pdf", "PDF render returned empty buffer");
    return pass("pdf", "PDF render dependency passed", [`bytes=${bytes.length}`]);
  } finally {
    await browser.close();
  }
}

async function openRouterRequest(
  apiKey: string,
  body: unknown
): Promise<{ ok: boolean; status: number }> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  return { ok: response.ok, status: response.status };
}

function assertHttpsUrl(name: string, value: string | undefined): void {
  if (!value) throw new Error(`${name} is required`);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error(`${name} must be HTTPS`);
}

function helpText(): string {
  return `Usage: pnpm smoke:staging -- [--dry-run|--live --staging] [--step telegram,yookassa,openrouter,apify,facecheck,s3,pdf]

Defaults to --dry-run and performs no network, storage or browser calls.
Live mode requires --live --staging and validates required environment variables before each provider call.`;
}

async function cli(): Promise<void> {
  let options: ProviderSmokeOptions;
  try {
    options = parseSmokeArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof SmokeHelpRequested) {
      console.log(helpText());
      return;
    }
    throw error;
  }

  const result = await runProviderContractSmoke(options);
  console.log(formatSmokeReport(result));
  if (result.results.some((item) => item.status === "fail")) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  cli().catch((error) => {
    console.error(redactSmokeText(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
