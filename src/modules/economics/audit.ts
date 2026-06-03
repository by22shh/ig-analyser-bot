import { env } from "../../config/env.js";
import {
  MODELED_CAPS,
  configuredModeCostUnits,
  economicsSettingsFromEnv,
  guardrailNetRubPerCredit,
  minCardNetRubPerCredit,
  minStarsNetRubPerCredit,
  requiredUnitsForCost,
  revenueMultiple,
  type PublicMode
} from "./model.js";

export type AuditRow = {
  mode: PublicMode;
  providerCostRub: number;
  chargedUnits: number;
  requiredUnits: number;
  multiple: number;
  pass: boolean;
};

export type AuditResult = {
  rows: AuditRow[];
  problems: string[];
  netRubPerCredit: number;
  cardFloor?: number;
  starsFloor?: number;
};

const publicModes = (): PublicMode[] => {
  const modes: PublicMode[] = ["standard", "chat_message"];
  if (env.FEATURE_INFLUENCER_MODE) modes.push("influencer");
  if (env.FEATURE_HR_MODE) modes.push("hr");
  if (env.FEATURE_PHOTO_SEARCH) modes.push("photo_search");
  if (env.FEATURE_OSINT_COMPLIANCE_MODE) modes.push("osint_compliance");
  return modes;
};

export function runEconomicsAudit(): AuditResult {
  const settings = economicsSettingsFromEnv();
  const problems: string[] = [];

  if (settings.paymentFeeReserve == null || settings.paymentFeeReserve <= 0) {
    problems.push("ECON_PAYMENT_FEE_RESERVE must be modeled and positive");
  }
  if (settings.starsUsdPerStarPayoutFloor == null || settings.starsUsdPerStarPayoutFloor <= 0) {
    problems.push("ECON_STARS_USD_PER_STAR_PAYOUT_FLOOR must be modeled and positive");
  }
  if (settings.starsPayoutReserve == null || settings.starsPayoutReserve <= 0) {
    problems.push("ECON_STARS_PAYOUT_RESERVE must be modeled and positive");
  }

  for (const key of Object.keys(MODELED_CAPS) as Array<keyof typeof MODELED_CAPS>) {
    const runtime = settings.caps[key];
    const modeled = MODELED_CAPS[key];
    if (typeof runtime === "number" && runtime > modeled) {
      problems.push(`Runtime cap ${key}=${runtime} exceeds modeled cap ${modeled}`);
    }
  }

  if (env.FEATURE_PHOTO_SEARCH && settings.caps.facecheckMaxCostRub == null) {
    problems.push("FACECHECK_MAX_COST_RUB must be configured when photo search is enabled");
  }

  const rows: AuditRow[] = [];
  let netRubPerCredit = 0;
  try {
    netRubPerCredit = guardrailNetRubPerCredit(settings);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }

  for (const mode of publicModes()) {
    const cost = settings.providerCosts[mode];
    if (cost == null || !Number.isFinite(cost) || cost <= 0) {
      problems.push(`Provider cost missing for ${mode}`);
      continue;
    }
    const chargedUnits = configuredModeCostUnits(mode);
    const requiredUnits = requiredUnitsForCost(cost, settings);
    const multiple = revenueMultiple(chargedUnits, cost, settings);
    const pass = chargedUnits >= requiredUnits && multiple >= settings.targetRevenueMultiple;
    rows.push({ mode, providerCostRub: cost, chargedUnits, requiredUnits, multiple, pass });
    if (!pass) {
      problems.push(
        `${mode}: charges ${chargedUnits} units, requires ${requiredUnits}; multiple=${multiple.toFixed(2)}x`
      );
    }
  }

  return {
    rows,
    problems,
    netRubPerCredit,
    cardFloor: minCardNetRubPerCredit(settings),
    starsFloor: minStarsNetRubPerCredit(settings)
  };
}
