import type { UsageEventInput } from "../observability/usage.js";
import type {
  ReportAnalysisHealth,
  ReportDeliveryHealth,
  ReportRepairTelemetry
} from "../reports/types.js";
import type { ContentQualityRubric } from "./content-quality.js";
import type { ReportQualitySummary } from "./report-quality.js";

export type ReportQualityTelemetry = {
  repairInitialAttempted: boolean;
  repairInitialSucceeded: boolean;
  repairInitialFailed: boolean;
  repairTargetedAttempted: boolean;
  repairTargetedSucceeded: boolean;
  repairTargetedFailed: boolean;
  repairAttempted: boolean;
  repairSucceeded: boolean;
  repairFailed: boolean;
  deliveryStatus: ReportDeliveryHealth["status"];
  failedQuality: boolean;
  lowEvidence: boolean;
  veryLowEvidence: boolean;
  lowEvidenceLevel: ReportAnalysisHealth["sampleCoverageLevel"];
  qualityScore: number;
  contentQualityScore: number;
  sourceCoverage: string;
  qualityFindingCount: number;
  highQualityFindingCount: number;
  contentQualityFindingCount: number;
  highContentQualityFindingCount: number;
};

export function buildReportQualityTelemetry(input: {
  analysisHealth: ReportAnalysisHealth;
  deliveryHealth: ReportDeliveryHealth;
  repairTelemetry: ReportRepairTelemetry;
  quality: ReportQualitySummary;
  contentQuality: ContentQualityRubric;
}): ReportQualityTelemetry {
  const repairInitialFailed =
    input.repairTelemetry.initialRepairAttempted && !input.repairTelemetry.initialRepairAccepted;
  const repairTargetedFailed =
    input.repairTelemetry.targetedRepairAttempted && !input.repairTelemetry.targetedRepairAccepted;
  const repairSucceeded =
    input.repairTelemetry.initialRepairAccepted || input.repairTelemetry.targetedRepairAccepted;
  const repairAttempted =
    input.repairTelemetry.initialRepairAttempted || input.repairTelemetry.targetedRepairAttempted;
  const lowEvidenceLevel = input.analysisHealth.sampleCoverageLevel;
  return {
    repairInitialAttempted: input.repairTelemetry.initialRepairAttempted,
    repairInitialSucceeded: input.repairTelemetry.initialRepairAccepted,
    repairInitialFailed,
    repairTargetedAttempted: input.repairTelemetry.targetedRepairAttempted,
    repairTargetedSucceeded: input.repairTelemetry.targetedRepairAccepted,
    repairTargetedFailed,
    repairAttempted,
    repairSucceeded,
    repairFailed: repairAttempted && !repairSucceeded,
    deliveryStatus: input.deliveryHealth.status,
    failedQuality: input.deliveryHealth.status === "failed_quality",
    lowEvidence: lowEvidenceLevel === "very_low" || lowEvidenceLevel === "low",
    veryLowEvidence: lowEvidenceLevel === "very_low",
    lowEvidenceLevel,
    qualityScore: input.quality.score,
    contentQualityScore: input.contentQuality.score,
    sourceCoverage: input.deliveryHealth.sourceCoverage,
    qualityFindingCount: input.quality.findings.length,
    highQualityFindingCount: input.quality.findings.filter((finding) => finding.severity === "high")
      .length,
    contentQualityFindingCount: input.contentQuality.findings.length,
    highContentQualityFindingCount: input.contentQuality.findings.filter(
      (finding) => finding.severity === "high"
    ).length
  };
}

export function reportQualityUsageEvents(input: {
  userId: string;
  analysisJobId: string;
  model?: string | null;
  telemetry?: ReportQualityTelemetry;
}): UsageEventInput[] {
  const telemetry = input.telemetry;
  if (!telemetry) return [];
  const base = {
    userId: input.userId,
    analysisJobId: input.analysisJobId,
    provider: "analysis_quality",
    model: input.model ?? null
  };
  const events: UsageEventInput[] = [
    {
      ...base,
      operation: "report_quality_gate",
      status: telemetry.failedQuality ? "failed" : "success",
      errorCode: telemetry.failedQuality ? "FAILED_QUALITY" : null
    }
  ];
  if (telemetry.repairInitialAttempted) {
    events.push({
      ...base,
      operation: "report_repair_initial",
      status: telemetry.repairInitialSucceeded ? "success" : "failed",
      errorCode: telemetry.repairInitialSucceeded ? null : "REPAIR_NOT_ACCEPTED"
    });
  }
  if (telemetry.repairTargetedAttempted) {
    events.push({
      ...base,
      operation: "report_repair_targeted",
      status: telemetry.repairTargetedSucceeded ? "success" : "failed",
      errorCode: telemetry.repairTargetedSucceeded ? null : "REPAIR_NOT_ACCEPTED"
    });
  }
  if (telemetry.lowEvidence) {
    events.push({
      ...base,
      operation: "report_low_evidence_flag",
      status: "success",
      errorCode: telemetry.veryLowEvidence ? "VERY_LOW_EVIDENCE" : "LOW_EVIDENCE"
    });
  }
  return events;
}
