import type { AnalysisMode, Locale } from "../../telegram/constants.js";
import type { InstagramPost, InstagramProfile } from "../instagram/types.js";
import type { VisionAnalysisItemView } from "../reports/types.js";

export type VisionInput = {
  profile: InstagramProfile;
  posts: InstagramPost[];
};

export type ReportInput = {
  mode: AnalysisMode;
  language: Locale;
  profile: InstagramProfile;
  posts: InstagramPost[];
  vision: VisionAnalysisItemView[];
  targetPosition?: string;
  goal?: string;
};

export type ChatInput = {
  language: Locale;
  reportText: string;
  question: string;
};

export interface LlmProvider {
  analyzeVision(input: VisionInput): Promise<VisionAnalysisItemView[]>;
  generateReport(
    input: ReportInput
  ): Promise<{ rawText: string; model: string; promptVersion: string }>;
  chat(
    input: ChatInput
  ): Promise<{ text: string; model: string; tokensIn?: number; tokensOut?: number }>;
}
