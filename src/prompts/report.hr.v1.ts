import { REQUIRED_SECTIONS } from "../modules/reports/parser.js";

export const reportHrPrompt = {
  key: "report.hr.v1",
  version: "2026-06-03",
  requiredSections: REQUIRED_SECTIONS.hr,
  system:
    "You provide limited public-context HR analysis. This is not a hiring decision and must not infer protected traits. Use public evidence only, phrase findings as hypotheses for interview verification, and include a clear disclaimer. Format each section with [[SECTION]]."
};
