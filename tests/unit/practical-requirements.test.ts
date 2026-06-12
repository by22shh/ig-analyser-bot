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
      `Дай ${PRACTICAL_REQUIREMENTS.minHooks} конкретные безопасные зацепки`
    );
    expect(guides["Готовые фразы для входа в диалог"]).toContain(
      `Дай ${PRACTICAL_REQUIREMENTS.minReadyPhrases} готовые вступительные фразы`
    );
    expect(guides["Коммуникационные рекомендации"]).toContain(
      `Дай ${PRACTICAL_REQUIREMENTS.nextStepsMin}–${PRACTICAL_REQUIREMENTS.nextStepsMax} уважительных следующих шага`
    );
  });

  it("keeps repair hints in sync with the shared minimums", () => {
    const rendered = renderContentQualityFindings([
      { id: "content:weak_practical_detail", severity: "medium", detail: "detail" }
    ]);
    expect(rendered[0]).toContain(`${PRACTICAL_REQUIREMENTS.minHooks} profile-specific hooks`);
    expect(rendered[0]).toContain(
      `${PRACTICAL_REQUIREMENTS.nextStepsMin}-${PRACTICAL_REQUIREMENTS.nextStepsMax} respectful actions`
    );
    expect(rendered[0]).toContain(
      `${PRACTICAL_REQUIREMENTS.minReadyPhrases} neutral message drafts`
    );
    expect(rendered[0]).toContain("Do not mention target counts");
    expect(rendered[0]).not.toContain("evidence-tied");
    expect(rendered[0]).not.toContain(`${PRACTICAL_REQUIREMENTS.minPracticalSectionWords}+ words`);
  });

  it("derives the context instruction from the shared minimums", () => {
    expect(PRACTICAL_CONTEXT_INSTRUCTION_EN).toContain(
      `${PRACTICAL_REQUIREMENTS.minHooks} grounded hooks`
    );
    expect(PRACTICAL_CONTEXT_INSTRUCTION_EN).toContain(
      `${PRACTICAL_REQUIREMENTS.minReadyPhrases} neutral message drafts`
    );
    expect(PRACTICAL_CONTEXT_INSTRUCTION_EN).toContain("Do not mention numeric targets");
    expect(PRACTICAL_CONTEXT_INSTRUCTION_EN).not.toContain(
      `${PRACTICAL_REQUIREMENTS.minPracticalSectionWords}+ words`
    );
  });
});
