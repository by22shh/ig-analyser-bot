import { describe, expect, it } from "vitest";
import {
  detectForbiddenInferences,
  parseGroundingResponse,
  runDeterministicGrounding,
  validateEvidenceSources
} from "../../src/modules/llm/grounding.js";
import type { ReportSectionView } from "../../src/modules/reports/types.js";

const section = (over: Partial<ReportSectionView>): ReportSectionView => ({
  title: "T",
  content: "",
  sources: [],
  ...over
});

describe("validateEvidenceSources", () => {
  const catalog = [{ postId: "p1", url: "https://www.instagram.com/p/p1/" }];

  it("flags a source URL absent from the catalog", () => {
    const findings = validateEvidenceSources(
      [
        section({ title: "S", sources: [{ url: "https://www.instagram.com/p/FAKE/", label: "x" }] })
      ],
      catalog
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "fabricated_source", section: "S" });
  });

  it("does not flag a source present in the catalog", () => {
    const findings = validateEvidenceSources(
      [section({ sources: [{ url: "https://www.instagram.com/p/p1/", label: "x" }] })],
      catalog
    );
    expect(findings).toHaveLength(0);
  });

  it("matches by postId even when the URL is absent", () => {
    const findings = validateEvidenceSources(
      [section({ sources: [{ postId: "p1", label: "x" }] })],
      catalog
    );
    expect(findings).toHaveLength(0);
  });

  it("ignores sources without a url or postId", () => {
    const findings = validateEvidenceSources(
      [section({ sources: [{ label: "profile metadata" }] })],
      catalog
    );
    expect(findings).toHaveLength(0);
  });
});

describe("detectForbiddenInferences", () => {
  it("flags an asserted romantic-relationship inference (RU)", () => {
    const findings = detectForbiddenInferences([
      section({
        title: "Аудитория",
        content: "Комментарий указывает, что автор состоит в романтических отношениях."
      })
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "forbidden_inference", section: "Аудитория" });
  });

  it("flags asserted partner presence (RU)", () => {
    const findings = detectForbiddenInferences([
      section({ content: "Главный барьер — вероятное наличие у автора партнёра." })
    ]);
    expect(findings).toHaveLength(1);
  });

  it("flags asserted marital status (RU)", () => {
    const findings = detectForbiddenInferences([
      section({ content: "Судя по фото, автор замужем." })
    ]);
    expect(findings).toHaveLength(1);
  });

  it("does NOT flag a safe refusal to infer relationships (RU)", () => {
    const findings = detectForbiddenInferences([
      section({ content: "Я не утверждаю наличие отношений — это частная информация." }),
      section({ content: "Нельзя делать вывод о реальных отношениях по одному комментарию." })
    ]);
    expect(findings).toHaveLength(0);
  });

  it("flags an asserted relationship inference (EN)", () => {
    const findings = detectForbiddenInferences([
      section({ content: "She is most likely in a relationship based on the photo." })
    ]);
    expect(findings).toHaveLength(1);
  });

  it("does NOT flag an English refusal to infer a relationship", () => {
    const findings = detectForbiddenInferences([
      section({ content: "We cannot say whether she is in a relationship from public data." })
    ]);
    expect(findings).toHaveLength(0);
  });

  it("does NOT flag a quoted comment that merely mentions a couple", () => {
    const findings = detectForbiddenInferences([
      section({ content: "Подписчик пишет: «какая вы пара красивая». Это реакция комментатора." })
    ]);
    expect(findings).toHaveLength(0);
  });
});

describe("runDeterministicGrounding", () => {
  it("aggregates fabricated-source and forbidden-inference findings", () => {
    const catalog = [{ postId: "p1", url: "https://www.instagram.com/p/p1/" }];
    const sections = [
      section({
        title: "A",
        content: "Автор состоит в браке.",
        sources: [{ url: "https://www.instagram.com/p/FAKE/", label: "x" }]
      })
    ];
    const result = runDeterministicGrounding(sections, catalog);
    expect(result.findings.length).toBeGreaterThanOrEqual(2);
    expect([...new Set(result.findings.map((f) => f.kind))].sort()).toEqual([
      "fabricated_source",
      "forbidden_inference"
    ]);
  });

  it("returns no findings for a clean, well-sourced report", () => {
    const catalog = [{ postId: "p1", url: "https://www.instagram.com/p/p1/" }];
    const sections = [
      section({
        content: "Профиль публикует морские прогулки в Сочи.",
        sources: [{ url: "https://www.instagram.com/p/p1/", label: "x" }]
      })
    ];
    expect(runDeterministicGrounding(sections, catalog).findings).toHaveLength(0);
  });
});

describe("parseGroundingResponse", () => {
  it("parses LLM grounding findings", () => {
    const result = parseGroundingResponse(
      JSON.stringify({
        findings: [
          { kind: "forbidden_inference", section: "Аудитория", detail: "relationship asserted" },
          { kind: "unsupported_claim", section: "Профессия", detail: "no source" }
        ]
      })
    );
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]).toMatchObject({ kind: "forbidden_inference", section: "Аудитория" });
  });

  it("returns empty findings for malformed JSON", () => {
    expect(parseGroundingResponse("not json at all").findings).toEqual([]);
  });

  it("coerces unknown kinds to unsupported_claim and drops empty entries", () => {
    const result = parseGroundingResponse(
      JSON.stringify({
        findings: [
          { kind: "weird", section: "X", detail: "y" },
          { kind: "forbidden_inference", section: "", detail: "" }
        ]
      })
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.kind).toBe("unsupported_claim");
  });
});
