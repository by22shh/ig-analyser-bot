import { TELEGRAM_HTML_CHUNK } from "../constants.js";

type AtomKind = "tag-open" | "tag-close" | "tag-void" | "entity" | "char";
type Atom = { text: string; kind: AtomKind; tagName?: string };

/**
 * Splits an HTML-formatted Telegram message into chunks no longer than `max`
 * without ever cutting inside a tag (`<b>`) or an entity (`&amp;`), and while
 * keeping each chunk independently valid: tags left open at a chunk boundary are
 * closed at the end of the chunk and reopened (with their attributes) at the
 * start of the next one. Telegram rejects messages with unbalanced entities, so
 * naive character slicing could drop whole sections of a long report.
 */
export function chunkText(text: string, max = TELEGRAM_HTML_CHUNK): string[] {
  const normalized = text || "";
  if (normalized.length <= max) return [normalized];

  const atoms = tokenize(normalized);
  const chunks: string[] = [];
  let buf = "";
  const open: Atom[] = [];
  let breakPos = -1;
  let breakOpen: Atom[] = [];

  const closeLen = (stack: Atom[]) =>
    stack.reduce((sum, atom) => sum + (atom.tagName?.length ?? 0) + 3, 0);
  const closeStr = (stack: Atom[]) =>
    stack
      .slice()
      .reverse()
      .map((atom) => `</${atom.tagName}>`)
      .join("");
  const openStr = (stack: Atom[]) => stack.map((atom) => atom.text).join("");

  for (const atom of atoms) {
    const budget = max - closeLen(open);
    if (buf.length > 0 && buf.length + atom.text.length > budget) {
      if (breakPos > Math.floor(max * 0.5) && breakPos < buf.length) {
        const head = buf.slice(0, breakPos).replace(/\s+$/, "");
        const tail = buf.slice(breakPos).replace(/^\s+/, "");
        chunks.push(head + closeStr(breakOpen));
        buf = openStr(breakOpen) + tail;
      } else {
        chunks.push(buf.replace(/\s+$/, "") + closeStr(open));
        buf = openStr(open);
      }
      breakPos = -1;
      breakOpen = [];
    }

    buf += atom.text;
    if (atom.kind === "tag-open") {
      open.push(atom);
    } else if (atom.kind === "tag-close") {
      for (let index = open.length - 1; index >= 0; index -= 1) {
        if (open[index]?.tagName === atom.tagName) {
          open.splice(index, 1);
          break;
        }
      }
    } else if (atom.kind === "char" && /\s/.test(atom.text)) {
      breakPos = buf.length;
      breakOpen = open.slice();
    }
  }

  const tail = buf.replace(/\s+$/, "");
  if (tail && tail !== openStr(open)) {
    chunks.push(tail + closeStr(open));
  }
  return chunks.length ? chunks : [normalized];
}

function tokenize(input: string): Atom[] {
  const atoms: Atom[] = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index]!;
    if (char === "<") {
      const end = input.indexOf(">", index);
      if (end !== -1) {
        const raw = input.slice(index, end + 1);
        const isClose = raw.startsWith("</");
        const selfClosing = raw.endsWith("/>");
        const name = raw.match(/^<\/?\s*([a-zA-Z0-9-]+)/)?.[1]?.toLowerCase();
        atoms.push({
          text: raw,
          kind: isClose ? "tag-close" : selfClosing ? "tag-void" : "tag-open",
          tagName: name
        });
        index = end + 1;
        continue;
      }
    } else if (char === "&") {
      const end = input.indexOf(";", index);
      if (end !== -1 && end - index <= 12) {
        atoms.push({ text: input.slice(index, end + 1), kind: "entity" });
        index = end + 1;
        continue;
      }
    }
    atoms.push({ text: char, kind: "char" });
    index += 1;
  }
  return atoms;
}
