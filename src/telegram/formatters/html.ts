export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function code(value: unknown): string {
  return `<code>${escapeHtml(value)}</code>`;
}

/**
 * Renders a small subset of Markdown the chat model commonly emits (`**bold**`
 * and `` `code` ``) into Telegram-supported HTML. Input is HTML-escaped first,
 * so the output is always well-formed: unmatched markers stay as literal text
 * and never produce unbalanced tags (which Telegram would reject).
 */
export function mdLiteToHtml(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
}

export function bold(value: unknown): string {
  return `<b>${escapeHtml(value)}</b>`;
}

export function link(label: string, url: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
}

export function formatCredits(units: number): string {
  const credits = units / 100;
  return Number.isInteger(credits)
    ? String(credits)
    : credits.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function percent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(2)}%`;
}
