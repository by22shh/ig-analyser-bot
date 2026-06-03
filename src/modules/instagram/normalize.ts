const RESERVED_PATHS = new Set(["p", "reel", "tv", "stories", "explore", "accounts", "direct"]);
const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;

export function normalizeInstagramUsername(input: string): string {
  let value = input.trim();
  if (!value) throw new Error("USERNAME_EMPTY");

  try {
    const maybeUrl = value.includes("instagram.com")
      ? new URL(value.startsWith("http") ? value : `https://${value}`)
      : null;
    if (maybeUrl) {
      const parts = maybeUrl.pathname.split("/").filter(Boolean);
      value = parts[0] ?? "";
    }
  } catch {
    throw new Error("USERNAME_INVALID_URL");
  }

  value = value.replace(/^@+/, "").trim();
  if (value.includes(" ")) throw new Error("USERNAME_HAS_SPACES");
  if (!USERNAME_RE.test(value)) throw new Error("USERNAME_INVALID_CHARS");
  if (RESERVED_PATHS.has(value.toLowerCase())) throw new Error("USERNAME_RESERVED_PATH");
  return value;
}
