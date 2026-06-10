import { describe, expect, it } from "vitest";
import { renderContentQualityFindings } from "../../src/modules/analysis/content-quality.js";
import {
  PRACTICAL_REQUIREMENTS,
  PRACTICAL_CONTEXT_INSTRUCTION_EN,
  PRACTICAL_SECTIONS_GUIDANCE_EN
} from "../../src/prompts/practical-requirements.js";
import { reportStandardPrompt } from "../../src/prompts/report.standard.v1.js";
import { sectionGuidesForMode } from "../../src/prompts/section-guides.js";

describe("practical requirements constants", () => {
  it("embeds the shared guidance into the standard report prompt", () => {
    expect(reportStandardPrompt.system).toContain(PRACTICAL_SECTIONS_GUIDANCE_EN);
  });

  it("keeps Russian section guides in sync with the shared minimums", () => {
    const guides = sectionGuidesForMode("standard");
    expect(guides["Триггеры и зацепки"]).toContain(
      `Не меньше ${PRACTICAL_REQUIREMENTS.minHooks} конкретных безопасных зацепок`
    );
    expect(guides["Готовые фразы для входа в диалог"]).toContain(
      `Не меньше ${PRACTICAL_REQUIREMENTS.minReadyPhrases} готовых вступительных фраз`
    );
    expect(guides["Коммуникационные рекомендации"]).toContain(
      `${PRACTICAL_REQUIREMENTS.nextStepsMin}–${PRACTICAL_REQUIREMENTS.nextStepsMax} уважительных next steps`
    );
  });

  it("keeps repair hints in sync with the shared minimums", () => {
    const rendered = renderContentQualityFindings([
      { id: "content:weak_practical_detail", severity: "medium", detail: "detail" }
    ]);
    expect(rendered[0]).toContain(
      `at least ${PRACTICAL_REQUIREMENTS.minHooks} evidence-tied hooks`
    );
    expect(rendered[0]).toContain(
      `${PRACTICAL_REQUIREMENTS.nextStepsMin}-${PRACTICAL_REQUIREMENTS.nextStepsMax} respectful next steps`
    );
  });

  it("derives the context instruction from the shared minimums", () => {
    expect(PRACTICAL_CONTEXT_INSTRUCTION_EN).toContain(`${PRACTICAL_REQUIREMENTS.minHooks}+ hooks`);
    expect(PRACTICAL_CONTEXT_INSTRUCTION_EN).toContain(
      `${PRACTICAL_REQUIREMENTS.minReadyPhrases}+ neutral ready-to-send phrases`
    );
  });
});
