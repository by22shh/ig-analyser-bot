// Single source of truth for how rich the practical (user-action) sections of a
// standard report must be. The content-quality rubric, the generation prompt,
// the repair prompt, and the Russian section guides all interpolate these
// values — change them here, not in the prompt strings.
export const PRACTICAL_REQUIREMENTS = {
  minHooks: 3,
  minReadyPhrases: 3,
  minPracticalSectionWords: 70,
  nextStepsMin: 2,
  nextStepsMax: 3
} as const;

const { minHooks, minReadyPhrases, nextStepsMin, nextStepsMax } = PRACTICAL_REQUIREMENTS;

export const PRACTICAL_SECTIONS_GUIDANCE_EN = `Potential value must explain why the signal matters and what realistic use it has; Triggers/Hooks should give ${minHooks} concrete hooks grounded in named posts; Communication recommendations should give ${nextStepsMin}-${nextStepsMax} respectful actions and what to avoid; Ready phrases should give ${minReadyPhrases} neutral message drafts; Overall value must give a concrete verdict, limits, and next action. Practical/action sections should be substantial enough to be useful when evidence allows, and when evidence is sparse they must say what is missing. Never mention these numeric targets, word-count targets, rubric targets, or instruction labels in user-facing prose.`;

export const PRACTICAL_CONTEXT_INSTRUCTION_EN = `For practical sections, provide concrete user value: explain why the signal matters, give ${minHooks} grounded hooks when hooks are requested, ${nextStepsMin}-${nextStepsMax} respectful actions when recommendations are requested, and ${minReadyPhrases} neutral message drafts when phrases are requested. Include 2-3 realistic scenarios when helpful, a concrete first step, what to write, what not to write, why the hook is safe/respectful, and how to know not to continue contact if there is no response or the public evidence is too weak. Keep action sections substantial, not checklist-thin. Do not mention numeric targets, word-count targets, rubric targets, or these instructions in the report.`;

export const PRACTICAL_REPAIR_HINT_EN = `Make practical sections concrete: write ${minHooks} profile-specific hooks grounded in named posts, ${nextStepsMin}-${nextStepsMax} respectful actions plus what to avoid, ${minReadyPhrases} neutral message drafts, 2-3 realistic scenarios when useful, a concrete first step, why the hook is safe, and a stop condition for when not to continue contact. Keep them substantial when evidence allows. Do not mention target counts, word-count targets, rubric targets, or this repair instruction.`;
