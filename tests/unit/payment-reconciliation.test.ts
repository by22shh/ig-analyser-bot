import { describe, expect, it, vi } from "vitest";
import { PaymentService } from "../../src/modules/payments/payment.service.js";
import type { YooKassaPaymentView } from "../../src/modules/payments/adapters/yookassa.adapter.js";

const orderId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000101";

describe("YooKassa payment reconciliation", () => {
  it("reconciles a succeeded pending payment and grants credits once", async () => {
    const state = makeState();
    const service = makeService(state, paymentView());

    const result = await service.reconcileYooKassaPayment({
      providerPaymentId: "pay_1",
      source: "poll"
    });

    expect(result).toMatchObject({ accepted: true, processed: true, orderId });
    expect(state.order.status).toBe("paid");
    expect(state.account.balanceUnits).toBe(300);
    expect(state.creditTransactions).toHaveLength(1);
    expect(state.creditTransactions[0]).toMatchObject({
      type: "purchase",
      amountUnits: 300,
      providerPaymentId: "pay_1"
    });
  });

  it("marks canceled provider payments without granting credits", async () => {
    const state = makeState();
    const service = makeService(state, paymentView({ status: "canceled", paid: false }));

    const result = await service.reconcileYooKassaPayment({ providerPaymentId: "pay_1" });

    expect(result).toMatchObject({ accepted: true, processed: false, status: "payment_canceled" });
    expect(state.order.status).toBe("payment_canceled");
    expect(state.creditTransactions).toHaveLength(0);
  });

  it("leaves still-pending provider payments pending", async () => {
    const state = makeState();
    const service = makeService(state, paymentView({ status: "pending", paid: false }));

    const result = await service.reconcileYooKassaPayment({ providerPaymentId: "pay_1" });

    expect(result).toMatchObject({ accepted: true, processed: false, status: "pending" });
    expect(state.order.status).toBe("pending_payment");
    expect(state.creditTransactions).toHaveLength(0);
  });

  it("refuses amount mismatches without granting credits", async () => {
    const state = makeState();
    const service = makeService(state, paymentView({ amountMinor: 1 }));

    const result = await service.reconcileYooKassaPayment({ providerPaymentId: "pay_1" });

    expect(result).toMatchObject({
      accepted: true,
      processed: false,
      errorCode: "PAYMENT_AMOUNT_MISMATCH"
    });
    expect(state.order.status).toBe("pending_payment");
    expect(state.creditTransactions).toHaveLength(0);
  });

  it("refuses metadata mismatches without granting credits", async () => {
    const state = makeState();
    const service = makeService(
      state,
      paymentView({ metadata: { order_id: orderId, user_id: "other" } })
    );

    const result = await service.reconcileYooKassaPayment({ providerPaymentId: "pay_1" });

    expect(result).toMatchObject({
      accepted: true,
      processed: false,
      errorCode: "PAYMENT_METADATA_USER_MISMATCH"
    });
    expect(state.creditTransactions).toHaveLength(0);
  });

  it("ignores duplicate processed webhook events without double-crediting", async () => {
    const state = makeState({
      order: makeOrder({ status: "paid" }),
      account: { balanceUnits: 300, reservedUnits: 0 }
    });
    state.events.set("evt_1", {
      id: "evt_1",
      provider: "yookassa",
      eventType: "payment.succeeded",
      providerObjectId: "pay_1",
      processingStatus: "processed"
    });
    const service = makeService(state, paymentView());

    const result = await service.handleYooKassaWebhook({
      event: "payment.succeeded",
      object: { id: "pay_1" },
      raw: { object: { id: "pay_1" } }
    });

    expect(result).toEqual({ accepted: true, processed: false });
    expect(state.creditTransactions).toHaveLength(0);
  });

  it("returns a taxonomy code when the webhook has no provider object", async () => {
    const state = makeState();
    const service = makeService(state, paymentView());

    await expect(
      service.handleYooKassaWebhook({
        event: "payment.succeeded",
        object: {},
        raw: {}
      })
    ).resolves.toMatchObject({
      accepted: false,
      processed: false,
      errorCode: "PAYMENT_PROVIDER_OBJECT_MISSING"
    });
  });

  it("polls aged pending orders through the same reconciliation path", async () => {
    const state = makeState();
    const service = makeService(state, paymentView());

    const result = await service.reconcilePendingYooKassaPayments({
      olderThanMinutes: 1,
      limit: 10
    });

    expect(result.checked).toBe(1);
    expect(result.processed).toBe(1);
    expect(state.order.status).toBe("paid");
    expect(state.creditTransactions).toHaveLength(1);
  });
});

