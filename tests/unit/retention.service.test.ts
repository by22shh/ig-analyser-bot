import { describe, expect, it, vi } from "vitest";
import { RetentionService } from "../../src/modules/users/retention.service.js";

function fakeTx() {
  return {
    reportArtifact: { deleteMany: vi.fn(async () => undefined) },
    report: { delete: vi.fn(async () => undefined) },
    auditLog: { create: vi.fn(async () => undefined) }
  };
}

function buildService(
  reports: Array<{ id: string; userId: string; artifacts: Array<{ storageKey: string }> }>,
  failKey?: string
) {
  const $transaction = vi.fn(async (cb: (tx: ReturnType<typeof fakeTx>) => Promise<unknown>) =>
    cb(fakeTx())
  );
  const prisma = { report: { findMany: vi.fn(async () => reports) }, $transaction };
  const deleteObjects = vi.fn(async (keys: string[]) => {
    if (failKey && keys.includes(failKey)) throw new Error("S3_DOWN");
  });
  const service = new RetentionService(prisma as never, { deleteObjects } as never);
  return { service, prisma, deleteObjects, $transaction };
}

describe("RetentionService.cleanupExpiredReports", () => {
  it("keeps cleaning the batch when one report fails, returning only successes", async () => {
    const { service, $transaction } = buildService(
      [
        { id: "a", userId: "u1", artifacts: [{ storageKey: "reports/a/x.pdf" }] },
        { id: "b", userId: "u2", artifacts: [{ storageKey: "reports/b/x.pdf" }] }
      ],
      "reports/a/x.pdf"
    );

    const count = await service.cleanupExpiredReports(new Date());

    expect(count).toBe(1);
    // Only the surviving report ("b") reaches the delete transaction.
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it("returns the full count when every report cleans successfully", async () => {
    const { service, $transaction } = buildService([
      { id: "a", userId: "u1", artifacts: [] },
      { id: "b", userId: "u2", artifacts: [] }
    ]);

    const count = await service.cleanupExpiredReports(new Date());

    expect(count).toBe(2);
    expect($transaction).toHaveBeenCalledTimes(2);
  });
});
