export type InvoicePayload = {
  v: 1;
  orderId: string;
  userId: string;
  packageCode: string;
  provider: "telegram_stars" | "yookassa";
  amountMinor: number;
  currency: "XTR" | "RUB";
};

export function encodeInvoicePayload(payload: InvoicePayload): string {
  const raw = [
    "zreti",
    payload.v,
    payload.provider,
    payload.orderId,
    payload.userId,
    payload.packageCode,
    payload.currency,
    payload.amountMinor
  ].join(":");
  return raw;
}

export function decodeInvoicePayload(value: string): InvoicePayload | null {
  const parts = value.split(":");
  if (parts.length !== 8 || parts[0] !== "zreti") return null;
  const amountMinor = Number(parts[7]);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return null;
  if (parts[1] !== "1") return null;
  if (parts[2] !== "telegram_stars" && parts[2] !== "yookassa") return null;
  if (parts[6] !== "XTR" && parts[6] !== "RUB") return null;
  return {
    v: 1,
    provider: parts[2],
    orderId: parts[3] ?? "",
    userId: parts[4] ?? "",
    packageCode: parts[5] ?? "",
    currency: parts[6],
    amountMinor
  };
}
