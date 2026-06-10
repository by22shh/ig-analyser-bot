import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { childLogger } from "../config/logger.js";

const log = childLogger("background.leader");

const DEFAULT_LEASE_TTL_MS = 90_000;
const DEFAULT_RENEW_MS = 30_000;
const DEFAULT_RETRY_MS = 15_000;

type LeasePrisma = Pick<PrismaClient, "$queryRaw" | "$executeRaw">;

export type BackgroundLoopHandle = {
  stop(): void | Promise<void>;
};

export type RuntimeLeaseInput = {
  leaseName: string;
  holderId: string;
};

export type RuntimeLeaseStore = {
  acquire(input: RuntimeLeaseInput & { ttlMs: number }): Promise<boolean>;
  release(input: RuntimeLeaseInput): Promise<void>;
};

export function postgresRuntimeLeaseStore(prisma: LeasePrisma): RuntimeLeaseStore {
  return {
    async acquire(input) {
      const expiresAt = new Date(Date.now() + input.ttlMs);
      const rows = await prisma.$queryRaw<Array<{ holder_id: string }>>`
        INSERT INTO "runtime_leases" ("name", "holder_id", "expires_at", "updated_at")
        VALUES (${input.leaseName}, ${input.holderId}, ${expiresAt}, NOW())
        ON CONFLICT ("name") DO UPDATE
        SET
          "holder_id" = EXCLUDED."holder_id",
          "expires_at" = EXCLUDED."expires_at",
          "updated_at" = NOW()
        WHERE
          "runtime_leases"."holder_id" = EXCLUDED."holder_id"
          OR "runtime_leases"."expires_at" < NOW()
        RETURNING "holder_id" AS holder_id
      `;
      return rows.some((row) => row.holder_id === input.holderId);
    },
    async release(input) {
      await prisma.$executeRaw`
        DELETE FROM "runtime_leases"
        WHERE "name" = ${input.leaseName} AND "holder_id" = ${input.holderId}
      `;
    }
  };
}

export function startBackgroundLoopLeader(input: {
  store: RuntimeLeaseStore;
  leaseName: string;
  start: () => BackgroundLoopHandle[];
  holderId?: string;
  ttlMs?: number;
  renewMs?: number;
  retryMs?: number;
}): BackgroundLoopHandle {
  const holderId = input.holderId ?? `${process.pid}:${randomUUID()}`;
  const ttlMs = input.ttlMs ?? DEFAULT_LEASE_TTL_MS;
  const renewMs = input.renewMs ?? DEFAULT_RENEW_MS;
  const retryMs = input.retryMs ?? DEFAULT_RETRY_MS;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let loops: BackgroundLoopHandle[] = [];

  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(() => void tick(), delayMs);
    timer.unref?.();
  };

  const tick = async () => {
    if (stopped) return;
    try {
      const acquired = await input.store.acquire({ leaseName: input.leaseName, holderId, ttlMs });
      if (acquired) {
        if (!loops.length) {
          loops = input.start();
          log.info({ leaseName: input.leaseName, holderId }, "background_leader_acquired");
        }
        schedule(renewMs);
        return;
      }

      if (loops.length) {
        log.warn({ leaseName: input.leaseName, holderId }, "background_leader_lost");
        await stopLoops();
      }
      schedule(retryMs);
    } catch (error) {
      log.warn({ error, leaseName: input.leaseName, holderId }, "background_leader_tick_failed");
      await stopLoops();
      await input.store
        .release({ leaseName: input.leaseName, holderId })
        .catch((releaseError) =>
          log.warn(
            { error: releaseError, leaseName: input.leaseName, holderId },
            "background_leader_release_failed"
          )
        );
      schedule(retryMs);
    }
  };

  const stopLoops = async () => {
    const current = loops;
    loops = [];
    await Promise.allSettled(current.map(async (loop) => loop.stop()));
  };

  void tick();

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await stopLoops();
      await input.store
        .release({ leaseName: input.leaseName, holderId })
        .catch((error) =>
          log.warn(
            { error, leaseName: input.leaseName, holderId },
            "background_leader_release_failed"
          )
        );
    }
  };
}
