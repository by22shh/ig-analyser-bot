import type { ReportSource } from "../reports/types.js";
import type { JsonSchemaResponseFormat } from "./request.js";

export type StructuredVisionOutput = {
  visibleFacts: string[];
  setting: string | null;
  objects: string[];
  textOverlays: string[];
  visualStyle: string[];
  uncertainty: string[];
};

export type StructuredReportEvidence = {
  postId: string | null;
  url: string | null;
  label: string;
  fact: string;
  confidence: "low" | "medium" | "high";
};

export type StructuredReportSection = {
  title: string;
  content: string;
  evidence: StructuredReportEvidence[];
  confidence: "low" | "medium" | "high";
  caveats: string[];
};

export type StructuredReportOutput = {
  summaryBullets: string[];
  sections: StructuredReportSection[];
};

export const visionResponseFormat: JsonSchemaResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "instagram_post_visual_facts",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        visibleFacts: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 8,
          description: "Concrete visible facts from the public image or caption context."
        },
        setting: {
          type: ["string", "null"],
          description: "Visible public setting or scene, or null when not inferable."
        },
        objects: {
          type: "array",
          items: { type: "string" },
          maxItems: 10,
          description: "Visible objects, products, places, or visual elements."
        },
        textOverlays: {
          type: "array",
          items: { type: "string" },
          maxItems: 6,
          description: "Readable text visible in the image, if any."
        },
        visualStyle: {
          type: "array",
          items: { type: "string" },
          maxItems: 6,
          description: "Observable style signals such as composition, palette, production value."
        },
        uncertainty: {
          type: "array",
          items: { type: "string" },
          maxItems: 5,
          description: "What cannot be confirmed from the public image."
        }
      },
      required: ["visibleFacts", "setting", "objects", "textOverlays", "visualStyle", "uncertainty"]
    }
  }
};

export function reportResponseFormat(
  requiredSections: readonly string[] = []
): JsonSchemaResponseFormat {
  const sectionsDescription = requiredSections.length
    ? `Return exactly these section titles in order: ${requiredSections.join(" | ")}.`
    : "Return the required report sections in order.";
  return {
    type: "json_schema",
    json_schema: {
      name: "instagram_profile_report",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          summaryBullets: {
            type: "array",
            items: { type: "string" },
            minItems: 3,
            maxItems: 5,
            description: "Most useful practical findings, each grounded in supplied evidence."
          },
          sections: {
            type: "array",
            description: sectionsDescription,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                content: {
                  type: "string",
                  description:
                    "Section body in the requested language. Mention uncertainty and avoid unsupported claims."
                },
                evidence: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      postId: { type: ["string", "null"] },
                      url: { type: ["string", "null"] },
                      label: { type: "string" },
                      fact: { type: "string" },
                      confidence: { type: "string", enum: ["low", "medium", "high"] }
                    },
                    required: ["postId", "url", "label", "fact", "confidence"]
                  },
                  maxItems: 5
                },
                confidence: { type: "string", enum: ["low", "medium", "high"] },
                caveats: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 3
                }
              },
              required: ["title", "content", "evidence", "confidence", "caveats"]
            },
            minItems: requiredSections.length || 1,
            maxItems: requiredSections.length || undefined
          }
        },
        required: ["summaryBullets", "sections"]
      }
    }
  };
}

export function parseStructuredVision(text: string): StructuredVisionOutput {
  const value = parseJsonObject(text);
  return {
    visibleFacts: stringArray(value.visibleFacts).slice(0, 8),
    setting: stringOrNull(value.setting),
    objects: stringArray(value.objects).slice(0, 10),
    textOverlays: stringArray(value.textOverlays).slice(0, 6),
    visualStyle: stringArray(value.visualStyle).slice(0, 6),
    uncertainty: stringArray(value.uncertainty).slice(0, 5)
  };
}

export function renderVisionDescription(postId: string, output: StructuredVisionOutput): string {
  const lines = [
    `[Image ID: ${postId}]`,
    ...output.visibleFacts.map((item) => `- Visible fact: ${item}`)
  ];
  if (output.setting) lines.push(`- Setting: ${output.setting}`);
  if (output.objects.length) lines.push(`- Objects/signals: ${output.objects.join(", ")}`);
  if (output.textOverlays.length) lines.push(`- Text in image: ${output.textOverlays.join(" | ")}`);
  if (output.visualStyle.length) lines.push(`- Visual style: ${output.visualStyle.join(", ")}`);
  if (output.uncertainty.length) lines.push(`- Uncertainty: ${output.uncertainty.join("; ")}`);
  return lines.join("\n");
}

export function parseStructuredReport(text: string): StructuredReportOutput {
  const value = parseJsonObject(text);
  const sections = Array.isArray(value.sections) ? value.sections : [];
  const normalizedSections = sections
    .map(normalizeSection)
    .filter((section) => section.title && section.content);
  if (!normalizedSections.length) throw new Error("STRUCTURED_REPORT_PARSE_FAILED");
  return {
    summaryBullets: stringArray(value.summaryBullets).slice(0, 5),
    sections: normalizedSections
  };
}

export function renderStructuredReport(output: StructuredReportOutput): string {
  return output.sections
    .map((section) => {
      const parts = ["[[SECTION]]", section.title, section.content.trim()];
      if (section.evidence.length) {
        parts.push(
          "Evidence:",
          ...section.evidence.map((item, index) => {
            const source = item.url ?? item.postId ?? "profile metadata";
            const post = item.postId ? `[${item.postId}] ` : "";
            return `- ${post}${item.label || `Source ${index + 1}`}: ${item.fact} (${item.confidence}) ${source}`;
          })
        );
      }
      parts.push(`Confidence: ${section.confidence}`);
      if (section.caveats.length) {
        parts.push("Caveats:", ...section.caveats.map((item) => `- ${item}`));
      }
      return parts.join("\n");
    })
    .join("\n\n");
}

export function sourcesFromStructuredReport(output: StructuredReportOutput): ReportSource[] {
  return output.sections.flatMap((section) =>
    section.evidence.map((item) => ({
      postId: item.postId ?? undefined,
      url: item.url ?? undefined,
      label: item.label || section.title
    }))
  );
}

function normalizeSection(value: unknown): StructuredReportSection {
  const record = asRecord(value);
  const evidence = Array.isArray(record.evidence) ? record.evidence : [];
  return {
    title: stringValue(record.title),
    content: stringValue(record.content),
    evidence: evidence
      .map(normalizeEvidence)
      .filter((item) => item.fact || item.url || item.postId),
    confidence: confidenceValue(record.confidence),
    caveats: stringArray(record.caveats).slice(0, 3)
  };
}

function normalizeEvidence(value: unknown): StructuredReportEvidence {
  const record = asRecord(value);
  return {
    postId: stringOrNull(record.postId),
    url: stringOrNull(record.url),
    label: stringValue(record.label),
    fact: stringValue(record.fact),
    confidence: confidenceValue(record.confidence)
  };
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  try {
    return asRecord(JSON.parse(trimmed));
  } catch {
    try {
      const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
      if (fenced) return asRecord(JSON.parse(fenced));
      const object = trimmed.match(/\{[\s\S]*\}/)?.[0];
      if (object) return asRecord(JSON.parse(object));
    } catch {
      // Fall through to the normalized error below.
    }
    throw new Error("STRUCTURED_JSON_PARSE_FAILED");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
    : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringOrNull(value: unknown): string | null {
  const string = stringValue(value);
  return string ? string : null;
}

function confidenceValue(value: unknown): "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}
