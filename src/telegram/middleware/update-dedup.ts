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
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

export async function updateDedup(ctx: MyContext, next: NextFunction) {
  const updateId = ctx.update.update_id;
  if (updateId == null) {
    await next();
    return;
  }
  try {
    await ctx.services.prisma.telegramUpdate.create({
      data: {
        updateId: BigInt(updateId),
        userId: ctx.user?.id
      }
    });
  } catch (error) {
    if (isDuplicateUpdateError(error)) {
      // Already processed this update_id — drop the duplicate silently.
      return;
    }
    // Bookkeeping failed for another reason (e.g. transient DB error). Fail open
    // so a real user message is not lost; worst case is a rare reprocess.
    log.warn({ error, updateId }, "update_dedup_insert_failed");
  }
  await next();
}
