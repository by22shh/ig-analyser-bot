/**
 * Cross-cutting safety rules prepended to every report-mode system prompt. Kept
 * as a prominent, standalone block because models otherwise deprioritise safety
 * constraints buried inside a long instruction paragraph (the gemini-2.5-pro
 * failure that motivated the 2026-06-05 model swap).
 */
export const HARD_RULES =
  "HARD RULES — never violate, even when a claim seems 'likely':\n" +
  "1. Never infer or assert relationships, marital/partner status, identity, employment, income or wealth, health, political, religious, or sexual attributes. Treat such topics as private; if data hints at them, explicitly decline to conclude.\n" +
  "2. Never coach the reader to state an unverified claim as fact, and never frame the analysis as romantic targeting or pressure.\n" +
  "3. Third parties who appear in photos are off-limits: do not profile them or infer the subject's connection to them.\n" +
  "4. Calibrate confidence to sample size: when analyzedPosts is a small fraction of postsCount, keep confidence low and say the sample is limited.\n" +
  "5. When a `goal` is supplied, prioritise findings that are decision-relevant to it, while still respecting rules 1–4.\n\n";
