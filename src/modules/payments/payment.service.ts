import type { PrismaClient, Prisma } from "@prisma/client";
import type { Api, RawApi } from "grammy";
import { env } from "../../config/env.js";
import { CREDIT_PACKAGES, getPackage, publicPackages } from "../billing/packages.js";
import { CreditsService } from "../billing/credits.service.js";
import { decodeInvoicePayload, encodeInvoicePayload } from "./invoice-payload.js";
import type { YooKassaAdapter } from "./adapters/yookassa.adapter.js";

export class PaymentService {
  private catalogSynced = false;
  private catalogSyncPromise: Promise<void> | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly credits: CreditsService,
    private readonly yookassa: YooKassaAdapter
  ) {}

  async ensureCatalog() {
    if (this.catalogSynced) return;
    this.catalogSyncPromise ??= this.syncCatalog()
      .then(() => {
        this.catalogSynced = true;
      })
      .finally(() => {
        this.catalogSyncPromise = undefined;
      });
    await this.catalogSyncPromise;
  }

  private async syncCatalog() {
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
            isPublic: pkg.isPublic,
            isActive: true,
            yookassaDescription: `${pkg.title} credits`
          },
          update: {
            amountMinor: pkg.rubAmount * 100,
            isPublic: pkg.isPublic,
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
    if (!pkg?.starsAmount || !pkg.isPublic) throw new Error("PACKAGE_NOT_FOUND");
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
        input.description ?? `Credit package ${pkg.title}`,
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

  async createTelegramStarsInvoiceLink(input: {
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
    if (!pkg?.starsAmount || !pkg.isPublic) throw new Error("PACKAGE_NOT_FOUND");
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
      existingOrder.telegramStarPayment.telegramUserId === BigInt(input.telegramUserId)
    ) {
      const invoiceUrl =
        existingOrder.confirmationUrl ??
        (await input.api.createInvoiceLink(
          input.title ?? `${pkg.title}: ${pkg.creditsUnits / 100} credits`,
          input.description ?? `Credit package ${pkg.title}`,
          existingOrder.telegramStarPayment.invoicePayload,
          "",
          "XTR",
          [{ label: pkg.title, amount: price.amountMinor }]
        ));
      if (!existingOrder.confirmationUrl) {
        await this.prisma.paymentOrder.update({
          where: { id: existingOrder.id },
          data: { confirmationUrl: invoiceUrl }
        });
      }
      return {
        orderId: existingOrder.id,
        invoicePayload: existingOrder.telegramStarPayment.invoicePayload,
        invoiceUrl,
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
        status: "invoice_link_created",
        starsAmount: price.amountMinor,
        currency: "XTR"
      }
    });
    const invoiceUrl = await input.api
      .createInvoiceLink(
        input.title ?? `${pkg.title}: ${pkg.creditsUnits / 100} credits`,
        input.description ?? `Credit package ${pkg.title}`,
        invoicePayload,
        "",
        "XTR",
        [{ label: pkg.title, amount: price.amountMinor }]
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
      data: { confirmationUrl: invoiceUrl }
    });
    return {
      orderId: order.id,
      invoicePayload,
      invoiceUrl,
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
      include: { telegramStarPayment: true, user: { select: { status: true } } }
    });
    const deletedOrderUser = order?.user.status === "deleted";
    if (
      !order ||
      order.provider !== "telegram_stars" ||
      order.status !== "pending_payment" ||
      order.currency !== input.currency ||
      order.amountMinor !== input.totalAmount ||
      order.userId !== payload.userId ||
      !order.telegramStarPayment ||
      !telegramStarsIdentityMatches(
        order.telegramStarPayment.telegramUserId,
        BigInt(input.telegramUserId),
        deletedOrderUser
      ) ||
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
        include: { telegramStarPayment: true, user: { select: { language: true, status: true } } }
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
      const deletedOrderUser = order.user.status === "deleted";
      if (
        order.userId !== payload.userId ||
        order.amountMinor !== input.totalAmount ||
        order.currency !== input.currency ||
        !order.telegramStarPayment ||
        !telegramStarsIdentityMatches(
          order.telegramStarPayment.telegramUserId,
          BigInt(input.telegramUserId),
          deletedOrderUser
        ) ||
        !telegramStarsIdentityMatches(
          order.telegramStarPayment.telegramChatId,
          BigInt(input.chatId),
          deletedOrderUser
        ) ||
        order.telegramStarPayment.invoicePayload !== input.invoicePayload
      ) {
        throw new Error("PAYMENT_MISMATCH");
      }
      const recipient = await this.resolveTelegramStarsRecipient(tx, {
        orderUserId: order.userId,
        orderUserStatus: order.user.status,
        orderUserLanguage: order.user.language,
        telegramUserId: input.telegramUserId
      });
      await tx.telegramStarPayment.update({
        where: { paymentOrderId: order.id },
        data: {
          telegramUserId: BigInt(input.telegramUserId),
          telegramChatId: BigInt(input.chatId),
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
          userId: recipient.userId,
          status: "paid",
          providerPaymentId: input.telegramPaymentChargeId,
          telegramChatId: BigInt(input.chatId),
          paidAt: new Date()
        }
      });
      await tx.creditAccount.upsert({
        where: { userId: recipient.userId },
        create: { userId: recipient.userId },
        update: {}
      });
      await tx.$queryRaw`SELECT id FROM credit_accounts WHERE "userId" = CAST(${recipient.userId} AS uuid) FOR UPDATE`;
      const account = await tx.creditAccount.update({
        where: { userId: recipient.userId },
        data: { balanceUnits: { increment: order.creditsUnits } }
      });
      await tx.creditTransaction.create({
        data: {
          userId: recipient.userId,
          type: "purchase",
          amountUnits: order.creditsUnits,
          balanceAfterUnits: account.balanceUnits,
          provider: "telegram_stars",
          providerPaymentId: input.telegramPaymentChargeId,
          metadata: {
            orderId: order.id,
            ...(recipient.recovery
              ? { recovery: recipient.recovery, originalUserId: order.userId }
              : {})
          }
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
        balanceUnits: account.balanceUnits,
        language: recipient.language
      };
    });
  }

  private async resolveTelegramStarsRecipient(
    tx: Prisma.TransactionClient,
    input: {
      orderUserId: string;
      orderUserStatus: string;
      orderUserLanguage: string;
      telegramUserId: number;
    }
  ): Promise<{ userId: string; language: string; recovery?: string }> {
    if (input.orderUserStatus !== "deleted") {
      return { userId: input.orderUserId, language: input.orderUserLanguage };
    }

    const telegramId = BigInt(input.telegramUserId);
    const currentUser = await tx.user.findUnique({
      where: { telegramId },
      select: { id: true, language: true, status: true }
    });
    if (currentUser && currentUser.id !== input.orderUserId) {
      if (currentUser.status === "deleted") {
        await tx.user.update({
          where: { id: currentUser.id },
          data: { status: "active", deletedAt: null }
        });
      }
      return {
        userId: currentUser.id,
        language: currentUser.language,
        recovery: "transferred_to_recreated_user"
      };
    }

    const restored = await tx.user.update({
      where: { id: input.orderUserId },
      data: { telegramId, status: "active", deletedAt: null },
      select: { id: true, language: true }
    });
    await tx.userSettings.upsert({
      where: { userId: restored.id },
      create: {
        userId: restored.id,
        defaultReportLanguage: env.DEFAULT_LANGUAGE,
        reportRetentionDays: env.REPORT_RETENTION_DAYS ?? 30
      },
      update: {}
    });
    return {
      userId: restored.id,
      language: restored.language,
      recovery: "reactivated_deleted_user"
    };
  }

  async createYooKassaOrder(input: {
    userId: string;
    chatId: number;
    packageCode: string;
    userEmail?: string;
    idempotencyKey: string;
  }) {
    const pkg = getPackage(input.packageCode);
    if (!pkg?.rubAmount || !pkg.isPublic) throw new Error("PACKAGE_NOT_FOUND");
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
        description: `${pkg.title}: ${pkg.creditsUnits / 100} credits`,
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
    if (!env.TELEGRAM_STARS_REFUNDS_ENABLED) throw new Error("STARS_REFUNDS_DISABLED");

    const prepared = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payment_orders WHERE id = CAST(${input.paymentOrderId} AS uuid) FOR UPDATE`;
      const order = await tx.paymentOrder.findUniqueOrThrow({
        where: { id: input.paymentOrderId },
        include: { telegramStarPayment: true }
      });
      if (!order.telegramStarPayment?.telegramPaymentChargeId)
        throw new Error("STARS_CHARGE_ID_MISSING");
      if (order.status !== "paid") throw new Error("ORDER_NOT_PAID");

      const existing = await tx.paymentRefund.findFirst({
        where: { paymentOrderId: order.id, provider: "telegram_stars" },
        orderBy: { createdAt: "desc" }
      });
      if (existing?.status === "succeeded") {
        return { order, refund: existing, alreadyProcessed: true as const };
      }
      if (existing?.status === "pending" || existing?.status === "processing") {
        const debit = await tx.creditTransaction.findFirst({
          where: {
            userId: order.userId,
            type: "refund",
            provider: "telegram_stars",
            providerPaymentId: order.telegramStarPayment.telegramPaymentChargeId,
            amountUnits: -order.creditsUnits
          }
        });
        if (!debit) {
          await tx.$queryRaw`SELECT id FROM credit_accounts WHERE "userId" = CAST(${order.userId} AS uuid) FOR UPDATE`;
          const account = await tx.creditAccount.findUniqueOrThrow({
            where: { userId: order.userId }
          });
          const available = account.balanceUnits - account.reservedUnits;
          if (available < order.creditsUnits) throw new Error("REFUND_CREDITS_SPENT");
          const updated = await tx.creditAccount.update({
            where: { userId: order.userId },
            data: { balanceUnits: { decrement: order.creditsUnits } }
          });
          await tx.creditTransaction.create({
            data: {
              userId: order.userId,
              type: "refund",
              amountUnits: -order.creditsUnits,
              balanceAfterUnits: updated.balanceUnits,
              provider: "telegram_stars",
              providerPaymentId: order.telegramStarPayment.telegramPaymentChargeId,
              metadata: { refundId: existing.id, retry: "resume_prepared_refund" }
            }
          });
        }
        const refund =
          existing.status === "processing"
            ? existing
            : await tx.paymentRefund.update({
                where: { id: existing.id },
                data: { status: "processing" }
              });
        return { order, refund, alreadyProcessed: false as const };
      }
      if (existing) throw new Error("REFUND_ALREADY_EXISTS");

      await tx.$queryRaw`SELECT id FROM credit_accounts WHERE "userId" = CAST(${order.userId} AS uuid) FOR UPDATE`;
      const account = await tx.creditAccount.findUniqueOrThrow({ where: { userId: order.userId } });
      const available = account.balanceUnits - account.reservedUnits;
      if (available < order.creditsUnits) throw new Error("REFUND_CREDITS_SPENT");

      const refund = await tx.paymentRefund.create({
        data: {
          paymentOrderId: order.id,
          provider: "telegram_stars",
          providerRefundId: `stars:${order.telegramStarPayment.telegramPaymentChargeId}`,
          status: "processing",
          amountMinor: order.amountMinor,
          currency: "XTR",
          reason: input.reason,
          idempotencyKey: `stars-refund:${order.id}`,
          adminUserId: input.adminUserId
        }
      });
      const updated = await tx.creditAccount.update({
        where: { userId: order.userId },
        data: { balanceUnits: { decrement: order.creditsUnits } }
      });
      await tx.creditTransaction.create({
        data: {
          userId: order.userId,
          type: "refund",
          amountUnits: -order.creditsUnits,
          balanceAfterUnits: updated.balanceUnits,
          provider: "telegram_stars",
          providerPaymentId: order.telegramStarPayment.telegramPaymentChargeId,
          metadata: { refundId: refund.id }
        }
      });
      return { order, refund, alreadyProcessed: false as const };
    });
    if (prepared.alreadyProcessed) {
      return {
        refundId: prepared.refund.id,
        status: "succeeded" as const,
        alreadyProcessed: true
      };
    }

    const { order, refund } = prepared;
    const telegramStarPayment = order.telegramStarPayment;
    if (!telegramStarPayment?.telegramPaymentChargeId) throw new Error("STARS_CHARGE_ID_MISSING");
    const telegramPaymentChargeId = telegramStarPayment.telegramPaymentChargeId;
    try {
      await input.api.refundStarPayment(
        Number(telegramStarPayment.telegramUserId),
        telegramPaymentChargeId
      );
      await this.prisma.paymentRefund.update({
        where: { id: refund.id },
        data: { status: "succeeded" }
      });
    } catch (error) {
      if (isTelegramStarsAlreadyRefundedError(error)) {
        await this.prisma.paymentRefund.update({
          where: { id: refund.id },
          data: {
            status: "succeeded",
            raw: { recoveredFrom: error instanceof Error ? error.message : String(error) }
          }
        });
        return { refundId: refund.id, status: "succeeded" as const };
      }
      await this.credits.grant({
        userId: order.userId,
        amountUnits: order.creditsUnits,
        provider: "telegram_stars",
        providerPaymentId: telegramPaymentChargeId,
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

function telegramStarsIdentityMatches(
  stored: bigint,
  actual: bigint,
  allowDeletedAccountPlaceholder: boolean
): boolean {
  return stored === actual || (allowDeletedAccountPlaceholder && stored === 0n);
}

function isTelegramStarsAlreadyRefundedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already.+refund|refund.+already/i.test(message);
}
