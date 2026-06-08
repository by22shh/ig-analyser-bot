import { describe, expect, it, vi } from "vitest";
import { CreditsService } from "../../src/modules/billing/credits.service.js";

function serviceWithTx(tx: unknown) {
  const prisma = {
    $transaction: vi.fn((callback: (transaction: unknown) => unknown) => callback(tx))
  } as never;
  return new CreditsService(prisma);
}

describe("CreditsService.releaseReserve", () => {
  it("does not release unrelated reserved units for an unknown unscoped reserveTransactionId", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      creditAccount: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ balanceUnits: 1000, reservedUnits: 300 }),
        update: vi.fn()
      },
      creditTransaction: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn(),
        create: vi.fn()
      }
    };
    const credits = serviceWithTx(tx);

    const result = await credits.releaseReserve({
      userId: "user-1",
      reserveTransactionId: "missing-reserve",
      amountUnits: 300
    });

    expect(result).toBeNull();
    expect(tx.creditAccount.update).not.toHaveBeenCalled();
    expect(tx.creditTransaction.create).not.toHaveBeenCalled();
  });

  it("does not release the same unscoped reserve transaction twice", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      creditAccount: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ balanceUnits: 1000, reservedUnits: 500 }),
        update: vi.fn()
      },
      creditTransaction: {
        findFirst: vi.fn().mockResolvedValue({ amountUnits: -300 }),
        findMany: vi.fn().mockResolvedValue([{ amountUnits: 300 }]),
        create: vi.fn()
      }
    };
    const credits = serviceWithTx(tx);

    const result = await credits.releaseReserve({
      userId: "user-1",
      reserveTransactionId: "reserve-1",
      amountUnits: 300
    });

    expect(result).toBeNull();
    expect(tx.creditAccount.update).not.toHaveBeenCalled();
    expect(tx.creditTransaction.create).not.toHaveBeenCalled();
  });
});
