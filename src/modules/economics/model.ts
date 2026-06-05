import { env } from "../../config/env.js";
import { MODE_COST_UNITS, publicPackages, packageCredits } from "../billing/packages.js";
import type { AnalysisMode } from "../../telegram/constants.js";

export type PublicMode = AnalysisMode | "photo_search" | "chat_message";

export type EconomicsSettings = {
  usdToRubBuffer: number;
  paymentFeeReserve: number;
  starsUsdPerStarPayoutFloor: number;
  starsPayoutReserve: number;
  targetRevenueMultiple: number;
  providerCosts: Record<PublicMode, number | undefined>;
  caps: {
    postLimit: number;
    visionBatchSize: number;
    maxImagesAnalyzed: number;
    maxImageDownloadMb: number;
    finalInputTokens: number;
    finalOutputTokens: number;
    chatInputTokens: number;
    chatOutputTokens: number;
    facecheckTimeoutSeconds: number;
    facecheckMaxCostRub?: number;
    pdfRenderTimeoutSeconds: number;
  };
};

// Cost-model assumptions for the runtime caps. Raised for the final reasoning
// call (input 24000→90000 chars, output 4096→8000 tokens) alongside the
// gpt-5.5 swap: measured per-report cost stays ≈38–50 ₽, under the 55 ₽ P75
// (the reasoning step is a single call). Keep these in sync with env defaults.
export const MODELED_CAPS = {
  postLimit: 30,
  visionBatchSize: 5,
  maxImagesAnalyzed: 30,
  maxImageDownloadMb: 8,
  finalInputTokens: 90000,
  finalOutputTokens: 8000,
  chatInputTokens: 12000,
  chatOutputTokens: 2048,
  facecheckTimeoutSeconds: 90,
  pdfRenderTimeoutSeconds: 60
};

export function economicsSettingsFromEnv(): EconomicsSettings {
  return {
    usdToRubBuffer: env.ECON_USD_TO_RUB_BUFFER ?? 90,
    paymentFeeReserve: env.ECON_PAYMENT_FEE_RESERVE ?? 0.2,
    starsUsdPerStarPayoutFloor: env.ECON_STARS_USD_PER_STAR_PAYOUT_FLOOR ?? 0.01,
    starsPayoutReserve: env.ECON_STARS_PAYOUT_RESERVE ?? 0.2,
    targetRevenueMultiple: env.ECON_TARGET_REVENUE_MULTIPLE ?? 3,
    providerCosts: {
      standard: env.ECON_STANDARD_REPORT_COST_P75_RUB,
      influencer: env.ECON_STANDARD_REPORT_COST_P75_RUB
        ? env.ECON_STANDARD_REPORT_COST_P75_RUB * 1.15
        : undefined,
      hr: env.ECON_STANDARD_REPORT_COST_P75_RUB
        ? env.ECON_STANDARD_REPORT_COST_P75_RUB * 1.15
        : undefined,
      osint_compliance: env.ECON_STANDARD_REPORT_COST_P75_RUB
        ? env.ECON_STANDARD_REPORT_COST_P75_RUB * 1.35
        : undefined,
      photo_search: env.ECON_PHOTO_SEARCH_COST_P75_RUB,
      chat_message: env.ECON_CHAT_MESSAGE_COST_P75_RUB
    },
    caps: {
      postLimit: env.ANALYSIS_POST_LIMIT ?? 30,
      visionBatchSize: env.VISION_BATCH_SIZE ?? 5,
      maxImagesAnalyzed: env.ANALYSIS_MAX_IMAGES_ANALYZED ?? 30,
      maxImageDownloadMb: env.ANALYSIS_MAX_IMAGE_DOWNLOAD_MB ?? 8,
      finalInputTokens: env.LLM_FINAL_INPUT_TOKEN_BUDGET ?? 24000,
      finalOutputTokens: env.LLM_FINAL_OUTPUT_TOKEN_BUDGET ?? 4096,
      chatInputTokens: env.LLM_CHAT_INPUT_TOKEN_BUDGET ?? 12000,
      chatOutputTokens: env.LLM_CHAT_OUTPUT_TOKEN_BUDGET ?? 2048,
      facecheckTimeoutSeconds: env.FACECHECK_TIMEOUT_SECONDS ?? 90,
      facecheckMaxCostRub: env.FACECHECK_MAX_COST_RUB,
      pdfRenderTimeoutSeconds: env.PDF_RENDER_TIMEOUT_SECONDS ?? 60
    }
  };
}

export function minCardNetRubPerCredit(settings: EconomicsSettings): number | undefined {
  const prices = publicPackages("yookassa")
    .filter((pkg) => pkg.rubAmount != null)
    .map((pkg) => (pkg.rubAmount as number) / packageCredits(pkg));
  if (!prices.length) return undefined;
  return Math.min(...prices) * (1 - settings.paymentFeeReserve);
}

export function minStarsNetRubPerCredit(settings: EconomicsSettings): number | undefined {
  const prices = publicPackages("telegram_stars")
    .filter((pkg) => pkg.starsAmount != null)
    .map(
      (pkg) =>
        ((pkg.starsAmount as number) / packageCredits(pkg)) *
        settings.starsUsdPerStarPayoutFloor *
        settings.usdToRubBuffer *
        (1 - settings.starsPayoutReserve)
    );
  if (!prices.length) return undefined;
  return Math.min(...prices);
}

export function guardrailNetRubPerCredit(settings: EconomicsSettings): number {
  const values = [minCardNetRubPerCredit(settings), minStarsNetRubPerCredit(settings)].filter(
    (value): value is number => value != null
  );
  if (!values.length) {
    throw new Error("No public payment packages are enabled");
  }
  return Math.min(...values);
}

export function netRevenueForUnits(units: number, settings: EconomicsSettings): number {
  return (units / 100) * guardrailNetRubPerCredit(settings);
}

export function requiredUnitsForCost(costRub: number, settings: EconomicsSettings): number {
  const credits = (costRub * settings.targetRevenueMultiple) / guardrailNetRubPerCredit(settings);
  return Math.ceil(credits * 100);
}

export function revenueMultiple(
  units: number,
  costRub: number,
  settings: EconomicsSettings
): number {
  if (costRub <= 0) return Infinity;
  return netRevenueForUnits(units, settings) / costRub;
}

export function configuredModeCostUnits(mode: PublicMode): number {
  return MODE_COST_UNITS[mode];
}
