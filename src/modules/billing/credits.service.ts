import type { PrismaClient, Prisma } from "@prisma/client";

export type CreditSnapshot = {
  balanceUnits: number;
  reservedUnits: number;
  availableUnits: number;
  purchasedUnits: number;
  grantedUnits: number;
};

export class InsufficientCreditsError extends Error {
  constructor(
    public readonly costUnits: number,
    public readonly availableUnits: number
  ) {
    super("INSUFFICIENT_CREDITS");
  }
}

export class CreditsService {
  constructor(private readonly prisma: PrismaClient) {}

  async snapshot(userId: string): Promise<CreditSnapshot> {
    const [account, txs] = await Promise.all([
      this.prisma.creditAccount.findUnique({ where: { userId } }),
      this.prisma.creditTransaction.groupBy({
        by: ["type"],
        where: { userId },
        _sum: { amountUnits: true }
      })
    ]);
    const purchasedUnits = txs
      .filter((row) => row.type === "purchase")
      .reduce((sum, row) => sum + (row._sum.amountUnits ?? 0), 0);
    const grantedUnits = txs
      .filter((row) => row.type === "grant" || row.type === "admin_adjustment")
      .reduce((sum, row) => sum + Math.max(row._sum.amountUnits ?? 0, 0), 0);
    const balanceUnits = account?.balanceUnits ?? 0;
    const reservedUnits = account?.reservedUnits ?? 0;
    return {
      balanceUnits,
      reservedUnits,
      availableUnits: balanceUnits - reservedUnits,
      purchasedUnits,
      grantedUnits
    };
  }

  async grant(input: {
    userId: string;
    amountUnits: number;
    provider?: string;
    providerPaymentId?: string;
    metadata?: Prisma.InputJsonValue;
    type?: "grant" | "purchase" | "admin_adjustment";
  }) {
    if (input.type === "admin_adjustment") {
      if (input.amountUnits === 0) throw new Error("amountUnits must be non-zero");
    } else if (input.amountUnits <= 0) {
      throw new Error("amountUnits must be positive");
    }
    return this.prisma.$transaction(async (tx) => {
      await this.lockAccount(tx, input.userId);
      const account = await tx.creditAccount.upsert({
        where: { userId: input.userId },
        create: { userId: input.userId, balanceUnits: input.amountUnits },
        update: { balanceUnits: { increment: input.amountUnits } }
      });
      return tx.creditTransaction.create({
        data: {
          userId: input.userId,
          type: input.type ?? "grant",
          amountUnits: input.amountUnits,
          balanceAfterUnits: account.balanceUnits,
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          metadata: input.metadata
        }
      });
    });
  }

  async debit(input: {
    userId: string;
    amountUnits: number;
    provider?: string;
    providerPaymentId?: string;
    metadata?: Prisma.InputJsonValue;
    type?: "refund" | "admin_adjustment";
  }) {
    if (input.amountUnits <= 0) throw new Error("amountUnits must be positive");
    return this.prisma.$transaction(async (tx) => {
      await this.lockAccount(tx, input.userId);
      const account = await tx.creditAccount.findUniqueOrThrow({ where: { userId: input.userId } });
      const available = account.balanceUnits - account.reservedUnits;
      if (available < input.amountUnits) throw new Error("REFUND_CREDITS_SPENT");
      const updated = await tx.creditAccount.update({
        where: { userId: input.userId },
        data: { balanceUnits: { decrement: input.amountUnits } }
      });
      return tx.creditTransaction.create({
        data: {
          userId: input.userId,
          type: input.type ?? "refund",
          amountUnits: -input.amountUnits,
          balanceAfterUnits: updated.balanceUnits,
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          metadata: input.metadata
        }
      });
    });
  }

  async reserve(input: {
    userId: string;
    analysisJobId?: string;
    amountUnits: number;
    metadata?: Prisma.InputJsonValue;
  }) {
    if (input.amountUnits <= 0) throw new Error("amountUnits must be positive");
    return this.prisma.$transaction(async (tx) => {
      await this.lockAccount(tx, input.userId);
      const account = await tx.creditAccount.findUniqueOrThrow({ where: { userId: input.userId } });
      const available = account.balanceUnits - account.reservedUnits;
      if (available < input.amountUnits) {
        throw new InsufficientCreditsError(input.amountUnits, available);
      }
      const updated = await tx.creditAccount.update({
        where: { userId: input.userId },
        data: { reservedUnits: { increment: input.amountUnits } }
      });
      return tx.creditTransaction.create({
        data: {
          userId: input.userId,
          analysisJobId: input.analysisJobId,
          type: "reserve",
          amountUnits: -input.amountUnits,
          balanceAfterUnits: updated.balanceUnits,
          metadata: input.metadata
        }
      });
    });
  }

  async releaseReserve(input: { userId: string; analysisJobId?: string; amountUnits: number; metadata?: Prisma.InputJsonValue }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAccount(tx, input.userId);
      const account = await tx.creditAccount.findUniqueOrThrow({ where: { userId: input.userId } });
      const amount = Math.min(account.reservedUnits, input.amountUnits);
      const updated = await tx.creditAccount.update({
        where: { userId: input.userId },
        data: { reservedUnits: { decrement: amount } }
      });
      return tx.creditTransaction.create({
        data: {
          userId: input.userId,
          analysisJobId: input.analysisJobId,
          type: "refund",
          amountUnits: amount,
          balanceAfterUnits: updated.balanceUnits,
          metadata: input.metadata
        }
      });
    });
  }

  async captureReserve(input: { userId: string; analysisJobId?: string; amountUnits: number; metadata?: Prisma.InputJsonValue }) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAccount(tx, input.userId);
      const account = await tx.creditAccount.findUniqueOrThrow({ where: { userId: input.userId } });
      const amount = Math.min(account.reservedUnits, input.amountUnits);
      const updated = await tx.creditAccount.update({
        where: { userId: input.userId },
        data: {
          reservedUnits: { decrement: amount },
          balanceUnits: { decrement: amount }
        }
      });
      return tx.creditTransaction.create({
        data: {
          userId: input.userId,
          analysisJobId: input.analysisJobId,
          type: "capture",
          amountUnits: -amount,
          balanceAfterUnits: updated.balanceUnits,
          metadata: input.metadata
        }
      });
    });
  }

  private async lockAccount(tx: Prisma.TransactionClient, userId: string) {
    await tx.$queryRaw`SELECT id FROM credit_accounts WHERE user_id = CAST(${userId} AS uuid) FOR UPDATE`;
  }
}
