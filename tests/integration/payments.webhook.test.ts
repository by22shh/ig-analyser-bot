import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CreditsService } from "../../src/modules/billing/credits.service.js";
import { MockYooKassaAdapter } from "../../src/modules/payments/adapters/yookassa.adapter.js";
import { encodeInvoicePayload } from "../../src/modules/payments/invoice-payload.js";
import { PaymentService } from "../../src/modules/payments/payment.service.js";
import { UserService } from "../../src/modules/users/user.service.js";
import { dbAvailable, deleteUsers, prisma, seedUser, uniqueBigInt } from "./_db.js";

type WebhookResult = { processed: boolean; creditsUnitsGranted?: number };

const createdUserIds: string[] = [];

describe.skipIf(!dbAvailable)("Payment webhooks (integration)", () => {
  const credits = new CreditsService(prisma);
  const payments = new PaymentService(prisma, credits, new MockYooKassaAdapter());
  const users = new UserService(prisma, { deleteObjects: async () => undefined });
  let startPackageId = "";

  beforeAll(async () => {
    await payments.ensureCatalog();
    const pkg = await prisma.creditPackage.findUniqueOrThrow({ where: { code: "start" } });
    startPackageId = pkg.id;
  });

  afterAll(async () => {
    await deleteUsers(createdUserIds);
    await prisma.$disconnect();
  });

  async function user(balanceUnits = 0) {
    const created = await seedUser(balanceUnits);
    createdUserIds.push(created.id);
    return created;
  }

  async function yookassaOrder(amountMinor: number) {
    const u = await user(0);
    const providerPaymentId = `yk_${uniqueBigInt()}`;
    const order = await prisma.paymentOrder.create({
      data: {
        userId: u.id,
        packageId: startPackageId,
        status: "pending_payment",
        amountMinor,
        currency: "RUB",
        creditsUnits: 300,
        provider: "yookassa",
        providerPaymentId,
        idempotencyKey: `it-${uniqueBigInt()}`
      }
    });
    await prisma.yooKassaPayment.create({
      data: {
        paymentOrderId: order.id,
        yookassaPaymentId: providerPaymentId,
        status: "pending",
        paid: false,
        amountMinor,
        currency: "RUB"
      }
    });
    return { user: u, providerPaymentId };
  }

  async function paidStarsOrder(input: { balanceUnits: number; creditsUnits: number }) {
    const u = await user(input.balanceUnits);
    const chatId = Number(uniqueBigInt() % 1_000_000_000n);
    const telegramUserId = Number(uniqueBigInt() % 1_000_000_000n);
    const chargeId = `charge_${uniqueBigInt()}`;
    const order = await prisma.paymentOrder.create({
      data: {
        userId: u.id,
        packageId: startPackageId,
        status: "paid",
        amountMinor: 690,
        currency: "XTR",
        creditsUnits: input.creditsUnits,
        provider: "telegram_stars",
        providerPaymentId: chargeId,
        idempotencyKey: `it-${uniqueBigInt()}`,
        telegramChatId: BigInt(chatId),
        paidAt: new Date()
      }
    });
    await prisma.telegramStarPayment.create({
      data: {
        paymentOrderId: order.id,
        telegramUserId: BigInt(telegramUserId),
        telegramChatId: BigInt(chatId),
        invoicePayload: `payload-${uniqueBigInt()}`,
        telegramPaymentChargeId: chargeId,
        status: "paid",
        starsAmount: 690,
        currency: "XTR"
      }
    });
    return { user: u, order, telegramUserId, chargeId };
  }

  it("grants YooKassa credits once and ignores a duplicate webhook", async () => {
    // MockYooKassaAdapter.getPayment reports succeeded for 69000 minor units.
    const { user: u, providerPaymentId } = await yookassaOrder(69000);
    const webhook = {
      event: "payment.succeeded",
      object: { id: providerPaymentId },
      raw: { id: providerPaymentId }
    };

    const first = (await payments.handleYooKassaWebhook(webhook)) as WebhookResult;
    expect(first.processed).toBe(true);
    expect(first.creditsUnitsGranted).toBe(300);
    expect((await credits.snapshot(u.id)).balanceUnits).toBe(300);

    const second = (await payments.handleYooKassaWebhook(webhook)) as WebhookResult;
    expect(second.processed).toBe(false);
    expect((await credits.snapshot(u.id)).balanceUnits).toBe(300);
  });

  it("rejects a YooKassa webhook whose amount does not match the order", async () => {
    const { user: u, providerPaymentId } = await yookassaOrder(50000);

    const result = (await payments.handleYooKassaWebhook({
      event: "payment.succeeded",
      object: { id: providerPaymentId },
      raw: { id: providerPaymentId }
    })) as WebhookResult;

    expect(result.processed).toBe(false);
    expect((await credits.snapshot(u.id)).balanceUnits).toBe(0);
  });

  it("grants Telegram Stars credits once and ignores a re-delivered charge", async () => {
    const u = await user(0);
    const chatId = Number(uniqueBigInt() % 1_000_000_000n);
    const telegramUserId = Number(uniqueBigInt() % 1_000_000_000n);
    const order = await prisma.paymentOrder.create({
      data: {
        userId: u.id,
        packageId: startPackageId,
        status: "pending_payment",
        amountMinor: 690,
        currency: "XTR",
        creditsUnits: 300,
        provider: "telegram_stars",
        idempotencyKey: `it-${uniqueBigInt()}`,
        telegramChatId: BigInt(chatId)
      }
    });
    const invoicePayload = encodeInvoicePayload({
      v: 1,
      provider: "telegram_stars",
      orderId: order.id,
      userId: u.id,
      packageCode: "start",
      currency: "XTR",
      amountMinor: 690
    });
    await prisma.telegramStarPayment.create({
      data: {
        paymentOrderId: order.id,
        telegramUserId: BigInt(telegramUserId),
        telegramChatId: BigInt(chatId),
        invoicePayload,
        status: "pre_checkout_approved",
        starsAmount: 690,
        currency: "XTR"
      }
    });
    const payload = {
      telegramUserId,
      chatId,
      messageId: 1,
      currency: "XTR",
      totalAmount: 690,
      invoicePayload,
      telegramPaymentChargeId: `charge_${uniqueBigInt()}`,
      raw: {}
    };

    const first = (await payments.handleTelegramSuccessfulPayment(payload)) as WebhookResult;
    expect(first.processed).toBe(true);
    expect(first.creditsUnitsGranted).toBe(300);
    expect((await credits.snapshot(u.id)).balanceUnits).toBe(300);

    const second = (await payments.handleTelegramSuccessfulPayment(payload)) as WebhookResult;
    expect(second.processed).toBe(false);
    expect((await credits.snapshot(u.id)).balanceUnits).toBe(300);
  });

  it("recovers a deleted user account when a pending Telegram Stars invoice is paid", async () => {
    const u = await user(0);
    const chatId = Number(uniqueBigInt() % 1_000_000_000n);
    const telegramUserId = Number(uniqueBigInt() % 1_000_000_000n);
    await prisma.user.update({ where: { id: u.id }, data: { telegramId: BigInt(telegramUserId) } });
    const order = await prisma.paymentOrder.create({
      data: {
        userId: u.id,
        packageId: startPackageId,
        status: "pending_payment",
        amountMinor: 690,
        currency: "XTR",
        creditsUnits: 300,
        provider: "telegram_stars",
        idempotencyKey: `it-${uniqueBigInt()}`,
        telegramChatId: BigInt(chatId),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      }
    });
    const invoicePayload = encodeInvoicePayload({
      v: 1,
      provider: "telegram_stars",
      orderId: order.id,
      userId: u.id,
      packageCode: "start",
      currency: "XTR",
      amountMinor: 690
    });
    await prisma.telegramStarPayment.create({
      data: {
        paymentOrderId: order.id,
        telegramUserId: BigInt(telegramUserId),
        telegramChatId: BigInt(chatId),
        invoicePayload,
        status: "pre_checkout_approved",
        starsAmount: 690,
        currency: "XTR"
      }
    });

    await users.deleteMe(u.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe("deleted");

    const result = (await payments.handleTelegramSuccessfulPayment({
      telegramUserId,
      chatId,
      messageId: 1,
      currency: "XTR",
      totalAmount: 690,
      invoicePayload,
      telegramPaymentChargeId: `charge_${uniqueBigInt()}`,
      raw: {}
    })) as WebhookResult;

    expect(result.processed).toBe(true);
    expect(result.creditsUnitsGranted).toBe(300);
    const restored = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(restored.status).toBe("active");
    expect(restored.telegramId).toBe(BigInt(telegramUserId));
    expect((await credits.snapshot(u.id)).balanceUnits).toBe(300);
  });

  it("refunds Telegram Stars and debits unused credits atomically", async () => {
    const {
      user: u,
      order,
      telegramUserId,
      chargeId
    } = await paidStarsOrder({
      balanceUnits: 300,
      creditsUnits: 300
    });
    const api = { refundStarPayment: vi.fn().mockResolvedValue(true) };

    const result = await payments.refundTelegramStarsPayment({
      api: api as never,
      paymentOrderId: order.id,
      reason: "integration_refund"
    });

    expect(result.status).toBe("succeeded");
    expect(api.refundStarPayment).toHaveBeenCalledWith(telegramUserId, chargeId);
    expect((await credits.snapshot(u.id)).balanceUnits).toBe(0);
    const refund = await prisma.paymentRefund.findUniqueOrThrow({ where: { id: result.refundId } });
    expect(refund.status).toBe("succeeded");
  });

  it("does not leave a pending Stars refund when credits were already spent", async () => {
    const { order } = await paidStarsOrder({ balanceUnits: 0, creditsUnits: 300 });
    const api = { refundStarPayment: vi.fn().mockResolvedValue(true) };

    await expect(
      payments.refundTelegramStarsPayment({
        api: api as never,
        paymentOrderId: order.id,
        reason: "integration_refund"
      })
    ).rejects.toThrow("REFUND_CREDITS_SPENT");

    expect(api.refundStarPayment).not.toHaveBeenCalled();
    await expect(
      prisma.paymentRefund.findFirstOrThrow({ where: { paymentOrderId: order.id } })
    ).rejects.toThrow();
  });
});
