import type { PrismaClient, Prisma } from "@prisma/client";
import type { Api, RawApi } from "grammy";
import { env } from "../../config/env.js";
import { CREDIT_PACKAGES, getPackage, publicPackages } from "../billing/packages.js";
import { CreditsService } from "../billing/credits.service.js";
import { decodeInvoicePayload, encodeInvoicePayload } from "./invoice-payload.js";
import type { YooKassaAdapter } from "./adapters/yookassa.adapter.js";

export class PaymentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly credits: CreditsService,
    private readonly yookassa: YooKassaAdapter
  ) {}

  async ensureCatalog() {
    for (const pkg of CREDIT_PACKAGES) {
      const created = await this.prisma.creditPackage.upsert({
        where: { code: pkg.code },
        create: {
          code: pkg.code,
          title: pkg.title,
          creditsUnits: pkg.creditsUnits,
          isActive: true,
          sortOrder: CREDIT_PACKAGES.indexOf(pkg)
        },
        update: {
          title: pkg.title,
          creditsUnits: pkg.creditsUnits,
          isActive: true
        }
      });
      if (pkg.starsAmount != null) {
        await this.prisma.creditPackagePrice.upsert({
          where: {
            packageId_provider_currency: {
              packageId: created.id,
              provider: "telegram_stars",
              currency: "XTR"
            }
          },
          create: {
            packageId: created.id,
            provider: "telegram_stars",
            currency: "XTR",
            amountMinor: pkg.starsAmount,
            isPublic: pkg.isPublic,
            isActive: true,
            starsTitle: pkg.title,
            starsDescription: `${pkg.title} credits`
          },
          update: { amountMinor: pkg.starsAmount, isPublic: pkg.isPublic, isActive: true }
        });
      }
      if (pkg.rubAmount != null) {
        await this.prisma.creditPackagePrice.upsert({
          where: {
            packageId_provider_currency: {
              packageId: created.id,
              provider: "yookassa",
              currency: "RUB"
            }
          },
          create: {
            packageId: created.id,
            provider: "yookassa",
            currency: "RUB",
            amountMinor: pkg.rubAmount * 100,
            isPublic: pkg.isPublic && pkg.code === "start",
            isActive: true,
            yookassaDescription: `${pkg.title} credits`
          },
          update: {
            amountMinor: pkg.rubAmount * 100,
            isPublic: pkg.isPublic && pkg.code === "start",
            isActive: true
          }
        });
      }
    }
  }

  packages(provider: "telegram_stars" | "yookassa") {
    return publicPackages(provider);
  }

  async createTelegramStarsInvoice(input: {
    api: Api<RawApi>;
    userId: string;
    telegramUserId: number;
    chatId: number;
    packageCode: string;
    idempotencyKey: string;
    title?: string;
    description?: string;
  }) {
    const pkg = getPackage(input.packageCode);
    if (!pkg?.starsAmount) throw new Error("PACKAGE_NOT_FOUND");
    const dbPkg = await this.prisma.creditPackage.findUniqueOrThrow({ where: { code: pkg.code } });
    const price = await this.prisma.creditPackagePrice.findFirstOrThrow({
      where: { packageId: dbPkg.id, provider: "telegram_stars", currency: "XTR", isActive: true }
    });
    const existingOrder = await this.prisma.paymentOrder.findFirst({
      where: {
        userId: input.userId,
        packageId: dbPkg.id,
        provider: "telegram_stars",
        status: "pending_payment",
        telegramChatId: BigInt(input.chatId),
        expiresAt: { gt: new Date() }
      },
      include: { telegramStarPayment: true },
      orderBy: { createdAt: "desc" }
    });
    if (
      existingOrder?.telegramStarPayment &&
      existingOrder.amountMinor === price.amountMinor &&
      existingOrder.telegramStarPayment.status !== "invoice_failed" &&
      existingOrder.telegramStarPayment.telegramUserId === BigInt(input.telegramUserId)
    ) {
      return {
        orderId: existingOrder.id,
        invoicePayload: existingOrder.telegramStarPayment.invoicePayload,
        starsAmount: price.amountMinor,
        creditsUnits: existingOrder.creditsUnits,
        reused: true as const
      };
    }
    const order = await this.prisma.paymentOrder.create({
      data: {
        userId: input.userId,
        packageId: dbPkg.id,
        packagePriceId: price.id,
        status: "pending_payment",
        amountMinor: price.amountMinor,
        currency: "XTR",
        creditsUnits: pkg.creditsUnits,
        provider: "telegram_stars",
        idempotencyKey: input.idempotencyKey,
        telegramChatId: BigInt(input.chatId),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      }
    });
    const invoicePayload = encodeInvoicePayload({
      v: 1,
      provider: "telegram_stars",
      orderId: order.id,
      userId: input.userId,
      packageCode: pkg.code,
      currency: "XTR",
      amountMinor: price.amountMinor
    });
    await this.prisma.telegramStarPayment.create({
      data: {
        paymentOrderId: order.id,
        telegramUserId: BigInt(input.telegramUserId),
        telegramChatId: BigInt(input.chatId),
        invoicePayload,
        status: "invoice_sent",
        starsAmount: price.amountMinor,
        currency: "XTR"
      }
    });
    const message = await input.api
      .sendInvoice(
        input.chatId,
        input.title ?? `${pkg.title}: ${pkg.creditsUnits / 100} credits`,
        input.description ?? `ZRETI credit package ${pkg.title}`,
        invoicePayload,
        "XTR",
        [{ label: pkg.title, amount: price.amountMinor }],
        { provider_token: "" }
      )
      .catch(async (error) => {
        await this.prisma.paymentOrder.update({
          where: { id: order.id },
          data: { status: "invoice_failed" }
        });
        await this.prisma.telegramStarPayment.update({
          where: { paymentOrderId: order.id },
          data: {
            status: "invoice_failed",
            rawSuccessfulPayment: { error: error instanceof Error ? error.message : String(error) }
          }
        });
        throw error;
      });
    await this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: { telegramInvoiceMessageId: BigInt(message.message_id) }
    });
    await this.prisma.telegramStarPayment.update({
      where: { paymentOrderId: order.id },
      data: { invoiceMessageId: BigInt(message.message_id) }
    });
    return {
      orderId: order.id,
      invoicePayload,
      starsAmount: price.amountMinor,
      creditsUnits: pkg.creditsUnits,
      reused: false as const
    };
  }

  async handleTelegramPreCheckout(input: {
    preCheckoutQueryId: string;
    telegramUserId: number;
    currency: string;
    totalAmount: number;
    invoicePayload: string;
    raw: Prisma.InputJsonValue;
    payloadInvalidMessage?: string;
    paymentInvalidMessage?: string;
  }) {
    const payload = decodeInvoicePayload(input.invoicePayload);
    if (!payload)
      return {
        ok: false,
        errorMessage: input.payloadInvalidMessage ?? "The price has expired. Open top-up again."
      };
    const order = await this.prisma.paymentOrder.findUnique({
      where: { id: payload.orderId },
      include: { telegramStarPayment: true }
    });
    if (
      !order ||
      order.provider !== "telegram_stars" ||
      order.status !== "pending_payment" ||
      order.currency !== input.currency ||
      order.amountMinor !== input.totalAmount ||
      order.userId !== payload.userId ||
      !order.telegramStarPayment ||
      order.telegramStarPayment.telegramUserId !== BigInt(input.telegramUserId) ||
      (order.expiresAt && order.expiresAt < new Date())
    ) {
      return {
        ok: false,
        errorMessage: input.paymentInvalidMessage ?? "Payment was not found or the amount changed."
      };
    }
    await this.prisma.telegramStarPayment.update({
      where: { paymentOrderId: order.id },
      data: {
        preCheckoutQueryId: input.preCheckoutQueryId,
        rawPreCheckoutQuery: input.raw,
        status: "pre_checkout_approved"
      }
    });
    return { ok: true, orderId: order.id };
  }

  async handleTelegramSuccessfulPayment(input: {
    telegramUserId: number;
    chatId: number;
    messageId: number;
    currency: string;
    totalAmount: number;
    invoicePayload: string;
    telegramPaymentChargeId: string;
    providerPaymentChargeId?: string;
    raw: Prisma.InputJsonValue;
  }) {
    const payload = decodeInvoicePayload(input.invoicePayload);
    if (!payload) throw new Error("PAYLOAD_INVALID");
    const eventKey = {
      provider: "telegram_stars",
      eventType: "successful_payment",
      providerObjectId: input.telegramPaymentChargeId
    };
    const existingEvent = await this.prisma.paymentEvent.findUnique({
      where: { provider_eventType_providerObjectId: eventKey }
    });
    const event =
      existingEvent ??
      (await this.prisma.paymentEvent
        .create({
          data: {
            ...eventKey,
            paymentOrderId: payload.orderId,
            payload: input.raw,
            processingStatus: "received"
          }
        })
        .catch(() =>
          this.prisma.paymentEvent.findUniqueOrThrow({
            where: { provider_eventType_providerObjectId: eventKey }
          })
        ));

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payment_events WHERE id = CAST(${event.id} AS uuid) FOR UPDATE`;
      const lockedEvent = await tx.paymentEvent.findUniqueOrThrow({ where: { id: event.id } });
      if (lockedEvent.processingStatus === "processed") {
        return { processed: false, orderId: lockedEvent.paymentOrderId ?? payload.orderId };
      }
      const duplicate = await tx.telegramStarPayment.findFirst({
        where: { telegramPaymentChargeId: input.telegramPaymentChargeId }
      });
      if (duplicate?.status === "paid") {
        await tx.paymentEvent.update({
          where: { id: event.id },
          data: {
            paymentOrderId: duplicate.paymentOrderId,
            processingStatus: "processed",
            processedAt: new Date()
          }
        });
        return { processed: false, orderId: duplicate.paymentOrderId };
      }

      const order = await tx.paymentOrder.findUniqueOrThrow({
        where: { id: payload.orderId },
        include: { telegramStarPayment: true }
      });
      if (order.status === "paid") {
        await tx.paymentEvent.update({
          where: { id: event.id },
          data: {
            paymentOrderId: order.id,
            processingStatus: "processed",
            processedAt: new Date()
          }
        });
        return { processed: false, orderId: order.id };
      }
      if (
        order.userId !== payload.userId ||
        order.amountMinor !== input.totalAmount ||
        order.currency !== input.currency ||
        !order.telegramStarPayment ||
        order.telegramStarPayment.telegramUserId !== BigInt(input.telegramUserId) ||
        order.telegramStarPayment.telegramChatId !== BigInt(input.chatId) ||
        order.telegramStarPayment.invoicePayload !== input.invoicePayload
      ) {
        throw new Error("PAYMENT_MISMATCH");
      }
      await tx.telegramStarPayment.update({
        where: { paymentOrderId: order.id },
        data: {
          telegramPaymentChargeId: input.telegramPaymentChargeId,
          providerPaymentChargeId: input.providerPaymentChargeId,
          status: "paid",
          successfulPayment: input.raw,
          rawSuccessfulPayment: input.raw
        }
      });
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: {
          status: "paid",
          providerPaymentId: input.telegramPaymentChargeId,
          paidAt: new Date()
        }
      });
      await tx.$queryRaw`SELECT id FROM credit_accounts WHERE "userId" = CAST(${order.userId} AS uuid) FOR UPDATE`;
      const account = await tx.creditAccount.update({
        where: { userId: order.userId },
        data: { balanceUnits: { increment: order.creditsUnits } }
      });
      await tx.creditTransaction.create({
        data: {
          userId: order.userId,
          type: "purchase",
          amountUnits: order.creditsUnits,
          balanceAfterUnits: account.balanceUnits,
          provider: "telegram_stars",
          providerPaymentId: input.telegramPaymentChargeId,
          metadata: { orderId: order.id }
        }
      });
      await tx.paymentEvent.update({
        where: { id: event.id },
        data: {
          paymentOrderId: order.id,
          processingStatus: "processed",
          processedAt: new Date()
        }
      });
      return {
        processed: true,
        orderId: order.id,
        creditsUnitsGranted: order.creditsUnits,
        balanceUnits: account.balanceUnits
      };
    });
  }

  async createYooKassaOrder(input: {
    userId: string;
    chatId: number;
    packageCode: string;
    userEmail?: string;
    idempotencyKey: string;
  }) {
    const pkg = getPackage(input.packageCode);
    if (!pkg?.rubAmount) throw new Error("PACKAGE_NOT_FOUND");
    if (pkg.code !== "start") throw new Error("PACKAGE_NOT_PUBLIC_FOR_YOOKASSA");
    const dbPkg = await this.prisma.creditPackage.findUniqueOrThrow({ where: { code: pkg.code } });
    const price = await this.prisma.creditPackagePrice.findFirstOrThrow({
      where: {
        packageId: dbPkg.id,
        provider: "yookassa",
        currency: "RUB",
        isActive: true,
        isPublic: true
      }
    });
    const existingOrder = await this.prisma.paymentOrder.findFirst({
      where: {
        userId: input.userId,
        packageId: dbPkg.id,
        provider: "yookassa",
        status: "pending_payment",
        telegramChatId: BigInt(input.chatId),
        userEmail: input.userEmail ?? null,
        confirmationUrl: { not: null },
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" }
    });
    if (existingOrder?.confirmationUrl && existingOrder.amountMinor === price.amountMinor) {
      return {
        orderId: existingOrder.id,
        confirmationUrl: existingOrder.confirmationUrl,
        amountMinor: existingOrder.amountMinor,
        creditsUnits: existingOrder.creditsUnits,
        reused: true as const
      };
    }
    const order = await this.prisma.paymentOrder.create({
      data: {
        userId: input.userId,
        packageId: dbPkg.id,
        packagePriceId: price.id,
        status: "pending_payment",
        amountMinor: price.amountMinor,
        currency: "RUB",
        creditsUnits: pkg.creditsUnits,
        provider: "yookassa",
        idempotencyKey: input.idempotencyKey,
        telegramChatId: BigInt(input.chatId),
        userEmail: input.userEmail,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      }
    });
    const payment = await this.yookassa
      .createPayment({
        idempotencyKey: order.id,
        amountMinor: price.amountMinor,
        description: `ZRETI ${pkg.title}: ${pkg.creditsUnits / 100} credits`,
        returnUrl: env.YOOKASSA_RETURN_URL,
        metadata: { order_id: order.id, user_id: input.userId, package_code: pkg.code },
        email: input.userEmail
      })
      .catch(async (error) => {
        await this.prisma.paymentOrder.update({
          where: { id: order.id },
          data: { status: "payment_create_failed" }
        });
        throw error;
      });
    await this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: { providerPaymentId: payment.id, confirmationUrl: payment.confirmationUrl }
    });
    await this.prisma.yooKassaPayment.create({
      data: {
        paymentOrderId: order.id,
        yookassaPaymentId: payment.id,
        status: payment.status,
        paid: payment.paid,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        refundable: payment.refundable,
        test: payment.test,
        raw: payment.raw as never
      }
    });
    if (env.YOOKASSA_USE_RECEIPTS && input.userEmail) {
      await this.prisma.fiscalReceipt.create({
        data: {
          paymentOrderId: order.id,
          provider: "yookassa",
          type: "payment",
          status: "pending",
          customerEmail: input.userEmail,
          amountMinor: price.amountMinor,
          currency: "RUB",
          taxSystemCode: env.YOOKASSA_DEFAULT_TAX_SYSTEM_CODE
            ? Number(env.YOOKASSA_DEFAULT_TAX_SYSTEM_CODE)
            : undefined,
          vatCode: env.YOOKASSA_DEFAULT_VAT_CODE,
          payload: { orderId: order.id, packageCode: pkg.code }
        }
      });
    }
    return {
      orderId: order.id,
      confirmationUrl: payment.confirmationUrl,
      amountMinor: price.amountMinor,
      creditsUnits: pkg.creditsUnits,
      reused: false as const
    };
  }

  async handleYooKassaWebhook(input: { event: string; object: any; raw: Prisma.InputJsonValue }) {
    const providerObjectId = input.object?.id;
    if (!providerObjectId) return { accepted: false, processed: false };
    const event = await this.prisma.paymentEvent
      .create({
        data: {
          provider: "yookassa",
          eventType: input.event,
          providerObjectId,
          payload: input.raw,
          processingStatus: "received"
        }
      })
      .catch(async () => {
        const existing = await this.prisma.paymentEvent.findUnique({
          where: {
            provider_eventType_providerObjectId: {
              provider: "yookassa",
              eventType: input.event,
              providerObjectId
            }
          }
        });
        return existing;
      });
    if (!event || event.processingStatus === "processed")
      return { accepted: true, processed: false };

    if (input.event !== "payment.succeeded") {
      await this.prisma.paymentEvent.update({
        where: { id: event.id },
        data: { processingStatus: "ignored", processedAt: new Date() }
      });
      return { accepted: true, processed: false };
    }
    const payment = await this.yookassa.getPayment(providerObjectId);
    if (!payment.paid || payment.status !== "succeeded") {
      await this.prisma.paymentEvent.update({
        where: { id: event.id },
        data: { processingStatus: "ignored", processedAt: new Date() }
      });
      return { accepted: true, processed: false };
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payment_events WHERE id = CAST(${event.id} AS uuid) FOR UPDATE`;
      const lockedEvent = await tx.paymentEvent.findUniqueOrThrow({ where: { id: event.id } });
      if (lockedEvent.processingStatus === "processed") return { accepted: true, processed: false };

      const orderLocks = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM payment_orders WHERE "providerPaymentId" = ${providerObjectId} FOR UPDATE`;
      const orderId = orderLocks[0]?.id;
      if (!orderId) throw new Error("PAYMENT_ORDER_NOT_FOUND");
      const order = await tx.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
      if (order.status === "paid") {
        await tx.paymentEvent.update({
          where: { id: event.id },
          data: { paymentOrderId: order.id, processingStatus: "processed", processedAt: new Date() }
        });
        return { accepted: true, processed: false, orderId: order.id };
      }
      if (order.amountMinor !== payment.amountMinor || order.currency !== payment.currency) {
        await tx.paymentEvent.update({
          where: { id: event.id },
          data: {
            paymentOrderId: order.id,
            processingStatus: "failed",
            errorCode: "PAYMENT_AMOUNT_MISMATCH",
            processedAt: new Date()
          }
        });
        return { accepted: true, processed: false, orderId: order.id };
      }

      await tx.$queryRaw`SELECT id FROM credit_accounts WHERE "userId" = CAST(${order.userId} AS uuid) FOR UPDATE`;
      const account = await tx.creditAccount.update({
        where: { userId: order.userId },
        data: { balanceUnits: { increment: order.creditsUnits } }
      });
      await tx.creditTransaction.create({
        data: {
          userId: order.userId,
          type: "purchase",
          amountUnits: order.creditsUnits,
          balanceAfterUnits: account.balanceUnits,
          provider: "yookassa",
          providerPaymentId: providerObjectId,
          metadata: { orderId: order.id }
        }
      });
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: { status: "paid", paidAt: new Date() }
      });
      await tx.yooKassaPayment.update({
        where: { paymentOrderId: order.id },
        data: {
          status: payment.status,
          paid: payment.paid,
          refundable: payment.refundable,
          raw: payment.raw as never
        }
      });
      await tx.fiscalReceipt.updateMany({
        where: {
          paymentOrderId: order.id,
          provider: "yookassa",
          type: "payment",
          status: "pending"
        },
        data: { status: "succeeded", raw: payment.raw as never }
      });
      await tx.paymentEvent.update({
        where: { id: event.id },
        data: { paymentOrderId: order.id, processingStatus: "processed", processedAt: new Date() }
      });
      return {
        accepted: true,
        processed: true,
        orderId: order.id,
        creditsUnitsGranted: order.creditsUnits
      };
    });
  }

  async refundTelegramStarsPayment(input: {
    api: Api<RawApi>;
    paymentOrderId: string;
    adminUserId?: string;
    reason: string;
  }) {
    const order = await this.prisma.paymentOrder.findUniqueOrThrow({
      where: { id: input.paymentOrderId },
      include: { telegramStarPayment: true }
    });
    if (!order.telegramStarPayment?.telegramPaymentChargeId)
      throw new Error("STARS_CHARGE_ID_MISSING");
    if (order.status !== "paid") throw new Error("ORDER_NOT_PAID");
    if (!env.TELEGRAM_STARS_REFUNDS_ENABLED) throw new Error("STARS_REFUNDS_DISABLED");
    const existing = await this.prisma.paymentRefund.findFirst({
      where: { paymentOrderId: order.id, provider: "telegram_stars" },
      orderBy: { createdAt: "desc" }
    });
    if (existing?.status === "succeeded")
      return { refundId: existing.id, status: "succeeded" as const, alreadyProcessed: true };
    if (existing) throw new Error("REFUND_ALREADY_EXISTS");

    const snapshot = await this.credits.snapshot(order.userId);
    if (snapshot.availableUnits < order.creditsUnits) throw new Error("REFUND_CREDITS_SPENT");

    const refund = await this.prisma.paymentRefund.create({
      data: {
        paymentOrderId: order.id,
        provider: "telegram_stars",
        providerRefundId: `stars:${order.telegramStarPayment.telegramPaymentChargeId}`,
        status: "pending",
        amountMinor: order.amountMinor,
        currency: "XTR",
        reason: input.reason,
        idempotencyKey: `stars-refund:${order.id}`,
        adminUserId: input.adminUserId
      }
    });
    await this.credits.debit({
      userId: order.userId,
      amountUnits: order.creditsUnits,
      provider: "telegram_stars",
      providerPaymentId: order.telegramStarPayment.telegramPaymentChargeId,
      metadata: { refundId: refund.id },
      type: "refund"
    });
    try {
      await input.api.refundStarPayment(
        Number(order.telegramStarPayment.telegramUserId),
        order.telegramStarPayment.telegramPaymentChargeId
      );
      await this.prisma.paymentRefund.update({
        where: { id: refund.id },
        data: { status: "succeeded" }
      });
    } catch (error) {
      await this.credits.grant({
        userId: order.userId,
        amountUnits: order.creditsUnits,
        provider: "telegram_stars",
        providerPaymentId: order.telegramStarPayment.telegramPaymentChargeId,
        metadata: { refundId: refund.id, reason: "telegram_refund_failed" },
        type: "admin_adjustment"
      });
      await this.prisma.paymentRefund.update({
        where: { id: refund.id },
        data: {
          status: "failed",
          raw: { error: error instanceof Error ? error.message : String(error) }
        }
      });
      throw error;
    }
    return { refundId: refund.id, status: "succeeded" as const };
  }
}
