import type { AnalysisMode, Locale } from "../../telegram/constants.js";
import type { InstagramPost, InstagramProfile } from "../instagram/types.js";
import type { ReportMetrics, VisionAnalysisItemView } from "../reports/types.js";

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
  metrics?: ReportMetrics;
  targetPosition?: string;
  goal?: string;
};

export type ReportRepairInput = ReportInput & {
  rawText: string;
  missingSections: string[];
  weakSourceSections: string[];
};

export type GeneratedReportOutput = {
  rawText: string;
  model: string;
  promptVersion: string;
  summaryBullets?: string[];
};

export type ChatInput = {
  language: Locale;
  reportText: string;
  question: string;
};

export interface LlmProvider {
  analyzeVision(input: VisionInput): Promise<VisionAnalysisItemView[]>;
  generateReport(input: ReportInput): Promise<GeneratedReportOutput>;
  repairReport?(input: ReportRepairInput): Promise<GeneratedReportOutput>;
  chat(
    input: ChatInput
  ): Promise<{ text: string; model: string; tokensIn?: number; tokensOut?: number }>;
}
