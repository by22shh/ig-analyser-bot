import { describe, it, expect } from "vitest";
import { chunkText } from "../../src/telegram/formatters/chunks.js";

describe("chunkText", () => {
  it("returns a single chunk for short text", () => {
    expect(chunkText("hello world", 100)).toEqual(["hello world"]);
  });

  it("keeps every chunk within the max length", () => {
    const text = "word ".repeat(200);
    const chunks = chunkText(text, 60);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(60);
  });

  it("never splits inside an HTML tag", () => {
    const text = `<b>${"x".repeat(120)}</b>`;
    const chunks = chunkText(text, 30);
    for (const chunk of chunks) {
      expect(chunk).not.toMatch(/<[^>]*$/); // no truncated tag at the end
    }
  });

  it("never splits inside an HTML entity", () => {
    const text = "&amp;".repeat(40); // 200 chars of 5-char entities
    const chunks = chunkText(text, 12);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // each chunk must consist of whole &amp; entities only
      expect(chunk.replace(/&amp;/g, "")).toBe("");
    }
  });

  it("balances open tags so each chunk is valid HTML on its own", () => {
    const text = `<b>${"word ".repeat(60)}</b>`;
    const chunks = chunkText(text, 80);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const opens = (chunk.match(/<b>/g) ?? []).length;
      const closes = (chunk.match(/<\/b>/g) ?? []).length;
      expect(opens).toBe(closes);
    }
  });

  it("reopens anchor tags with their attributes in every chunk", () => {
    const text = `<a href="https://example.com/p">${"y".repeat(120)}</a>`;
    const chunks = chunkText(text, 60);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const opens = (chunk.match(/<a href="https:\/\/example\.com\/p">/g) ?? []).length;
      const closes = (chunk.match(/<\/a>/g) ?? []).length;
      expect(opens).toBe(closes);
      expect(opens).toBeGreaterThanOrEqual(1);
    }
  });

  it("preserves the visible text content across chunks", () => {
    const text = `<b>Заголовок</b>\n\n${"Текст со знаком &amp; и словами. ".repeat(40)}`;
    const chunks = chunkText(text, 200);
    const strip = (value: string) =>
      value
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const joined = strip(chunks.join(" "));
    expect(joined).toBe(strip(text));
  });
});
