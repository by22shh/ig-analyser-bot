import { describe, expect, it, vi } from "vitest";
import { publicPackages } from "../../src/modules/billing/packages.js";
import { MockYooKassaAdapter } from "../../src/modules/payments/adapters/yookassa.adapter.js";
import { PaymentService } from "../../src/modules/payments/payment.service.js";

describe("PaymentService package visibility", () => {
  it("exposes every public RUB package through YooKassa", () => {
    expect(publicPackages("yookassa").map((pkg) => pkg.code)).toEqual(["start", "pro", "agency"]);
  });

  it("memoizes catalog synchronization after the first successful run", async () => {
    let packageId = 0;
    const prisma = {
      creditPackage: {
        upsert: vi.fn(async () => ({ id: `package-${++packageId}` }))
      },
      creditPackagePrice: {
        upsert: vi.fn(async () => undefined)
      }
    };
    const payments = new PaymentService(prisma as never, {} as never, {} as never);

    await payments.ensureCatalog();
    await payments.ensureCatalog();

    expect(prisma.creditPackage.upsert).toHaveBeenCalledTimes(5);
    expect(prisma.creditPackagePrice.upsert).toHaveBeenCalledTimes(8);
  });

  it("rejects hidden Telegram Stars packages before creating an invoice", async () => {
    const prisma = {
      creditPackage: { findUniqueOrThrow: vi.fn() },
      creditPackagePrice: { findFirstOrThrow: vi.fn() }
    };
    const api = { sendInvoice: vi.fn(), createInvoiceLink: vi.fn() };
    const payments = new PaymentService(prisma as never, {} as never, {} as never);

    await expect(
      payments.createTelegramStarsInvoice({
        api: api as never,
        userId: "user-1",
        telegramUserId: 100,
        chatId: 100,
        packageCode: "scale",
        idempotencyKey: "stars-hidden-1"
      })
    ).rejects.toThrow("PACKAGE_NOT_FOUND");
    await expect(
      payments.createTelegramStarsInvoiceLink({
        api: api as never,
        userId: "user-1",
        telegramUserId: 100,
        chatId: 100,
        packageCode: "scale",
        idempotencyKey: "stars-hidden-2"
      })
    ).rejects.toThrow("PACKAGE_NOT_FOUND");

    expect(prisma.creditPackage.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.creditPackagePrice.findFirstOrThrow).not.toHaveBeenCalled();
    expect(api.sendInvoice).not.toHaveBeenCalled();
    expect(api.createInvoiceLink).not.toHaveBeenCalled();
  });

  it("rejects hidden YooKassa packages before creating an order", async () => {
    const prisma = {
      creditPackage: { findUniqueOrThrow: vi.fn() },
      creditPackagePrice: { findFirstOrThrow: vi.fn() },
      paymentOrder: { findFirst: vi.fn(), create: vi.fn() }
    };
    const yookassa = { createPayment: vi.fn() };
    const payments = new PaymentService(prisma as never, {} as never, yookassa as never);

    await expect(
      payments.createYooKassaOrder({
        userId: "user-1",
        chatId: 100,
        packageCode: "scale",
        idempotencyKey: "yk-hidden-1"
      })
    ).rejects.toThrow("PACKAGE_NOT_FOUND");

    expect(prisma.creditPackage.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.creditPackagePrice.findFirstOrThrow).not.toHaveBeenCalled();
    expect(yookassa.createPayment).not.toHaveBeenCalled();
  });

  it("keeps mock YooKassa payment amounts for non-start packages", async () => {
    const yookassa = new MockYooKassaAdapter();

    const payment = await yookassa.createPayment({
      idempotencyKey: "pro-order",
      amountMinor: 230000,
      description: "Pro credits",
      returnUrl: "http://localhost:3000/payments/yookassa/return",
      metadata: { order_id: "order-1", user_id: "user-1", package_code: "pro" }
    });
    const reconciled = await yookassa.getPayment(payment.id);

    expect(reconciled).toMatchObject({
      id: payment.id,
      status: "succeeded",
      paid: true,
      amountMinor: 230000
    });
  });
});
