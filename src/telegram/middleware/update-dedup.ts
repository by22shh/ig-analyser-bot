import type { NextFunction } from "grammy";
import { childLogger } from "../../config/logger.js";
import type { MyContext } from "../context.js";

const log = childLogger("update-dedup");

/**
 * True only for a Prisma unique-constraint violation (P2002), i.e. an update we
 * have already recorded. Any other error is a real failure and must not be
 * mistaken for a duplicate.
 */
export function isDuplicateUpdateError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

const PROCESSING_TTL_MS = 10 * 60 * 1000;

export async function updateDedup(ctx: MyContext, next: NextFunction) {
  const updateId = ctx.update.update_id;
  if (updateId == null) {
    await next();
    return;
  }

  const updateKey = BigInt(updateId);
  let tracked = false;

  try {
    tracked = await claimUpdate(ctx, updateKey);
    if (!tracked) return;
  } catch (error) {
    // Bookkeeping failed (e.g. transient DB error). Fail open so a real user
    // message is not lost; worst case is a rare reprocess.
    log.warn({ error, updateId }, "update_dedup_insert_failed");
  }

  try {
    await next();
    if (tracked) {
      await ctx.services.prisma.telegramUpdate.update({
        where: { updateId: updateKey },
        data: {
          userId: ctx.user?.id,
          status: "processed",
          processedAt: new Date(),
          failedAt: null,
          errorMessage: null
        }
      });
    }
  } catch (error) {
    if (tracked) {
      await ctx.services.prisma.telegramUpdate
        .update({
          where: { updateId: updateKey },
          data: {
            userId: ctx.user?.id,
            status: "failed",
            failedAt: new Date(),
            errorMessage:
              error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
          }
        })
        .catch((markError) => log.warn({ error: markError, updateId }, "update_dedup_mark_failed"));
    }
    throw error;
  }
}

async function claimUpdate(ctx: MyContext, updateId: bigint): Promise<boolean> {
  const now = new Date();
  try {
    await ctx.services.prisma.telegramUpdate.create({
      data: {
        updateId,
        userId: ctx.user?.id,
        status: "processing",
        receivedAt: now
      }
    });
    return true;
  } catch (error) {
    if (!isDuplicateUpdateError(error)) throw error;
  }

  const existing = await ctx.services.prisma.telegramUpdate.findUnique({ where: { updateId } });
  if (!existing) return false;
  if (existing.status === "processed") return false;
  if (
    existing.status === "processing" &&
    now.getTime() - existing.receivedAt.getTime() < PROCESSING_TTL_MS
  )
    return false;

  await ctx.services.prisma.telegramUpdate.update({
    where: { updateId },
    data: {
      userId: ctx.user?.id,
      status: "processing",
      receivedAt: now,
      processedAt: null,
      failedAt: null,
      errorMessage: null
    }
  });
  return true;
}
