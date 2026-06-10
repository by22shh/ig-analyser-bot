// Single source of truth for how rich the practical (user-action) sections of a
// standard report must be. The content-quality rubric, the generation prompt,
// the repair prompt, and the Russian section guides all interpolate these
// values — change them here, not in the prompt strings.
export const PRACTICAL_REQUIREMENTS = {
  minHooks: 3,
  minReadyPhrases: 3,
  nextStepsMin: 2,
  nextStepsMax: 3
} as const;

const { minHooks, minReadyPhrases, nextStepsMin, nextStepsMax } = PRACTICAL_REQUIREMENTS;

export const PRACTICAL_SECTIONS_GUIDANCE_EN = `Potential value must explain why the signal matters and what realistic use it has; Triggers/Hooks must include at least ${minHooks} concrete evidence-tied hooks; Communication recommendations must include ${nextStepsMin}-${nextStepsMax} respectful next steps and what to avoid; Ready phrases must include at least ${minReadyPhrases} neutral ready-to-send phrases; Overall value must give a concrete verdict, limits, and next action.`;

export const PRACTICAL_CONTEXT_INSTRUCTION_EN = `For practical sections, provide concrete user value: why the signal matters, ${minHooks}+ hooks when hooks are requested, ${nextStepsMin}-${nextStepsMax} respectful next steps when recommendations are requested, and ${minReadyPhrases}+ neutral ready-to-send phrases when phrases are requested.`;

export const PRACTICAL_REPAIR_HINT_EN = `Add practical details: at least ${minHooks} evidence-tied hooks, ${nextStepsMin}-${nextStepsMax} respectful next steps, and ready-to-send neutral phrases.`;
