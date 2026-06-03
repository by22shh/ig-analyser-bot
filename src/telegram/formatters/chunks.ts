import { TELEGRAM_HTML_CHUNK } from "../constants.js";

export function chunkText(text: string, max = TELEGRAM_HTML_CHUNK): string[] {
  const normalized = text || "";
  if (normalized.length <= max) return [normalized];

  const chunks: string[] = [];
  let rest = normalized;
  while (rest.length > max) {
    let split = rest.lastIndexOf("\n\n", max);
    if (split < max * 0.55) split = rest.lastIndexOf("\n", max);
    if (split < max * 0.55) split = rest.lastIndexOf(" ", max);
    if (split < max * 0.55) split = max;
    chunks.push(rest.slice(0, split).trimEnd());
    rest = rest.slice(split).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}
