import { PrismaClient } from "@prisma/client";

// These suites exercise the real ledger/payment code against Postgres. They run
// in CI (which provisions and migrates a DB) and locally when a migrated DB is
// reachable; otherwise they skip so `pnpm test` stays green without a database.
process.env.DATABASE_URL ??= "postgresql://zreti:zreti@localhost:5432/zreti_bot";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

export const prisma = new PrismaClient();

// Probe a real table so we skip (not error) on an unreachable or unmigrated DB.
export const dbAvailable: boolean = await prisma.user
  .findFirst()
  .then(() => true)
  .catch(() => false);

let seq = 0n;

/** Collision-resistant id for unique columns (telegramId, charge ids, …). */
export function uniqueBigInt(): bigint {
  seq += 1n;
  return BigInt(Date.now()) * 100000n + seq;
}

export async function seedUser(balanceUnits = 0) {
  const user = await prisma.user.create({ data: { telegramId: uniqueBigInt() } });
  await prisma.creditAccount.create({ data: { userId: user.id, balanceUnits } });
  return user;
}

export async function deleteUsers(ids: string[]) {
  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
}
