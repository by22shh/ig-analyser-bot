const USER_FACING_INSTRUCTION_LEAK_PATTERNS: Array<[RegExp, string]> = [
  [/\d+\+\s*(?:words?|слов[а-я]*)/iu, "numeric word-count target"],
  [/\d+\+\s*(?:phrases?|фраз[а-я]*)/iu, "numeric phrase-count target"],
  [
    /(?:не\s+меньше|минимум|at\s+least)\s+\d+\s+(?:слов[а-я]*|words?|фраз[а-я]*|phrases?|зацеп[а-я]*|hooks?)/iu,
    "minimum count target"
  ],
  [/\bevidence[-\s]?tied\b/iu, "evidence-tied instruction label"],
  [/\brespectful\s+next\s+steps?\b/iu, "respectful next steps instruction label"],
  [
    /\bready[-\s]?to[-\s]?send\s+neutral\s+phrases?\b/iu,
    "ready-to-send neutral phrases instruction label"
  ],
  [
    /\b(?:word[-\s]?count|words?\s+target|min(?:imum)?\s+words?|rubric\s+target|quality\s+rubric)\b/iu,
    "rubric/word-count wording"
  ],
  [
    /(?:целев[а-я]*|таргет[а-я]*|минимальн[а-я]*)\s+(?:числ[а-я]*|количеств[а-я]*)\s+(?:слов|фраз|зацеп)/iu,
    "rubric target wording"
  ]
];

export function findUserFacingInstructionLeaks(text: string): string[] {
  const matches = USER_FACING_INSTRUCTION_LEAK_PATTERNS.filter(([pattern]) =>
    pattern.test(text)
  ).map(([, label]) => label);
  return [...new Set(matches)];
}

export function hasUserFacingInstructionLeak(text: string): boolean {
  return findUserFacingInstructionLeaks(text).length > 0;
}
