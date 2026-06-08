import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  CreditsService,
  InsufficientCreditsError
} from "../../src/modules/billing/credits.service.js";
import { dbAvailable, deleteUsers, prisma, seedUser, uniqueBigInt } from "./_db.js";

const createdUserIds: string[] = [];

async function user(balanceUnits = 0) {
  const created = await seedUser(balanceUnits);
  createdUserIds.push(created.id);
  return created;
}

describe.skipIf(!dbAvailable)("CreditsService (integration)", () => {
  const credits = new CreditsService(prisma);

  afterAll(async () => {
    await deleteUsers(createdUserIds);
    await prisma.$disconnect();
  });

  it("reserve then capture moves units out of the balance", async () => {
    const u = await user(1000);

    await credits.reserve({ userId: u.id, amountUnits: 300 });
    let snap = await credits.snapshot(u.id);
    expect(snap.balanceUnits).toBe(1000);
    expect(snap.reservedUnits).toBe(300);
    expect(snap.availableUnits).toBe(700);

    await credits.captureReserve({ userId: u.id, amountUnits: 300 });
    snap = await credits.snapshot(u.id);
    expect(snap.balanceUnits).toBe(700);
    expect(snap.reservedUnits).toBe(0);
  });

  it("reserve then release restores availability without spending", async () => {
    const u = await user(1000);

    await credits.reserve({ userId: u.id, amountUnits: 300 });
    await credits.releaseReserve({ userId: u.id, amountUnits: 300 });

    const snap = await credits.snapshot(u.id);
    expect(snap.balanceUnits).toBe(1000);
    expect(snap.reservedUnits).toBe(0);
    expect(snap.availableUnits).toBe(1000);
  });

  it("reserve beyond the available balance throws InsufficientCreditsError", async () => {
    const u = await user(100);

    await expect(credits.reserve({ userId: u.id, amountUnits: 300 })).rejects.toBeInstanceOf(
      InsufficientCreditsError
    );
    expect((await credits.snapshot(u.id)).reservedUnits).toBe(0);
  });

  it("grant adds balance and is reflected as granted units", async () => {
    const u = await user(0);

    await credits.grant({ userId: u.id, amountUnits: 500 });

    const snap = await credits.snapshot(u.id);
    expect(snap.balanceUnits).toBe(500);
    expect(snap.grantedUnits).toBe(500);
  });

  it("debit refuses to spend reserved-but-unavailable units", async () => {
    const u = await user(100);

    await credits.reserve({ userId: u.id, amountUnits: 100 });

    await expect(credits.debit({ userId: u.id, amountUnits: 50 })).rejects.toThrow(
      "REFUND_CREDITS_SPENT"
    );
  });

  it("scoped capture consumes the matching job's reserve", async () => {
    const u = await user(1000);
    const job = await prisma.analysisJob.create({
      data: {
        userId: u.id,
        mode: "standard",
        inputType: "username",
        targetUsername: "example",
        status: "queued",
        telegramChatId: BigInt(1),
        costCreditUnits: 300,
        idempotencyKey: `it-${uniqueBigInt()}`
      }
    });

    await credits.reserve({ userId: u.id, analysisJobId: job.id, amountUnits: 300 });
    await credits.captureReserve({ userId: u.id, analysisJobId: job.id, amountUnits: 300 });

    const snap = await credits.snapshot(u.id);
    expect(snap.balanceUnits).toBe(700);
    expect(snap.reservedUnits).toBe(0);
  });

  it("chat-scoped release and capture do not consume another chat reserve", async () => {
    const u = await user(1000);
    const firstMessageId = randomUUID();
    const secondMessageId = randomUUID();

    await credits.reserve({
      userId: u.id,
      reportChatMessageId: firstMessageId,
      amountUnits: 100
    });
    await credits.reserve({
      userId: u.id,
      reportChatMessageId: secondMessageId,
      amountUnits: 200
    });
    await credits.releaseReserve({
      userId: u.id,
      reportChatMessageId: firstMessageId,
      amountUnits: 100
    });

    let snap = await credits.snapshot(u.id);
    expect(snap.balanceUnits).toBe(1000);
    expect(snap.reservedUnits).toBe(200);

    await credits.captureReserve({
      userId: u.id,
      reportChatMessageId: secondMessageId,
      amountUnits: 200
    });

    snap = await credits.snapshot(u.id);
    expect(snap.balanceUnits).toBe(800);
    expect(snap.reservedUnits).toBe(0);
  });
});
