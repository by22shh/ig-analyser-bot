import { escapeHtml } from "../../telegram/formatters/html.js";
import type { StrategicReportView } from "./types.js";

export function renderReportMarkdown(report: StrategicReportView): string {
  const lines = [
    `# Instagram report: @${report.username}`,
    "",
    `Mode: ${report.mode}`,
    `Generated language: ${report.language}`,
    "",
    "## Summary",
    ...report.summary.bullets.map((item) => `- ${item}`),
    ...markdownWarnings(report.summary.warnings),
    "",
    "## Metrics",
    `- Followers: ${report.metrics.followersCount}`,
    `- Analyzed posts: ${report.metrics.analyzedPosts}`,
    `- ER: ${report.metrics.engagementRate.toFixed(2)}%`,
    "",
    "## Digital Circle",
    ...report.metrics.digitalCircle.map(
      (item) => `- @${item.username}: ${item.score} (${item.type})`
    ),
    ""
  ];
  for (const section of report.sections) {
    lines.push(`## ${section.title}`, "", section.content, "");
    if (section.sources.length) {
      lines.push("Sources:");
      for (const source of section.sources)
        lines.push(`- ${source.label}: ${source.url ?? source.postId ?? ""}`);
      lines.push("");
    }
  }
  lines.push(
    "## Disclaimer",
    "This report uses public data only and contains hypotheses/signals for verification."
  );
  return lines.join("\n");
}

export function renderReportHtml(report: StrategicReportView): string {
  const sections = report.sections
    .map(
      (section) => `
        <section>
          <h2>${escapeHtml(section.title)}</h2>
          <p>${escapeHtml(section.content).replaceAll("\n", "<br>")}</p>
          ${
            section.sources.length
              ? `<ul>${section.sources.map((source) => `<li>${escapeHtml(source.label)} ${renderHtmlSourceTarget(source)}</li>`).join("")}</ul>`
              : ""
          }
        </section>`
    )
    .join("\n");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Instagram report @${escapeHtml(report.username)}</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; color: #151515; line-height: 1.5; }
    header { border-bottom: 2px solid #111; margin-bottom: 24px; padding-bottom: 12px; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    h2 { font-size: 18px; margin-top: 28px; }
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .metric { border: 1px solid #ddd; padding: 8px; }
    .disclaimer { margin-top: 32px; color: #555; font-size: 12px; }
  </style>
</head>
<body>
  <header>
    <h1>Instagram report: @${escapeHtml(report.username)}</h1>
    <div>Mode: ${escapeHtml(report.mode)} · Language: ${escapeHtml(report.language)}</div>
  </header>
  <h2>Summary</h2>
  <ul>${report.summary.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  ${renderHtmlWarnings(report.summary.warnings)}
  <h2>Metrics</h2>
  <div class="metrics">
    <div class="metric"><b>Followers</b><br>${report.metrics.followersCount}</div>
    <div class="metric"><b>Posts analyzed</b><br>${report.metrics.analyzedPosts}</div>
    <div class="metric"><b>ER</b><br>${report.metrics.engagementRate.toFixed(2)}%</div>
  </div>
  <h2>Digital Circle</h2>
  <ul>${report.metrics.digitalCircle.map((item) => `<li>@${escapeHtml(item.username)} — ${item.score} (${escapeHtml(item.type)})</li>`).join("")}</ul>
  ${sections}
  <p class="disclaimer">Public data only. Hypotheses/signals for verification, not certainty.</p>
</body>
</html>`;
}

function markdownWarnings(warnings: string[]): string[] {
  if (!warnings.length) return [];
  return ["", "## Quality Warnings", ...warnings.map((item) => `- ${item}`)];
}

function renderHtmlWarnings(warnings: string[]): string {
  if (!warnings.length) return "";
  return `<h2>Quality Warnings</h2><ul>${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderHtmlSourceTarget(source: { url?: string; postId?: string }): string {
  if (source.url) {
    return `<a href="${escapeHtml(source.url)}">${escapeHtml(source.url)}</a>`;
  }
  return source.postId ? escapeHtml(source.postId) : "";
}
