import type { PrismaClient } from "@prisma/client";
import { env } from "../../config/env.js";
import type { Locale } from "../../telegram/constants.js";
import { MODE_COST_UNITS } from "../billing/packages.js";
import type { CreditsService } from "../billing/credits.service.js";
import type { LlmProvider } from "../llm/types.js";
import { recordUsage, recordUsageSafe } from "../observability/usage.js";

export class ReportChatService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly llm: LlmProvider,
    private readonly credits: CreditsService
  ) {}

  async ask(input: { userId: string; reportId: string; question: string; language: Locale }) {
    const report = await this.prisma.report.findFirstOrThrow({
      where: { id: input.reportId, userId: input.userId },
      include: { sections: { orderBy: { position: "asc" } } }
    });
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
    await this.credits.reserve({
      userId: input.userId,
      amountUnits: MODE_COST_UNITS.chat_message,
      metadata: { type: "report_chat", reportId: report.id }
    });
    try {
      await this.prisma.reportChatMessage.create({
        data: { sessionId: session.id, role: "user", content: input.question }
      });
      const reportText = [
        report.rawText,
        ...report.sections.map((section) => `${section.title}\n${section.content}`)
      ].join("\n\n");
      const answer = await this.llm.chat({
        language: input.language,
        reportText,
        question: input.question
      });
      await this.prisma.reportChatMessage.create({
        data: {
          sessionId: session.id,
          role: "assistant",
          content: answer.text,
          model: answer.model,
          tokensIn: answer.tokensIn,
          tokensOut: answer.tokensOut
        }
      });
      // Best-effort: usage logging must not throw, or the catch below would
      // release the reserve and hand out a paid LLM answer for free.
      await recordUsageSafe(this.prisma, {
        userId: input.userId,
        provider: env.OPENROUTER_API_KEY ? "openrouter" : "mock_llm",
        operation: "report_chat",
        model: answer.model,
        status: "success",
        tokensIn: answer.tokensIn,
        tokensOut: answer.tokensOut
      });
      await this.credits.captureReserve({
        userId: input.userId,
        amountUnits: MODE_COST_UNITS.chat_message,
        metadata: { type: "report_chat", reportId: report.id }
      });
      return answer;
    } catch (error) {
      await this.credits
        .releaseReserve({
          userId: input.userId,
          amountUnits: MODE_COST_UNITS.chat_message,
          metadata: {
            type: "report_chat",
            reportId: report.id,
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
      throw error;
    }
  }

  async refundUndeliveredAnswer(input: { userId: string; reportId: string; reason?: string }) {
    return this.credits.grant({
      userId: input.userId,
      amountUnits: MODE_COST_UNITS.chat_message,
      provider: "report_chat",
      metadata: {
        type: "report_chat_delivery_refund",
        reportId: input.reportId,
        reason: input.reason ?? "delivery_failed"
      },
      type: "admin_adjustment"
    });
  }
}
