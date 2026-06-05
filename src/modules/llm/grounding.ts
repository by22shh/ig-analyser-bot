import type { ReportSectionView } from "../reports/types.js";
import type { JsonSchemaResponseFormat } from "./request.js";

export type GroundingFindingKind =
  | "fabricated_source"
  | "forbidden_inference"
  | "unsupported_claim";

export type GroundingFinding = {
  kind: GroundingFindingKind;
  section: string;
  detail: string;
};

export type GroundingResult = { findings: GroundingFinding[] };

export type SourceCatalogEntry = { postId?: string; url?: string };

/**
 * Flags evidence citations whose URL/postId is NOT present in the supplied
 * source catalog — i.e. a fabricated/hallucinated source. Sources without any
 * url or postId (e.g. "profile metadata") are ignored, not flagged.
 */
export function validateEvidenceSources(
  sections: ReportSectionView[],
  catalog: SourceCatalogEntry[]
): GroundingFinding[] {
  const knownUrls = new Set(
    catalog.map((entry) => normalizeUrl(entry.url)).filter((url): url is string => Boolean(url))
  );
  const knownIds = new Set(
    catalog.map((entry) => entry.postId).filter((id): id is string => Boolean(id))
  );

  const findings: GroundingFinding[] = [];
  for (const section of sections) {
    for (const source of section.sources) {
      const hasUrl = Boolean(source.url);
      const hasId = Boolean(source.postId);
      if (!hasUrl && !hasId) continue;
      const urlOk = hasUrl ? knownUrls.has(normalizeUrl(source.url) ?? "") : false;
      const idOk = hasId ? knownIds.has(source.postId ?? "") : false;
      if (!urlOk && !idOk) {
        findings.push({
          kind: "fabricated_source",
          section: section.title,
          detail: source.url ?? source.postId ?? ""
        });
      }
    }
  }
  return findings;
}

// `\b`/`\w` are ASCII-only in JS regex, so Cyrillic word boundaries use unicode
// property escapes with the `u` flag instead.
const NEGATION =
  /(?<![\p{L}])(?:не|нельзя|невозможно)(?![\p{L}])|без\s+подтвержд|without\s+confirm|(?<![a-z])(?:cannot|can'?t|not|no|don'?t|won'?t|unconfirmed|refuse)(?![a-z])/iu;

const FORBIDDEN_PATTERNS: Array<{ re: RegExp; label: string }> = [
  {
    re: /состои[\p{L}]*\s+в\s+(?:[\p{L}]+\s+){0,3}отношени[\p{L}]+/iu,
    label: "relationship status"
  },
  { re: /в\s+романтическ[\p{L}]+\s+отношени[\p{L}]+/iu, label: "relationship status" },
  {
    re: /наличи[\p{L}]+\s+(?:у\s+[\p{L}]+\s+)?партн[её]р[\p{L}]*/iu,
    label: "partner presence"
  },
  { re: /(?<![\p{L}])(?:замужем|женат|в\s+браке)(?![\p{L}])/iu, label: "marital status" },
  { re: /есть\s+(?:парень|муж|жена|девушка)(?![\p{L}])/iu, label: "partner presence" },
  {
    re: /(?:её|ее|его)\s+(?:муж|жена|партн[её]р|парень|девушка)(?![\p{L}])/iu,
    label: "partner identity"
  },
  { re: /\bin\s+a\s+relationship\b/i, label: "relationship status" },
  { re: /\bis\s+married\b/i, label: "marital status" },
  { re: /\bhas\s+a\s+(?:boyfriend|girlfriend|husband|wife)\b/i, label: "partner presence" },
  {
    re: /\b(?:her\s+(?:husband|boyfriend)|his\s+(?:wife|girlfriend))\b/i,
    label: "partner identity"
  }
];

const NEGATION_WINDOW = 60;

/**
 * Heuristically flags sensitive inferences (relationship/marital/partner status)
 * asserted as fact. Negation-aware: a nearby refusal ("не утверждаю…",
 * "we cannot say…") suppresses the match, so safe reports that mention the topic
 * only to decline it are not flagged. Findings only *raise* the repair signal —
 * they never block delivery — and the optional LLM pass backs up missed cases.
 */
export function detectForbiddenInferences(sections: ReportSectionView[]): GroundingFinding[] {
  const findings: GroundingFinding[] = [];
  for (const section of sections) {
    const text = section.content ?? "";
    for (const { re, label } of FORBIDDEN_PATTERNS) {
      const match = re.exec(text);
      if (!match) continue;
      const start = Math.max(0, match.index - NEGATION_WINDOW);
      const end = Math.min(text.length, match.index + match[0].length + NEGATION_WINDOW);
      if (NEGATION.test(text.slice(start, end))) continue;
      findings.push({ kind: "forbidden_inference", section: section.title, detail: label });
      break; // one finding per section is enough to trigger repair
    }
  }
  return findings;
}

/** Deterministic, always-on grounding: fabricated sources + forbidden inferences. */
export function runDeterministicGrounding(
  sections: ReportSectionView[],
  catalog: SourceCatalogEntry[]
): GroundingResult {
  return {
    findings: [
      ...validateEvidenceSources(sections, catalog),
      ...detectForbiddenInferences(sections)
    ]
  };
}

/** Renders findings as short instruction lines for the repair prompt. */
export function renderGroundingFindings(findings: GroundingFinding[]): string[] {
  return findings.map((finding) => `[${finding.kind}] ${finding.section}: ${finding.detail}`);
}

/** Structured-output schema for the optional LLM grounding pass. */
export const groundingResponseFormat: JsonSchemaResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "report_grounding_findings",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        findings: {
          type: "array",
          maxItems: 20,
          description: "Sections with unsupported claims or forbidden sensitive inferences.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: {
                type: "string",
                enum: ["fabricated_source", "forbidden_inference", "unsupported_claim"]
              },
              section: { type: "string" },
              detail: { type: "string" }
            },
            required: ["kind", "section", "detail"]
          }
        }
      },
      required: ["findings"]
    }
  }
};

/** Lenient parser for the LLM grounding pass output. Never throws. */
export function parseGroundingResponse(text: string): GroundingResult {
  const parsed = tryParseJson(text);
  const raw =
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { findings?: unknown }).findings)
      ? ((parsed as { findings: unknown[] }).findings ?? [])
      : [];
  const findings: GroundingFinding[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const section = typeof record.section === "string" ? record.section.trim() : "";
    const detail = typeof record.detail === "string" ? record.detail.trim() : "";
    if (!section && !detail) continue;
    findings.push({ kind: coerceFindingKind(record.kind), section, detail });
  }
  return { findings };
}

function coerceFindingKind(value: unknown): GroundingFindingKind {
  return value === "fabricated_source" || value === "forbidden_inference"
    ? value
    : "unsupported_claim";
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced =
      trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? trimmed.match(/\{[\s\S]*\}/)?.[0];
    if (!fenced) return undefined;
    try {
      return JSON.parse(fenced);
    } catch {
      return undefined;
    }
  }
}

function normalizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.trim().replace(/\/+$/, "");
}