type TestState = {
  order: ReturnType<typeof makeOrder>;
  events: Map<string, Record<string, any>>;
  account: { balanceUnits: number; reservedUnits: number };
  creditTransactions: Array<Record<string, any>>;
  yooKassaPayment?: Record<string, any>;
};

function makeService(state: TestState, payment: YooKassaPaymentView) {
  const yookassa = {
    getPayment: vi.fn(async () => payment),
    createPayment: vi.fn(),
    createRefund: vi.fn()
  };
  return new PaymentService(makePrisma(state) as never, {} as never, yookassa as never);
}

function makeState(overrides: Partial<TestState> = {}): TestState {
  return {
    order: makeOrder(),
    events: new Map(),
    account: { balanceUnits: 0, reservedUnits: 0 },
    creditTransactions: [],
    ...overrides
  };
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    userId,
    packageId: "pkg_1",
    provider: "yookassa",
    providerPaymentId: "pay_1",
    status: "pending_payment",
    amountMinor: 69000,
    currency: "RUB",
    creditsUnits: 300,
    package: { code: "start" },
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    ...overrides
  };
}

function paymentView(overrides: Partial<YooKassaPaymentView> = {}): YooKassaPaymentView {
  return {
    id: "pay_1",
    status: "succeeded",
    paid: true,
    amountMinor: 69000,
    currency: "RUB",
    refundable: true,
    test: true,
    metadata: { order_id: orderId, user_id: userId, package_code: "start" },
    raw: { metadata: { order_id: orderId, user_id: userId, package_code: "start" } },
    ...overrides
  };
}

function makePrisma(state: TestState) {
  const client: any = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(client),
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Array.from(strings).join("?");
      if (sql.includes("payment_events")) return [];
      if (sql.includes('"providerPaymentId"')) {
        return state.order.providerPaymentId === values[0] ? [{ id: state.order.id }] : [];
      }
      if (sql.includes("payment_orders") && sql.includes("WHERE id = CAST")) {
        return state.order.id === values[0] ? [{ id: state.order.id }] : [];
      }
      return [];
    }
  };

  client.paymentEvent = {
    create: vi.fn(async ({ data }: any) => {
      const existing = findEvent(state, data.eventType, data.providerObjectId);
      if (existing) throw new Error("duplicate");
      const event = { id: "evt_1", ...data };
      state.events.set(event.id, event);
      return event;
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      if (where.id) return state.events.get(where.id) ?? null;
      const unique = where.provider_eventType_providerObjectId;
      return findEvent(state, unique.eventType, unique.providerObjectId) ?? null;
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: any) => {
      const event = state.events.get(where.id);
      if (!event) throw new Error("event missing");
      return event;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const event = state.events.get(where.id);
      if (!event) throw new Error("event missing");
      Object.assign(event, data);
      return event;
    })
  };

  client.paymentOrder = {
    findMany: vi.fn(async () =>
      state.order.status === "pending_payment" && state.order.providerPaymentId
        ? [{ id: state.order.id, providerPaymentId: state.order.providerPaymentId }]
        : []
    ),
    findUniqueOrThrow: vi.fn(async ({ where }: any) => {
      if (where.id !== state.order.id) throw new Error("order missing");
      return state.order;
    }),
    update: vi.fn(async ({ data }: any) => {
      Object.assign(state.order, data);
      return state.order;
    })
  };

  client.creditAccount = {
    upsert: vi.fn(async () => state.account),
    update: vi.fn(async ({ data }: any) => {
      state.account.balanceUnits += data.balanceUnits?.increment ?? 0;
      state.account.balanceUnits -= data.balanceUnits?.decrement ?? 0;
      return state.account;
    })
  };
  client.creditTransaction = {
    create: vi.fn(async ({ data }: any) => {
      state.creditTransactions.push(data);
      return data;
    })
  };
  client.yooKassaPayment = {
    upsert: vi.fn(async ({ create, update }: any) => {
      state.yooKassaPayment = state.yooKassaPayment
        ? { ...state.yooKassaPayment, ...update }
        : create;
      return state.yooKassaPayment;
    })
  };
  client.fiscalReceipt = { updateMany: vi.fn(async () => ({ count: 0 })) };
  return client;
}

function findEvent(state: TestState, eventType: string, providerObjectId: string) {
  return [...state.events.values()].find(
    (event) =>
      event.provider === "yookassa" &&
      event.eventType === eventType &&
      event.providerObjectId === providerObjectId
  );
}
