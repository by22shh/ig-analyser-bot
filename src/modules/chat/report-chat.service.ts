import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { env } from "../../config/env.js";
import type { Locale } from "../../telegram/constants.js";
import { MODE_COST_UNITS } from "../billing/packages.js";
import type { CreditsService } from "../billing/credits.service.js";
import type { LlmProvider } from "../llm/types.js";
import { recordUsage, recordUsageSafe } from "../observability/usage.js";

const PENDING_ASSISTANT_ROLE = "assistant_pending";
const IDEMPOTENCY_POLL_MS = 250;
const IDEMPOTENCY_WAIT_MS = 5_000;
const PENDING_ASSISTANT_STALE_MS = 15 * 60 * 1000;

export class ChatRequestInProgressError extends Error {
  constructor() {
    super("CHAT_REQUEST_IN_PROGRESS");
  }
}

export class ReportChatService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly llm: LlmProvider,
    private readonly credits: CreditsService
  ) {}

  async ask(input: {
    userId: string;
    reportId: string;
    question: string;
    language: Locale;
    requestId?: string;
  }) {
    const report = await this.prisma.report.findFirstOrThrow({
      where: { id: input.reportId, userId: input.userId },
      include: { sections: { orderBy: { position: "asc" } } }
    });
    // Idempotency: the webhook returns HTTP 500 on a handler throw, so Telegram
    // re-delivers the same update and claimUpdate reprocesses it. If we already
    // produced an answer for this update, return it so the handler just re-sends
    // it — no second reserve, no second (paid) LLM call, no second capture.
    const answerKey = input.requestId ? `chat:${input.userId}:${input.requestId}` : undefined;
    if (answerKey) {
      const existing = await this.prisma.reportChatMessage.findUnique({
        where: { idempotencyKey: answerKey }
      });
      if (existing) {
        if (existing.role !== PENDING_ASSISTANT_ROLE) return messageToAnswer(existing);
        if (this.pendingIsStale(existing.createdAt)) {
          await this.recoverStalePendingAnswer({
            userId: input.userId,
            messageId: existing.id
          });
        } else {
          return this.waitForIdempotentAnswer(answerKey, input.userId);
        }
      }
    }
    const session = await this.prisma.reportChatSession
      .upsert({
        where: { id: `${report.id}` },
        create: { id: report.id, reportId: report.id, userId: input.userId, status: "active" },
        update: { status: "active" }
      })
      .catch(() =>
        this.prisma.reportChatSession.create({
          data: { reportId: report.id, userId: input.userId, status: "active" }
        })
      );
    let assistantMessageId: string = randomUUID();
    let ownsIdempotencySlot = false;
    if (answerKey) {
      try {
        const pending = await this.prisma.reportChatMessage.create({
          data: {
            id: assistantMessageId,
            sessionId: session.id,
            role: PENDING_ASSISTANT_ROLE,
            content: "",
            idempotencyKey: answerKey
          }
        });
        assistantMessageId = pending.id;
        ownsIdempotencySlot = true;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        return this.waitForIdempotentAnswer(answerKey, input.userId);
      }
    }
    let reserved = false;
    try {
      await this.credits.reserve({
        userId: input.userId,
        reportChatMessageId: assistantMessageId,
        amountUnits: MODE_COST_UNITS.chat_message,
        metadata: {
          type: "report_chat",
          reportId: report.id,
          reportChatMessageId: assistantMessageId
        }
      });
      reserved = true;
      const reportText = [
        report.rawText,
        ...report.sections.map((section) => `${section.title}\n${section.content}`)
      ].join("\n\n");
      const answer = await this.llm.chat({
        language: input.language,
        reportText,
        question: input.question
      });
      // Best-effort: usage logging must not throw, or the catch below would
      // release the reserve and hand out a paid LLM answer for free.
      await recordUsageSafe(this.prisma, {
        userId: input.userId,
        provider: env.OPENROUTER_API_KEY ? "openrouter" : "mock_llm",
        operation: "report_chat",
        model: answer.model,
        status: "success",
        costEstimateRub: env.OPENROUTER_API_KEY
          ? (env.ECON_CHAT_MESSAGE_COST_P75_RUB ?? null)
          : null,
        tokensIn: answer.tokensIn,
        tokensOut: answer.tokensOut
      });
      // Capture credits and persist the question + answer (answer keyed for
      // idempotency) in one transaction: a crash between them would either
      // re-charge on a retry or leave a keyed answer that a retry hands out for
      // free. Writing the question here (rather than before the LLM call) also
      // means a webhook retry can never duplicate it: a retry that re-enters
      // before this commits recomputes from scratch, and one that re-enters
      // after it short-circuits on the cached answer above.
      await this.credits.captureReserve({
        userId: input.userId,
        reportChatMessageId: assistantMessageId,
        amountUnits: MODE_COST_UNITS.chat_message,
        metadata: {
          type: "report_chat",
          reportId: report.id,
          reportChatMessageId: assistantMessageId
        },
        within: async (tx) => {
          await tx.reportChatMessage.create({
            data: { sessionId: session.id, role: "user", content: input.question }
          });
          if (ownsIdempotencySlot) {
            await tx.reportChatMessage.update({
              where: { id: assistantMessageId },
              data: {
                role: "assistant",
                content: answer.text,
                model: answer.model,
                tokensIn: answer.tokensIn,
                tokensOut: answer.tokensOut
              }
            });
          } else {
            await tx.reportChatMessage.create({
              data: {
                id: assistantMessageId,
                sessionId: session.id,
                role: "assistant",
                content: answer.text,
                model: answer.model,
                tokensIn: answer.tokensIn,
                tokensOut: answer.tokensOut,
                idempotencyKey: answerKey
              }
            });
          }
        }
      });
      return answer;
    } catch (error) {
      if (reserved) {
        await this.credits
          .releaseReserve({
            userId: input.userId,
            reportChatMessageId: assistantMessageId,
            amountUnits: MODE_COST_UNITS.chat_message,
            metadata: {
              type: "report_chat",
              reportId: report.id,
              reportChatMessageId: assistantMessageId,
              reason: error instanceof Error ? error.message : "chat_failed"
            }
          })
          .catch(() => undefined);
        await recordUsage(this.prisma, {
          userId: input.userId,
          provider: env.OPENROUTER_API_KEY ? "openrouter" : "mock_llm",
          operation: "report_chat",
          status: "failed",
          errorCode: error instanceof Error ? error.message : "CHAT_FAILED"
        }).catch(() => undefined);
      }
      if (ownsIdempotencySlot) {
        await this.prisma.reportChatMessage
          .deleteMany({ where: { id: assistantMessageId, role: PENDING_ASSISTANT_ROLE } })
          .catch(() => undefined);
      }
      throw error;
    }
  }

  async recoverStalePendingAnswers(now = new Date(), batchSize = 100): Promise<number> {
    const cutoff = new Date(now.getTime() - PENDING_ASSISTANT_STALE_MS);
    const pending = await this.prisma.reportChatMessage.findMany({
      where: {
        role: PENDING_ASSISTANT_ROLE,
        createdAt: { lt: cutoff }
      },
      select: {
        id: true,
        session: { select: { userId: true } }
      },
      orderBy: { createdAt: "asc" },
      take: batchSize
    });

    let recovered = 0;
    for (const message of pending) {
      const didRecover = await this.recoverStalePendingAnswer({
        userId: message.session.userId,
        messageId: message.id
      });
      if (didRecover) recovered += 1;
    }
    return recovered;
  }

  private async waitForIdempotentAnswer(answerKey: string, userId: string) {
    const deadline = Date.now() + IDEMPOTENCY_WAIT_MS;
    while (Date.now() < deadline) {
      const existing = await this.prisma.reportChatMessage.findUnique({
        where: { idempotencyKey: answerKey }
      });
      if (!existing) throw new ChatRequestInProgressError();
      if (existing.role !== PENDING_ASSISTANT_ROLE) return messageToAnswer(existing);
      if (this.pendingIsStale(existing.createdAt)) {
        await this.recoverStalePendingAnswer({ userId, messageId: existing.id });
        throw new ChatRequestInProgressError();
      }
      await delay(IDEMPOTENCY_POLL_MS);
    }
    throw new ChatRequestInProgressError();
  }

  private pendingIsStale(createdAt: Date): boolean {
    return Date.now() - createdAt.getTime() > PENDING_ASSISTANT_STALE_MS;
  }

  private async recoverStalePendingAnswer(input: {
    userId: string;
    messageId: string;
  }): Promise<boolean> {
    await this.credits.releaseReserve({
      userId: input.userId,
      reportChatMessageId: input.messageId,
      amountUnits: MODE_COST_UNITS.chat_message,
      metadata: {
        type: "report_chat",
        reportChatMessageId: input.messageId,
        reason: "stale_pending_chat_recovered"
      }
    });
    const deleted = await this.prisma.reportChatMessage.deleteMany({
      where: { id: input.messageId, role: PENDING_ASSISTANT_ROLE }
    });
    return deleted.count > 0;
  }
}

function messageToAnswer(message: {
  content: string;
  model?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
}) {
  return {
    text: message.content,
    model: message.model ?? "",
    tokensIn: message.tokensIn ?? undefined,
    tokensOut: message.tokensOut ?? undefined
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    Boolean(error) && typeof error === "object" && (error as { code?: unknown }).code === "P2002"
  );
}
