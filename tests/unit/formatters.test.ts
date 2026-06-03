import { describe, expect, it } from "vitest";
import { chunkText } from "../../src/telegram/formatters/chunks.js";
import { escapeHtml, formatCredits } from "../../src/telegram/formatters/html.js";

describe("formatters", () => {
  it("escapes HTML and formats credit units", () => {
    expect(escapeHtml('<tag a="1">&')).toBe("&lt;tag a=&quot;1&quot;&gt;&amp;");
    expect(formatCredits(100)).toBe("1");
    expect(formatCredits(5)).toBe("0.05");
  });

  it("chunks long output below Telegram-safe threshold", () => {
    const parts = chunkText("a ".repeat(5000), 3500);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= 3500)).toBe(true);
  });
});
