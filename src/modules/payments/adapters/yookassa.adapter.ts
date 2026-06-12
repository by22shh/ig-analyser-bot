import { createHash } from "node:crypto";
import { env } from "../../../config/env.js";

export type CreateYooKassaPaymentInput = {
  idempotencyKey: string;
  amountMinor: number;
  description: string;
  returnUrl: string;
  metadata: Record<string, string>;
  email?: string;
};

export type YooKassaPaymentView = {
  id: string;
  status: string;
  paid: boolean;
  amountMinor: number;
  currency: "RUB";
  confirmationUrl?: string;
  refundable: boolean;
  test: boolean;
  metadata?: Record<string, string>;
  raw?: unknown;
};

export interface YooKassaAdapter {
  createPayment(input: CreateYooKassaPaymentInput): Promise<YooKassaPaymentView>;
  getPayment(paymentId: string): Promise<YooKassaPaymentView>;
  createRefund(input: {
    paymentId: string;
    amountMinor: number;
    idempotencyKey: string;
    reason: string;
  }): Promise<{ id: string; status: string; raw?: unknown }>;
}

export class MockYooKassaAdapter implements YooKassaAdapter {
  private readonly payments = new Map<string, YooKassaPaymentView>();

  async createPayment(input: CreateYooKassaPaymentInput): Promise<YooKassaPaymentView> {
    const idempotenceKey = yookassaIdempotenceKey(input.idempotencyKey, "yk");
    const id = `mock_yk_${idempotenceKey}`;
    const payment: YooKassaPaymentView = {
      id,
      status: "pending",
      paid: false,
      amountMinor: input.amountMinor,
      currency: "RUB",
      confirmationUrl: `${env.APP_BASE_URL}/mock/yookassa/pay/${id}`,
      refundable: false,
      test: true,
      metadata: input.metadata,
      raw: { mock: true }
    };
    this.payments.set(id, payment);
    return payment;
  }

  async getPayment(paymentId: string): Promise<YooKassaPaymentView> {
    const stored = this.payments.get(paymentId);
    if (stored) {
      return {
        ...stored,
        status: "succeeded",
        paid: true,
        refundable: true,
        metadata: stored.metadata,
        raw: { mock: true }
      };
    }
    return {
      id: paymentId,
      status: "succeeded",
      paid: true,
      amountMinor: 69000,
      currency: "RUB",
      refundable: true,
      test: true,
      metadata: {},
      raw: { mock: true }
    };
  }

  async createRefund(input: {
    paymentId: string;
    idempotencyKey: string;
  }): Promise<{ id: string; status: string; raw?: unknown }> {
    const idempotenceKey = yookassaIdempotenceKey(input.idempotencyKey, "yr");
    return { id: `mock_refund_${idempotenceKey}`, status: "succeeded", raw: { mock: true } };
  }
}

export class RealYooKassaAdapter implements YooKassaAdapter {
  async createPayment(input: CreateYooKassaPaymentInput): Promise<YooKassaPaymentView> {
    const idempotenceKey = yookassaIdempotenceKey(input.idempotencyKey, "yk");
    const payload: Record<string, unknown> = {
      amount: { value: (input.amountMinor / 100).toFixed(2), currency: "RUB" },
      capture: env.YOOKASSA_CAPTURE,
      confirmation: { type: "redirect", return_url: input.returnUrl },
      description: input.description,
      metadata: input.metadata
    };
    if (env.YOOKASSA_USE_RECEIPTS && input.email) {
      payload.receipt = {
        customer: { email: input.email },
        ...(env.YOOKASSA_DEFAULT_TAX_SYSTEM_CODE
          ? { tax_system_code: Number(env.YOOKASSA_DEFAULT_TAX_SYSTEM_CODE) }
          : {}),
        items: [
          {
            description: input.description.slice(0, 120),
            quantity: "1.00",
            amount: { value: (input.amountMinor / 100).toFixed(2), currency: "RUB" },
            vat_code: env.YOOKASSA_DEFAULT_VAT_CODE,
            payment_subject: "service",
            payment_mode: "full_prepayment"
          }
        ]
      };
    }
    const response = await fetch(`${env.YOOKASSA_API_BASE_URL}/payments`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString("base64")}`,
        "Content-Type": "application/json",
        "Idempotence-Key": idempotenceKey
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`YOOKASSA_CREATE_${response.status}`);
    return mapPayment(await response.json());
  }

  async getPayment(paymentId: string): Promise<YooKassaPaymentView> {
    const response = await fetch(`${env.YOOKASSA_API_BASE_URL}/payments/${paymentId}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString("base64")}`
      },
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`YOOKASSA_GET_${response.status}`);
    return mapPayment(await response.json());
  }

  async createRefund(input: {
    paymentId: string;
    amountMinor: number;
    idempotencyKey: string;
    reason: string;
  }) {
    const idempotenceKey = yookassaIdempotenceKey(input.idempotencyKey, "yr");
    const response = await fetch(`${env.YOOKASSA_API_BASE_URL}/refunds`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString("base64")}`,
        "Content-Type": "application/json",
        "Idempotence-Key": idempotenceKey
      },
      body: JSON.stringify({
        payment_id: input.paymentId,
        amount: { value: (input.amountMinor / 100).toFixed(2), currency: "RUB" },
        description: input.reason
      }),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`YOOKASSA_REFUND_${response.status}`);
    const raw = await response.json();
    return { id: raw.id, status: raw.status, raw };
  }
}

function mapPayment(raw: any): YooKassaPaymentView {
  return {
    id: raw.id,
    status: raw.status,
    paid: Boolean(raw.paid),
    amountMinor: Math.round(Number(raw.amount?.value ?? 0) * 100),
    currency: "RUB",
    confirmationUrl: raw.confirmation?.confirmation_url,
    refundable: Boolean(raw.refundable),
    test: Boolean(raw.test),
    metadata: normalizeMetadata(raw.metadata),
    raw
  };
}

function normalizeMetadata(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const metadata: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") metadata[key] = raw;
  }
  return metadata;
}

export function yookassaIdempotenceKey(raw: string, prefix: "yk" | "yr" = "yk"): string {
  const key = raw.trim();
  if (key.length > 0 && key.length <= 64) return key;
  const digest = createHash("sha256").update(key).digest("hex");
  return `${prefix}:${digest.slice(0, 64 - prefix.length - 1)}`;
}
