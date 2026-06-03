import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { WizardState } from "../../telegram/constants.js";

export type WizardPayload = Record<string, unknown>;

export class WizardStateService {
  constructor(private readonly prisma: PrismaClient) {}

  async set(userId: string, state: WizardState, payload: WizardPayload = {}) {
    return this.prisma.telegramWizardState.upsert({
      where: { userId },
      create: { userId, state, payload: payload as Prisma.InputJsonObject },
      update: { state, payload: payload as Prisma.InputJsonObject }
    });
  }

  async get<T extends WizardPayload = WizardPayload>(
    userId: string
  ): Promise<{ state: WizardState; payload: T } | null> {
    const row = await this.prisma.telegramWizardState.findUnique({ where: { userId } });
    if (!row) return null;
    return { state: row.state as WizardState, payload: (row.payload ?? {}) as T };
  }

  async patch(userId: string, payload: WizardPayload) {
    const current = await this.get(userId);
    if (!current) return null;
    return this.set(userId, current.state, { ...current.payload, ...payload });
  }

  async clear(userId: string) {
    await this.prisma.telegramWizardState.deleteMany({ where: { userId } });
  }
}
