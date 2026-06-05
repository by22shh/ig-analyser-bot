import type { AnalysisMode, Locale } from "../../telegram/constants.js";
import type { InstagramPost, InstagramProfile } from "../instagram/types.js";
import type { ReportMetrics, ReportSectionView, VisionAnalysisItemView } from "../reports/types.js";
import type { GroundingResult, SourceCatalogEntry } from "./grounding.js";

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
  // Rendered grounding findings (fabricated sources / forbidden inferences) the
  // repair pass must remove or down-confidence.
  groundingFindings?: string[];
};

export type GroundingVerifyInput = {
  language: Locale;
  sections: ReportSectionView[];
  sourceCatalog: SourceCatalogEntry[];
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
  // Optional LLM grounding pass (provider gates it on LLM_GROUNDING_CHECK). When
  // absent, only deterministic grounding runs in the report builder.
  verifyGrounding?(input: GroundingVerifyInput): Promise<GroundingResult>;
  chat(
    input: ChatInput
  ): Promise<{ text: string; model: string; tokensIn?: number; tokensOut?: number }>;
}
