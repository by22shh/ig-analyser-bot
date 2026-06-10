import { createHmac, timingSafeEqual } from "node:crypto";

export type MiniAppTelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
};

export type MiniAppTelegramChat = {
  id: number;
  type?: string;
  title?: string;
  username?: string;
};

export type ValidatedMiniAppInitData = {
  authDate: Date;
  queryId?: string;
  user?: MiniAppTelegramUser;
  chat?: MiniAppTelegramChat;
  raw: Record<string, string>;
};

export class MiniAppAuthError extends Error {
  constructor(
    public readonly code:
      | "INIT_DATA_MISSING"
      | "BOT_TOKEN_MISSING"
      | "HASH_MISSING"
      | "HASH_INVALID"
      | "AUTH_DATE_MISSING"
      | "AUTH_DATE_EXPIRED"
      | "USER_INVALID"
      | "CHAT_INVALID",
    message = code
  ) {
    super(message);
  }
}

const DEFAULT_MAX_AGE_SECONDS = 60 * 60;

export function validateMiniAppInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
  now = new Date()
): ValidatedMiniAppInitData {
  if (!initData.trim()) throw new MiniAppAuthError("INIT_DATA_MISSING");
  if (!botToken.trim()) throw new MiniAppAuthError("BOT_TOKEN_MISSING");

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new MiniAppAuthError("HASH_MISSING");

  const dataCheckString = Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (!safeEqualHex(calculated, hash)) throw new MiniAppAuthError("HASH_INVALID");

  const authDateRaw = params.get("auth_date");
  const authDateSeconds = authDateRaw ? Number(authDateRaw) : NaN;
  if (!Number.isFinite(authDateSeconds)) throw new MiniAppAuthError("AUTH_DATE_MISSING");
  if (maxAgeSeconds > 0 && now.getTime() / 1000 - authDateSeconds > maxAgeSeconds) {
    throw new MiniAppAuthError("AUTH_DATE_EXPIRED");
  }

  const user = parseTelegramUser(params.get("user"));
  const chat = parseTelegramChat(params.get("chat"));
  return {
    authDate: new Date(authDateSeconds * 1000),
    queryId: params.get("query_id") ?? undefined,
    user,
    chat,
    raw: Object.fromEntries(params.entries())
  };
}

function safeEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseTelegramUser(value: string | null): MiniAppTelegramUser | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<MiniAppTelegramUser>;
    const id = integerId(parsed.id);
    if (id == null) throw new Error("invalid id");
    return {
      id,
      first_name: stringOrUndefined(parsed.first_name),
      last_name: stringOrUndefined(parsed.last_name),
      username: stringOrUndefined(parsed.username),
      language_code: stringOrUndefined(parsed.language_code),
      is_premium: typeof parsed.is_premium === "boolean" ? parsed.is_premium : undefined,
      photo_url: stringOrUndefined(parsed.photo_url)
    };
  } catch {
    throw new MiniAppAuthError("USER_INVALID");
  }
}

function parseTelegramChat(value: string | null): MiniAppTelegramChat | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<MiniAppTelegramChat>;
    const id = integerId(parsed.id);
    if (id == null) throw new Error("invalid id");
    return {
      id,
      type: stringOrUndefined(parsed.type),
      title: stringOrUndefined(parsed.title),
      username: stringOrUndefined(parsed.username)
    };
  } catch {
    throw new MiniAppAuthError("CHAT_INVALID");
  }
}

function integerId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
