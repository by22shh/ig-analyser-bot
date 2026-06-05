import type { AnalysisMode } from "../../telegram/constants.js";
import { chatReportPrompt } from "../../prompts/chat.report.v1.js";
import { groundingCheckPrompt } from "../../prompts/grounding.v1.js";
import { reportHrPrompt } from "../../prompts/report.hr.v1.js";
import { reportInfluencerPrompt } from "../../prompts/report.influencer.v1.js";
import { reportOsintCompliancePrompt } from "../../prompts/report.osint-compliance.v1.js";
import { reportStandardPrompt } from "../../prompts/report.standard.v1.js";
import { visionDetailPrompt } from "../../prompts/vision.detail.v1.js";

export function reportPromptForMode(mode: AnalysisMode) {
  return {
    standard: reportStandardPrompt,
    influencer: reportInfluencerPrompt,
    hr: reportHrPrompt,
    osint_compliance: reportOsintCompliancePrompt
  }[mode];
}

export const prompts = {
  vision: visionDetailPrompt,
  chat: chatReportPrompt,
  grounding: groundingCheckPrompt,
  reportForMode: reportPromptForMode
};
