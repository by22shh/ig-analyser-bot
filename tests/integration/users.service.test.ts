import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CreditsService } from "../../src/modules/billing/credits.service.js";
import { UserService } from "../../src/modules/users/user.service.js";
import { dbAvailable, deleteUsers, prisma, uniqueBigInt } from "./_db.js";

const createdUserIds: string[] = [];

describe.skipIf(!dbAvailable)("UserService (integration)", () => {
  const credits = new CreditsService(prisma);
  const users = new UserService(prisma, { deleteObjects: async () => undefined });
  let deleteMePackageId = "";

  beforeAll(async () => {
    const pkg = await prisma.creditPackage.upsert({
      where: { code: "it-delete-me-contract" },
      update: {},
      create: {
        code: "it-delete-me-contract",
        title: "Delete-me contract package",
        creditsUnits: 300,
        isActive: false,
        sortOrder: 9999
      }
    });
    deleteMePackageId = pkg.id;
  });

  afterAll(async () => {
    await deleteUsers(createdUserIds);
    if (deleteMePackageId) {
      await prisma.creditPackage.deleteMany({ where: { id: deleteMePackageId } });
    }
    await prisma.$disconnect();
  });

  it("reactivates a deleted Telegram identity without treating it as a new user", async () => {
    const telegramId = Number(uniqueBigInt() % 1_000_000_000n);
    const created = await users.upsertTelegramUser({ id: telegramId, firstName: "Alice" });
    createdUserIds.push(created.user.id);
    expect(created.isNew).toBe(true);

    await users.deleteMe(created.user.id);

    const blocked = await users.upsertTelegramUser({ id: telegramId, firstName: "Alice" });
    expect(blocked.user.id).toBe(created.user.id);
    expect(blocked.user.status).toBe("deleted");
    expect(blocked.isNew).toBe(false);

    const restored = await users.upsertTelegramUser({
      id: telegramId,
      firstName: "Alice",
      allowReactivate: true
    });
    expect(restored.user.id).toBe(created.user.id);
    expect(restored.user.status).toBe("active");
    expect(restored.isNew).toBe(false);
  });

  it("releases reserves and forfeits remaining balance on delete_me", async () => {
    const telegramId = Number(uniqueBigInt() % 1_000_000_000n);
    const created = await users.upsertTelegramUser({ id: telegramId });
    createdUserIds.push(created.user.id);
    await credits.grant({ userId: created.user.id, amountUnits: 500 });
    await credits.reserve({ userId: created.user.id, amountUnits: 300 });

    await users.deleteMe(created.user.id);

    const snapshot = await credits.snapshot(created.user.id);
    expect(snapshot.balanceUnits).toBe(0);
    expect(snapshot.reservedUnits).toBe(0);
  });

  it("anonymizes PII, removes report artifacts, clears payment raw payloads and zeros credits", async () => {
    const telegramId = Number(uniqueBigInt() % 1_000_000_000n);
    const created = await users.upsertTelegramUser({
      id: telegramId,
      username: "delete_me_user",
      firstName: "Alice",
      lastName: "Private"
    });
    createdUserIds.push(created.user.id);
    await users.updateEmail(created.user.id, "alice.private@example.com");
    const grantTransaction = await credits.grant({
      userId: created.user.id,
      amountUnits: 700,
      metadata: { email: "alice.private@example.com" }
    });
    const reserveTransaction = await credits.reserve({
      userId: created.user.id,
      amountUnits: 200,
      metadata: { username: "delete_me_user" }
    });

    const analysisJob = await prisma.analysisJob.create({
      data: {
        userId: created.user.id,
        mode: "standard",
        inputType: "username",
        targetUsername: "delete_me_user",
        language: "ru",
        status: "completed",
        stage: "completed",
        telegramChatId: BigInt(telegramId),
        costCreditUnits: 100,
        idempotencyKey: `delete-me-analysis-${uniqueBigInt()}`,
        finishedAt: new Date()
      }
    });
    const report = await prisma.report.create({
      data: {
        analysisJobId: analysisJob.id,
        userId: created.user.id,
        mode: "standard",
        language: "ru",
        rawText: "private report body",
        summary: { userEmail: "alice.private@example.com" },
        metrics: { private: true },
        sourceMap: { profile: "delete_me_user" },
        model: "test",
        promptVersion: "test"
      }
    });
    const artifactKeys = [
      `reports/${created.user.id}/private.pdf`,
      `reports/${created.user.id}/private.html`
    ];
    await prisma.reportArtifact.createMany({
      data: artifactKeys.map((storageKey, index) => ({
        reportId: report.id,
        type: index === 0 ? "pdf" : "html",
        storageKey,
        publicUrl: `https://cdn.example/${storageKey}`,
        sizeBytes: 100 + index
      }))
    });
    await prisma.reportChatSession.create({
      data: { reportId: report.id, userId: created.user.id }
    });

    const starsChargeId = `stars-charge-${uniqueBigInt()}`;
    const starsOrder = await prisma.paymentOrder.create({
      data: {
        userId: created.user.id,
        packageId: deleteMePackageId,
        status: "paid",
        amountMinor: 690,
        currency: "XTR",
        creditsUnits: 300,
        provider: "telegram_stars",
        providerPaymentId: starsChargeId,
        idempotencyKey: `delete-me-stars-${uniqueBigInt()}`,
        userEmail: "alice.private@example.com",
        telegramChatId: BigInt(telegramId),
        telegramInvoiceMessageId: 12345n,
        paidAt: new Date()
      }
    });
    await prisma.telegramStarPayment.create({
      data: {
        paymentOrderId: starsOrder.id,
        telegramUserId: BigInt(telegramId),
        telegramChatId: BigInt(telegramId),
        invoicePayload: `delete-me-payload-${uniqueBigInt()}`,
        invoiceMessageId: 12345n,
        preCheckoutQueryId: `pre-checkout-${uniqueBigInt()}`,
        telegramPaymentChargeId: starsChargeId,
        status: "paid",
        starsAmount: 690,
        successfulPayment: { email: "alice.private@example.com" },
        rawPreCheckoutQuery: { from: { id: telegramId, username: "delete_me_user" } },
        rawSuccessfulPayment: { chargeId: starsChargeId, email: "alice.private@example.com" }
      }
    });
    await prisma.paymentEvent.create({
      data: {
        provider: "telegram_stars",
        eventType: "successful_payment",
        providerObjectId: starsChargeId,
        paymentOrderId: starsOrder.id,
        payload: { email: "alice.private@example.com", username: "delete_me_user" }
      }
    });

    const yookassaPaymentId = `yk-${uniqueBigInt()}`;
    const yookassaOrder = await prisma.paymentOrder.create({
      data: {
        userId: created.user.id,
        packageId: deleteMePackageId,
        status: "paid",
        amountMinor: 99000,
        currency: "RUB",
        creditsUnits: 300,
        provider: "yookassa",
        providerPaymentId: yookassaPaymentId,
        idempotencyKey: `delete-me-yookassa-${uniqueBigInt()}`,
        userEmail: "alice.private@example.com",
        paidAt: new Date()
      }
    });
    await prisma.yooKassaPayment.create({
      data: {
        paymentOrderId: yookassaOrder.id,
        yookassaPaymentId,
        status: "succeeded",
        paid: true,
        amountMinor: 99000,
        currency: "RUB",
        metadata: { email: "alice.private@example.com" },
        raw: { customer: { email: "alice.private@example.com" } }
      }
    });
    await prisma.fiscalReceipt.create({
      data: {
        paymentOrderId: yookassaOrder.id,
        provider: "yookassa",
        type: "payment",
        status: "succeeded",
        providerReceiptId: `receipt-${uniqueBigInt()}`,
        customerEmail: "alice.private@example.com",
        amountMinor: 99000,
        currency: "RUB",
        payload: { customer: { email: "alice.private@example.com" } },
        raw: { receipt: "raw-private" }
      }
    });
    await prisma.paymentEvent.create({
      data: {
        provider: "yookassa",
        eventType: "payment.succeeded",
        providerObjectId: yookassaPaymentId,
        paymentOrderId: yookassaOrder.id,
        payload: { object: { metadata: { email: "alice.private@example.com" } } }
      }
    });

    const deletedKeys: string[] = [];
    const deletingUsers = new UserService(prisma, {
      deleteObjects: async (keys) => {
        deletedKeys.push(...keys);
      }
    });

    await deletingUsers.deleteMe(created.user.id);

    expect(deletedKeys).toEqual(expect.arrayContaining(artifactKeys));
    expect(deletedKeys).toHaveLength(artifactKeys.length);
    expect(await prisma.report.count({ where: { userId: created.user.id } })).toBe(0);
    expect(await prisma.reportArtifact.count({ where: { storageKey: { in: artifactKeys } } })).toBe(
      0
    );
    expect(await prisma.analysisJob.count({ where: { userId: created.user.id } })).toBe(0);

    const sanitizedUser = await prisma.user.findUniqueOrThrow({ where: { id: created.user.id } });
    expect(sanitizedUser.status).toBe("deleted");
    expect(sanitizedUser.telegramId < 0n).toBe(true);
    expect(sanitizedUser.telegramUsername).toBeNull();
    expect(sanitizedUser.firstName).toBeNull();
    expect(sanitizedUser.lastName).toBeNull();
    expect(sanitizedUser.email).toBeNull();
    expect(sanitizedUser.referralCode).toBeNull();
    expect(sanitizedUser.consentVersion).toBeNull();
    expect(sanitizedUser.consentAcceptedAt).toBeNull();

    const account = await prisma.creditAccount.findUniqueOrThrow({
      where: { userId: created.user.id }
    });
    expect(account.balanceUnits).toBe(0);
    expect(account.reservedUnits).toBe(0);

    const originalCreditTransactions = await prisma.creditTransaction.findMany({
      where: { id: { in: [grantTransaction.id, reserveTransaction.id] } },
      orderBy: { createdAt: "asc" }
    });
    expect(originalCreditTransactions).toHaveLength(2);
    expect(originalCreditTransactions[0]?.metadata).toBeNull();
    expect(originalCreditTransactions[1]?.metadata).toBeNull();

    const starsOrderAfter = await prisma.paymentOrder.findUniqueOrThrow({
      where: { id: starsOrder.id }
    });
    expect(starsOrderAfter.userEmail).toBeNull();
    expect(starsOrderAfter.telegramChatId).toBeNull();
    expect(starsOrderAfter.telegramInvoiceMessageId).toBeNull();
    const starsAfter = await prisma.telegramStarPayment.findUniqueOrThrow({
      where: { paymentOrderId: starsOrder.id }
    });
    expect(starsAfter.telegramChatId).toBe(0n);
    expect(starsAfter.invoiceMessageId).toBeNull();
    expect(starsAfter.preCheckoutQueryId).toBeNull();
    expect(starsAfter.successfulPayment).toBeNull();
    expect(starsAfter.rawPreCheckoutQuery).toBeNull();
    expect(starsAfter.rawSuccessfulPayment).toBeNull();

    const yookassaOrderAfter = await prisma.paymentOrder.findUniqueOrThrow({
      where: { id: yookassaOrder.id }
    });
    expect(yookassaOrderAfter.userEmail).toBeNull();
    const yookassaAfter = await prisma.yooKassaPayment.findUniqueOrThrow({
      where: { paymentOrderId: yookassaOrder.id }
    });
    expect(yookassaAfter.metadata).toBeNull();
    expect(yookassaAfter.raw).toBeNull();
    const receiptAfter = await prisma.fiscalReceipt.findFirstOrThrow({
      where: { paymentOrderId: yookassaOrder.id }
    });
    expect(receiptAfter.customerEmail).toBeNull();
    expect(receiptAfter.payload).toBeNull();
    expect(receiptAfter.raw).toBeNull();

    const paymentEvents = await prisma.paymentEvent.findMany({
      where: { paymentOrder: { userId: created.user.id } }
    });
    expect(paymentEvents).toHaveLength(2);
    expect(paymentEvents.every((event) => event.payload === null)).toBe(true);
    expect(await prisma.paymentOrder.count({ where: { userId: created.user.id } })).toBe(2);
  });
});
