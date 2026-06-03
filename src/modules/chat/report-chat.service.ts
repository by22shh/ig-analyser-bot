import type { PrismaClient } from "@prisma/client";
import type { Locale } from "../../telegram/constants.js";
import type { LlmProvider } from "../llm/types.js";

export class ReportChatService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly llm: LlmProvider
  ) {}

  async ask(input: { userId: string; reportId: string; question: string; language: Locale }) {
    const report = await this.prisma.report.findFirstOrThrow({
      where: { id: input.reportId, userId: input.userId },
      include: { sections: { orderBy: { position: "asc" } } }
    });
    const session = await this.prisma.reportChatSession.upsert({
      where: { id: `${report.id}` },
      create: { id: report.id, reportId: report.id, userId: input.userId, status: "active" },
      update: { status: "active" }
    }).catch(() =>
      this.prisma.reportChatSession.create({
        data: { reportId: report.id, userId: input.userId, status: "active" }
      })
    );
    await this.prisma.reportChatMessage.create({
      data: { sessionId: session.id, role: "user", content: input.question }
    });
    const reportText = [report.rawText, ...report.sections.map((section) => `${section.title}\n${section.content}`)].join("\n\n");
    const answer = await this.llm.chat({ language: input.language, reportText, question: input.question });
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
    return answer;
  }
}
