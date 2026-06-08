import { describe, expect, it, vi } from "vitest";
import { PaymentService } from "../../src/modules/payments/payment.service.js";

describe("PaymentService package visibility", () => {
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
});
