import type { InstagramPost } from "../instagram/types.js";
import type { DigitalCircleItem } from "./types.js";

const SPAM = new Set(["nice", "cool", "wow", "amazing", "🔥", "❤️", "😍"]);

type Acc = {
  username: string;
  types: Set<DigitalCircleItem["type"]>;
  score: number;
  posts: Set<string>;
  lastInteractionDate?: string;
  details: string[];
};

export function computeDigitalCircle(posts: InstagramPost[]): DigitalCircleItem[] {
  const newest = Math.max(
    ...posts.map((post) => Date.parse(post.timestamp ?? "0")).filter(Number.isFinite),
    0
  );
  const acc = new Map<string, Acc>();

  for (const post of posts) {
    const date = post.timestamp;
    for (const username of post.taggedUsers)
      add(acc, username, "tagged", 2.0, post, newest, date, "tagged in post");
    for (const username of post.mentions)
      add(acc, username, "mentioned", 1.5, post, newest, date, "mentioned in caption");
    for (const comment of post.latestComments) {
      const username = comment.ownerUsername;
      if (!username || isSpam(comment.text)) continue;
      const bonus = Math.min((comment.text.length || 0) * 0.1, 2);
      add(
        acc,
        username,
        "commenter",
        1.0 + bonus,
        post,
        newest,
        comment.timestamp ?? date,
        "commented"
      );
    }
  }

  return [...acc.values()]
    .map((item) => {
      const regularity = Math.max(item.posts.size - 4, 0) * 0.5;
      const type: DigitalCircleItem["type"] =
        item.types.size > 1 ? "mixed" : ([...item.types][0] ?? "commenter");
      return {
        username: item.username,
        type,
        score: Number((item.score + regularity).toFixed(2)),
        lastInteractionDate: item.lastInteractionDate,
        details: item.details.slice(0, 4)
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function add(
  acc: Map<string, Acc>,
  rawUsername: string,
  type: DigitalCircleItem["type"],
  baseScore: number,
  post: InstagramPost,
  newest: number,
  date?: string,
  detail?: string
) {
  const username = rawUsername.replace(/^@/, "").toLowerCase();
  if (!username) return;
  const created = acc.get(username) ?? {
    username,
    types: new Set(),
    score: 0,
    posts: new Set(),
    details: []
  };
  const timestamp = Date.parse(date ?? post.timestamp ?? "0");
  const recentMultiplier = newest && timestamp && newest - timestamp <= 30 * 86400000 ? 1.5 : 1;
  created.types.add(type);
  created.score += baseScore * recentMultiplier;
  created.posts.add(post.id);
  if (
    date &&
    (!created.lastInteractionDate || Date.parse(date) > Date.parse(created.lastInteractionDate))
  ) {
    created.lastInteractionDate = date;
  }
  if (detail) created.details.push(`${detail}: ${post.url ?? post.id}`);
  acc.set(username, created);
}

const EMOJI_SYMBOL_RE = /\p{Extended_Pictographic}/u;
const EMOJI_SYMBOLS_RE = /\p{Extended_Pictographic}/gu;
const EMOJI_MODIFIERS_RE = /\p{Emoji_Modifier}/gu;
const ZERO_WIDTH_JOINERS_RE = /\u200d/gu;
const VARIATION_SELECTORS_RE = /\ufe0f/gu;

function isSpam(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (normalized.length < 3) return true;
  if (SPAM.has(normalized)) return true;
  return isEmojiOnly(normalized);
}

function isEmojiOnly(value: string): boolean {
  if (!EMOJI_SYMBOL_RE.test(value)) return false;
  return (
    value
      .replace(EMOJI_SYMBOLS_RE, "")
      .replace(EMOJI_MODIFIERS_RE, "")
      .replace(ZERO_WIDTH_JOINERS_RE, "")
      .replace(VARIATION_SELECTORS_RE, "")
      .trim().length === 0
  );
}
