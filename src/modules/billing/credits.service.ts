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

type ReserveInput = {
  userId: string;
  analysisJobId?: string;
  photoSearchJobId?: string;
  reportChatMessageId?: string;
  amountUnits: number;
  metadata?: Prisma.InputJsonValue;
};

type ReleaseReserveInput = ReserveInput & {
  reserveTransactionId?: string;
};

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

  async reserve(input: ReserveInput) {
    if (input.amountUnits <= 0) throw new Error("amountUnits must be positive");
    return this.prisma.$transaction((tx) => this.reserveWithin(tx, input));
  }

  async reserveWithin(tx: Prisma.TransactionClient, input: ReserveInput) {
    if (input.amountUnits <= 0) throw new Error("amountUnits must be positive");
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
        photoSearchJobId: input.photoSearchJobId,
        reportChatMessageId: input.reportChatMessageId,
        type: "reserve",
        amountUnits: -input.amountUnits,
        balanceAfterUnits: updated.balanceUnits,
        metadata: input.metadata
      }
    });
  }

  async releaseReserve(input: ReleaseReserveInput) {
    if (input.amountUnits <= 0) throw new Error("amountUnits must be positive");
    return this.prisma.$transaction(async (tx) => {
      await this.lockAccount(tx, input.userId);
      const account = await tx.creditAccount.findUniqueOrThrow({ where: { userId: input.userId } });
      const outstanding = await this.scopedOutstandingReserve(tx, input);
      const releasable =
        outstanding != null
          ? Math.max(outstanding, 0)
          : input.reserveTransactionId
            ? await this.reserveOutstandingForTransaction(
                tx,
                input.userId,
                input.reserveTransactionId
              )
            : account.reservedUnits;
      const amount = Math.min(releasable, input.amountUnits, account.reservedUnits);
      if (amount <= 0) return null;
      const updated = await tx.creditAccount.update({
        where: { userId: input.userId },
        data: { reservedUnits: { decrement: amount } }
      });
      return tx.creditTransaction.create({
        data: {
          userId: input.userId,
          analysisJobId: input.analysisJobId,
          photoSearchJobId: input.photoSearchJobId,
          reportChatMessageId: input.reportChatMessageId,
          type: "refund",
          amountUnits: amount,
          balanceAfterUnits: updated.balanceUnits,
          metadata: withReserveTransactionMetadata(input.metadata, input.reserveTransactionId)
        }
      });
    });
  }

  async captureReserve(input: {
    userId: string;
    analysisJobId?: string;
    photoSearchJobId?: string;
    reportChatMessageId?: string;
    amountUnits: number;
    metadata?: Prisma.InputJsonValue;
    // Extra writes (e.g. marking the owning job completed) committed atomically
    // with the capture, so a crash cannot leave a captured-but-unfinished job
    // that a retry would re-run and double-charge.
    within?: (tx: Prisma.TransactionClient) => Promise<void>;
  }) {
    if (input.amountUnits <= 0) throw new Error("amountUnits must be positive");
    return this.prisma.$transaction(async (tx) => {
      await this.lockAccount(tx, input.userId);
      const account = await tx.creditAccount.findUniqueOrThrow({ where: { userId: input.userId } });
      const outstanding = await this.scopedOutstandingReserve(tx, input);
      const amount = input.amountUnits;
      const capturable = outstanding == null ? account.reservedUnits : Math.max(outstanding, 0);
      if (capturable < amount || account.reservedUnits < amount) {
        throw new Error("RESERVE_NOT_FOUND");
      }
      const updated = await tx.creditAccount.update({
        where: { userId: input.userId },
        data: {
          reservedUnits: { decrement: amount },
          balanceUnits: { decrement: amount }
        }
      });
      const transaction = await tx.creditTransaction.create({
        data: {
          userId: input.userId,
          analysisJobId: input.analysisJobId,
          photoSearchJobId: input.photoSearchJobId,
          reportChatMessageId: input.reportChatMessageId,
          type: "capture",
          amountUnits: -amount,
          balanceAfterUnits: updated.balanceUnits,
          metadata: input.metadata
        }
      });
      if (input.within) await input.within(tx);
      return transaction;
    });
  }

  private async lockAccount(tx: Prisma.TransactionClient, userId: string) {
    await tx.$queryRaw`SELECT id FROM credit_accounts WHERE "userId" = CAST(${userId} AS uuid) FOR UPDATE`;
  }

  private async scopedOutstandingReserve(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      analysisJobId?: string;
      photoSearchJobId?: string;
      reportChatMessageId?: string;
    }
  ): Promise<number | undefined> {
    const scope =
      input.analysisJobId != null
        ? { analysisJobId: input.analysisJobId }
        : input.photoSearchJobId != null
          ? { photoSearchJobId: input.photoSearchJobId }
          : input.reportChatMessageId != null
            ? { reportChatMessageId: input.reportChatMessageId }
            : undefined;
    if (!scope) return undefined;
    const transactions = await tx.creditTransaction.findMany({
      where: {
        userId: input.userId,
        ...scope,
        type: { in: ["reserve", "capture", "refund"] }
      },
      select: { type: true, amountUnits: true }
    });
    return transactions.reduce((sum, transaction) => {
      if (transaction.type === "reserve")
        return sum + Math.abs(Math.min(transaction.amountUnits, 0));
      if (transaction.type === "capture")
        return sum - Math.abs(Math.min(transaction.amountUnits, 0));
      if (transaction.type === "refund") return sum - Math.max(transaction.amountUnits, 0);
      return sum;
    }, 0);
  }

  private async reserveOutstandingForTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    reserveTransactionId: string
  ): Promise<number> {
    const transaction = await tx.creditTransaction.findFirst({
      where: { id: reserveTransactionId, userId, type: "reserve" },
      select: { amountUnits: true }
    });
    const reserved = Math.abs(Math.min(transaction?.amountUnits ?? 0, 0));
    if (reserved <= 0) return 0;
    const releasedTransactions = await tx.creditTransaction.findMany({
      where: {
        userId,
        type: "refund",
        metadata: { path: ["reserveTransactionId"], equals: reserveTransactionId }
      },
      select: { amountUnits: true }
    });
    const released = releasedTransactions.reduce(
      (sum, refund) => sum + Math.max(refund.amountUnits, 0),
      0
    );
    return Math.max(reserved - released, 0);
  }
}

function withReserveTransactionMetadata(
  metadata: Prisma.InputJsonValue | undefined,
  reserveTransactionId: string | undefined
): Prisma.InputJsonValue | undefined {
  if (!reserveTransactionId) return metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return { ...(metadata as Record<string, Prisma.InputJsonValue>), reserveTransactionId };
  }
  if (metadata == null) return { reserveTransactionId };
  return { reserveTransactionId, originalMetadata: metadata };
}
