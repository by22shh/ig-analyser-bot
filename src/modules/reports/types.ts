import type { AnalysisMode } from "../../telegram/constants.js";
import type { AnalysisContext, AnalysisContextDigest } from "../analysis/context.js";
import type { ContentQualityRubric } from "../analysis/content-quality.js";
import type { ReportQualitySummary } from "../analysis/report-quality.js";
import type { InstagramPost, InstagramProfile } from "../instagram/types.js";

export type VisionAnalysisItemView = {
  postId: string;
  status: "completed" | "skipped" | "failed" | "low_quality";
  description: string | null;
  model: string;
  promptVersion: string;
  errorCode?: string;
};

export type ReportSectionView = {
  title: string;
  content: string;
  kind?: string;
  sources: ReportSource[];
};

export type ReportSource = {
  postId?: string;
  url?: string;
  label: string;
};

export type ReportMetrics = {
  followersCount: number;
  followsCount: number;
  postsCount: number;
  analyzedPosts: number;
  avgLikes: number;
  avgComments: number;
  medianLikes: number;
  medianComments: number;
  engagementRate: number;
  frequencyDays: number;
  pinnedPostsCount: number;
  uniqueLocations: string[];
  uniqueMusic: string[];
  relatedProfiles: string[];
  topPostsByLikes: Array<{ postId: string; url?: string; likesCount: number }>;
  topPostsByComments: Array<{ postId: string; url?: string; commentsCount: number }>;
  postTypeDistribution: Record<string, number>;
  hashtagFrequency: Record<string, number>;
  mentionFrequency: Record<string, number>;
  digitalCircle: DigitalCircleItem[];
};

export type DigitalCircleItem = {
  username: string;
  type: "tagged" | "mentioned" | "commenter" | "mixed";
  score: number;
  lastInteractionDate?: string;
  details: string[];
};

export type ReportAnalysisHealth = {
  formatLabel: string;
  analyzedPosts: number;
  postsCount: number;
  sampleCoveragePercent?: number;
  sampleCoverageLevel: "unknown" | "very_low" | "low" | "partial" | "broad" | "near_full";
  visionCompleted: number;
  visionTotal: number;
  visionCompletionPercent?: number;
  postsWithCommentText: number;
  commentCoveragePercent?: number;
  commentTextCount: number;
};

export type ReportDeliveryHealthStatus = "ready" | "limited" | "needs_repair" | "failed_quality";

export type ReportDeliveryHealth = {
  status: ReportDeliveryHealthStatus;
  reasons: string[];
  qualityScore: number;
  contentQualityScore: number;
  sourceCoverage: string;
  repaired: boolean;
};

export type ReportSummaryView = {
  executiveSummary?: string;
  bullets: string[];
  warnings: string[];
  analysisHealth?: ReportAnalysisHealth;
  deliveryHealth?: ReportDeliveryHealth;
  quality?: ReportQualitySummary;
  contentQuality?: ContentQualityRubric;
  evidence?: AnalysisContextDigest;
};

export type StrategicReportView = {
  mode: AnalysisMode;
  username: string;
  language: "ru" | "en";
  rawText: string;
  sections: ReportSectionView[];
  summary: ReportSummaryView;
  metrics: ReportMetrics;
  sourceMap: ReportSource[];
  model: string;
  promptVersion: string;
  profile: InstagramProfile;
  posts: InstagramPost[];
  vision: VisionAnalysisItemView[];
  analysisContext?: AnalysisContext;
};
