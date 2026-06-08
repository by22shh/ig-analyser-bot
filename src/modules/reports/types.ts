import type { AnalysisMode } from "../../telegram/constants.js";
import type { AnalysisContext, AnalysisContextDigest } from "../analysis/context.js";
import type { ReportQualitySummary } from "../analysis/report-quality.js";
import type { InstagramPost, InstagramProfile } from "../instagram/types.js";

export type VisionAnalysisItemView = {
  postId: string;
  status: "completed" | "skipped" | "failed";
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

export type ReportSummaryView = {
  bullets: string[];
  warnings: string[];
  quality?: ReportQualitySummary;
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
