import { escapeHtml } from "../../telegram/formatters/html.js";
import type { StrategicReportView } from "./types.js";
import { stripSectionMarkers } from "./user-facing-text.js";

export function renderReportMarkdown(report: StrategicReportView): string {
  const lines = [
    `# Instagram report: @${report.username}`,
    "",
    `Mode: ${report.mode}`,
    `Generated language: ${report.language}`,
    "",
    "## Summary",
    ...(report.summary.executiveSummary
      ? ["", "### Executive Summary", stripSectionMarkers(report.summary.executiveSummary), ""]
      : []),
    ...report.summary.bullets.map((item) => `- ${stripSectionMarkers(item)}`),
    ...markdownWarnings(report.summary.warnings.map(stripSectionMarkers)),
    "",
    "## Analysis Health",
    ...markdownAnalysisHealth(report),
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
    lines.push(
      `## ${stripSectionMarkers(section.title)}`,
      "",
      stripSectionMarkers(section.content),
      ""
    );
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
          <h2>${escapeHtml(stripSectionMarkers(section.title))}</h2>
          <p>${escapeHtml(stripSectionMarkers(section.content)).replaceAll("\n", "<br>")}</p>
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
  ${
    report.summary.executiveSummary
      ? `<h3>Executive Summary</h3><p>${escapeHtml(stripSectionMarkers(report.summary.executiveSummary))}</p>`
      : ""
  }
  <ul>${report.summary.bullets.map((item) => `<li>${escapeHtml(stripSectionMarkers(item))}</li>`).join("")}</ul>
  ${renderHtmlWarnings(report.summary.warnings.map(stripSectionMarkers))}
  <h2>Analysis Health</h2>
  ${renderHtmlAnalysisHealth(report)}
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

function markdownAnalysisHealth(report: StrategicReportView): string[] {
  const health = report.summary.analysisHealth;
  if (!health) return ["- unavailable"];
  return [
    `- Format: ${health.formatLabel}`,
    `- Sample coverage: ${health.analyzedPosts}/${health.postsCount} posts (${health.sampleCoveragePercent ?? 0}%)`,
    `- Vision coverage: ${health.visionCompleted}/${health.visionTotal} (${health.visionCompletionPercent ?? 0}%)`,
    `- Comment coverage: ${health.postsWithCommentText}/${health.analyzedPosts} posts (${health.commentCoveragePercent ?? 0}%)`,
    `- Comment texts available: ${health.commentTextCount}`
  ];
}

function renderHtmlWarnings(warnings: string[]): string {
  if (!warnings.length) return "";
  return `<h2>Quality Warnings</h2><ul>${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderHtmlAnalysisHealth(report: StrategicReportView): string {
  const health = report.summary.analysisHealth;
  if (!health) return "<p>Unavailable</p>";
  return `<ul>
    <li><b>Format:</b> ${escapeHtml(health.formatLabel)}</li>
    <li><b>Sample coverage:</b> ${health.analyzedPosts}/${health.postsCount} posts (${health.sampleCoveragePercent ?? 0}%)</li>
    <li><b>Vision coverage:</b> ${health.visionCompleted}/${health.visionTotal} (${health.visionCompletionPercent ?? 0}%)</li>
    <li><b>Comment coverage:</b> ${health.postsWithCommentText}/${health.analyzedPosts} posts (${health.commentCoveragePercent ?? 0}%)</li>
    <li><b>Comment texts available:</b> ${health.commentTextCount}</li>
  </ul>`;
}

function renderHtmlSourceTarget(source: { url?: string; postId?: string }): string {
  if (source.url) {
    return `<a href="${escapeHtml(source.url)}">${escapeHtml(source.url)}</a>`;
  }
  return source.postId ? escapeHtml(source.postId) : "";
}
