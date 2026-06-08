import { afterAll, describe, expect, it } from "vitest";
import { CreditsService } from "../../src/modules/billing/credits.service.js";
import { UserService } from "../../src/modules/users/user.service.js";
import { dbAvailable, deleteUsers, prisma, uniqueBigInt } from "./_db.js";

const createdUserIds: string[] = [];

describe.skipIf(!dbAvailable)("UserService (integration)", () => {
  const credits = new CreditsService(prisma);
  const users = new UserService(prisma, { deleteObjects: async () => undefined });

  afterAll(async () => {
    await deleteUsers(createdUserIds);
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
});
