import { describe, expect, it, vi } from "vitest";
import { UserService } from "../../src/modules/users/user.service.js";

describe("UserService.upsertTelegramUser", () => {
  it("recovers when a concurrent first contact creates the same Telegram user", async () => {
    const racedUser = makeUser({ id: "user-raced", telegramUsername: null });
    const updatedUser = makeUser({ id: "user-raced", telegramUsername: "alice" });
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(racedUser),
        create: vi.fn().mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" })),
        update: vi.fn().mockResolvedValue(updatedUser)
      },
      userSettings: { upsert: vi.fn(async () => undefined) },
      creditAccount: { upsert: vi.fn(async () => undefined) }
    };
    const service = new UserService(prisma as never);

    const result = await service.upsertTelegramUser({
      id: 123456,
      username: "alice",
      firstName: "Alice"
    });

    expect(result).toEqual({ user: updatedUser, isNew: false });
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-raced" },
        data: expect.objectContaining({
          telegramId: 123456n,
          telegramUsername: "alice",
          firstName: "Alice"
        })
      })
    );
    expect(prisma.userSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-raced" } })
    );
    expect(prisma.creditAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-raced" } })
    );
  });
});

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-id",
    telegramId: 123456n,
    telegramIdentityHash: "identity-hash",
    telegramUsername: "alice",
    firstName: "Alice",
    lastName: null,
    language: "ru",
    role: "user",
    status: "active",
    timezone: null,
    consentVersion: null,
    consentAcceptedAt: null,
    email: null,
    referralCode: "123456",
    referredByUserId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides
  };
}
