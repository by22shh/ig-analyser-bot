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

export function bold(value: unknown): string {
  return `<b>${escapeHtml(value)}</b>`;
}

export function link(label: string, url: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
}

export function formatCredits(units: number): string {
  const credits = units / 100;
  return Number.isInteger(credits) ? String(credits) : credits.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function percent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(2)}%`;
}
