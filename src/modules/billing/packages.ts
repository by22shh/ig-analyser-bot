import type { AnalysisMode } from "../../telegram/constants.js";

export const CREDIT_UNIT = 100;

export const MODE_COST_UNITS: Record<AnalysisMode | "photo_search" | "chat_message", number> = {
  standard: 100,
  influencer: 200,
  hr: 200,
  osint_compliance: 300,
  photo_search: 100,
  chat_message: 5
};

export type PackageView = {
  code: string;
  title: string;
  creditsUnits: number;
  isPublic: boolean;
  starsAmount?: number;
  rubAmount?: number;
};

export const CREDIT_PACKAGES: PackageView[] = [
  {
    code: "trial",
    title: "Trial",
    creditsUnits: 100,
    isPublic: false
  },
  {
    code: "start",
    title: "Start",
    creditsUnits: 300,
    isPublic: true,
    starsAmount: 690,
    rubAmount: 690
  },
  {
    code: "pro",
    title: "Pro",
    creditsUnits: 1000,
    isPublic: true,
    starsAmount: 2300,
    rubAmount: 1990
  },
  {
    code: "agency",
    title: "Agency",
    creditsUnits: 3000,
    isPublic: true,
    starsAmount: 6900,
    rubAmount: 5490
  },
  {
    code: "scale",
    title: "Scale",
    creditsUnits: 10000,
    isPublic: false,
    starsAmount: 23000,
    rubAmount: 15900
  }
];

export function getPackage(code: string): PackageView | undefined {
  return CREDIT_PACKAGES.find((item) => item.code === code);
}

export function publicPackages(provider: "telegram_stars" | "yookassa"): PackageView[] {
  return CREDIT_PACKAGES.filter((pkg) => {
    if (!pkg.isPublic) return false;
    return provider === "telegram_stars" ? pkg.starsAmount != null : pkg.rubAmount != null && pkg.code === "start";
  });
}

export function creditsFromUnits(units: number): number {
  return units / CREDIT_UNIT;
}

export function packageCredits(pkg: PackageView): number {
  return creditsFromUnits(pkg.creditsUnits);
}
