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
  raw?: unknown;
};

export interface YooKassaAdapter {
  createPayment(input: CreateYooKassaPaymentInput): Promise<YooKassaPaymentView>;
  getPayment(paymentId: string): Promise<YooKassaPaymentView>;
  createRefund(input: { paymentId: string; amountMinor: number; idempotencyKey: string; reason: string }): Promise<{ id: string; status: string; raw?: unknown }>;
}

export class MockYooKassaAdapter implements YooKassaAdapter {
  async createPayment(input: CreateYooKassaPaymentInput): Promise<YooKassaPaymentView> {
    const id = `mock_yk_${input.idempotencyKey}`;
    return {
      id,
      status: "pending",
      paid: false,
      amountMinor: input.amountMinor,
      currency: "RUB",
      confirmationUrl: `${env.APP_BASE_URL}/mock/yookassa/pay/${id}`,
      refundable: false,
      test: true,
      raw: { mock: true }
    };
  }

  async getPayment(paymentId: string): Promise<YooKassaPaymentView> {
    return {
      id: paymentId,
      status: "succeeded",
      paid: true,
      amountMinor: 69000,
      currency: "RUB",
      refundable: true,
      test: true,
      raw: { mock: true }
    };
  }

  async createRefund(input: { paymentId: string; idempotencyKey: string }): Promise<{ id: string; status: string; raw?: unknown }> {
    return { id: `mock_refund_${input.idempotencyKey}`, status: "succeeded", raw: { mock: true } };
  }
}

export class RealYooKassaAdapter implements YooKassaAdapter {
  async createPayment(input: CreateYooKassaPaymentInput): Promise<YooKassaPaymentView> {
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
        ...(env.YOOKASSA_DEFAULT_TAX_SYSTEM_CODE ? { tax_system_code: Number(env.YOOKASSA_DEFAULT_TAX_SYSTEM_CODE) } : {}),
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
        "Idempotence-Key": input.idempotencyKey
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`YOOKASSA_CREATE_${response.status}`);
    return mapPayment(await response.json());
  }

  async getPayment(paymentId: string): Promise<YooKassaPaymentView> {
    const response = await fetch(`${env.YOOKASSA_API_BASE_URL}/payments/${paymentId}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString("base64")}`
      }
    });
    if (!response.ok) throw new Error(`YOOKASSA_GET_${response.status}`);
    return mapPayment(await response.json());
  }

  async createRefund(input: { paymentId: string; amountMinor: number; idempotencyKey: string; reason: string }) {
    const response = await fetch(`${env.YOOKASSA_API_BASE_URL}/refunds`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString("base64")}`,
        "Content-Type": "application/json",
        "Idempotence-Key": input.idempotencyKey
      },
      body: JSON.stringify({
        payment_id: input.paymentId,
        amount: { value: (input.amountMinor / 100).toFixed(2), currency: "RUB" },
        description: input.reason
      })
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
    raw
  };
}
