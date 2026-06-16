import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../src/config/env.js";
import { registerAdminHandlers } from "../../src/telegram/handlers/admin.js";

type CommandHandler = (ctx: Record<string, any>) => Promise<void>;

const originalEnv = {
  ADMIN_MAX_GRANT_CREDITS: env.ADMIN_MAX_GRANT_CREDITS,
  TELEGRAM_STARS_REFUNDS_ENABLED: env.TELEGRAM_STARS_REFUNDS_ENABLED
};

afterEach(() => {
  Object.assign(env, originalEnv);
  vi.clearAllMocks();
});

describe("admin handlers", () => {
  it("does nothing for non-admin grant attempts", async () => {
    const { commands } = registerAdminTestBot();
    const setup = makeCtx({ isAdmin: false, text: "/admin_grant 9001 5" });

    await command(commands, "admin_grant")(setup.ctx);

    expect(setup.services.credits.grant).not.toHaveBeenCalled();
    expect(setup.services.prisma.auditLog.create).not.toHaveBeenCalled();
    expect(setup.reply).not.toHaveBeenCalled();
  });

  it("rejects invalid grant input and enforces the max grant cap", async () => {
    env.ADMIN_MAX_GRANT_CREDITS = 10;
    const { commands } = registerAdminTestBot();
    const setup = makeCtx({ text: "/admin_grant 9001 11" });

    await command(commands, "admin_grant")(setup.ctx);

    expect(setup.reply).toHaveBeenCalledWith(
      expect.stringContaining("максимум 10"),
      expect.any(Object)
    );
    expect(setup.services.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(setup.services.credits.grant).not.toHaveBeenCalled();
  });

  it("grants credits and records an audit log", async () => {
    const { commands } = registerAdminTestBot();
    const setup = makeCtx({ text: "/admin_grant 9001 2.5" });

    await command(commands, "admin_grant")(setup.ctx);

    expect(setup.services.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { telegramId: 9001n }
    });
    expect(setup.services.credits.grant).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "target-user",
        amountUnits: 250,
        type: "grant",
        provider: "admin"
      })
    );
    expect(setup.services.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "admin-user",
        targetUserId: "target-user",
        action: "admin_grant_credits",
        entityType: "credit_transaction",
        entityId: "tx-1",
        metadata: expect.objectContaining({ telegramId: 9001, credits: 2.5, amountUnits: 250 })
      })
    });
    expect(setup.reply).toHaveBeenCalledWith(
      expect.stringContaining("Начислено"),
      expect.any(Object)
    );
  });

  it("still confirms a grant when audit logging fails", async () => {
    const { commands } = registerAdminTestBot();
    const setup = makeCtx({ text: "/admin_grant 9001 1" });
    setup.services.prisma.auditLog.create.mockRejectedValueOnce(new Error("audit down"));

    await command(commands, "admin_grant")(setup.ctx);

    expect(setup.services.credits.grant).toHaveBeenCalled();
    expect(setup.reply).toHaveBeenCalledWith(
      expect.stringContaining("Начислено"),
      expect.any(Object)
    );
  });

  it("returns usage for invalid Stars refund order ids", async () => {
    const { commands } = registerAdminTestBot();
    const setup = makeCtx({ text: "/admin_refund_stars not-a-uuid" });

    await command(commands, "admin_refund_stars")(setup.ctx);

    expect(setup.services.payments.refundTelegramStarsPayment).not.toHaveBeenCalled();
    expect(setup.reply).toHaveBeenCalledWith(
      expect.stringContaining("Usage: /admin_refund_stars"),
      expect.any(Object)
    );
  });

  it("records idempotent Stars refunds as already processed", async () => {
    const { commands } = registerAdminTestBot();
    const setup = makeCtx({
      text: "/admin_refund_stars 11111111-1111-1111-1111-111111111111",
      refundResult: { refundId: "refund-1", status: "succeeded", alreadyProcessed: true }
    });

    await command(commands, "admin_refund_stars")(setup.ctx);

    expect(setup.services.payments.refundTelegramStarsPayment).toHaveBeenCalledWith({
      api: setup.ctx.api,
      paymentOrderId: "11111111-1111-1111-1111-111111111111",
      adminUserId: "admin-user",
      reason: "admin_manual_refund"
    });
    expect(setup.services.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "admin_refund_stars",
        entityType: "payment_order",
        entityId: "11111111-1111-1111-1111-111111111111",
        metadata: expect.objectContaining({
          refundId: "refund-1",
          status: "succeeded",
          alreadyProcessed: true
        })
      })
    });
    expect(setup.reply).toHaveBeenCalledWith(
      expect.stringContaining("already processed"),
      expect.any(Object)
    );
  });

  it("records a failed Stars refund audit log", async () => {
    const { commands } = registerAdminTestBot();
    const setup = makeCtx({ text: "/admin_refund_stars 22222222-2222-2222-2222-222222222222" });
    setup.services.payments.refundTelegramStarsPayment.mockRejectedValueOnce(
      new Error("REFUND_CREDITS_SPENT")
    );

    await command(commands, "admin_refund_stars")(setup.ctx);

    expect(setup.services.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "admin_refund_stars_failed",
        entityType: "payment_order",
        entityId: "22222222-2222-2222-2222-222222222222",
        metadata: expect.objectContaining({ error: "REFUND_CREDITS_SPENT" })
      })
    });
    expect(setup.reply).toHaveBeenCalledWith(
      expect.stringContaining("Refund failed: REFUND_CREDITS_SPENT"),
      expect.any(Object)
    );
  });
});

function registerAdminTestBot() {
  const commands = new Map<string, CommandHandler>();
  const bot = {
    command: vi.fn((names: string | string[], handler: CommandHandler) => {
      for (const name of Array.isArray(names) ? names : [names]) commands.set(name, handler);
    }),
    callbackQuery: vi.fn()
  };
  registerAdminHandlers(bot as never);
  return { commands };
}

function command(commands: Map<string, CommandHandler>, name: string): CommandHandler {
  const handler = commands.get(name);
  if (!handler) throw new Error(`Command handler not registered: ${name}`);
  return handler;
}

function makeCtx(input: {
  text: string;
  isAdmin?: boolean;
  refundResult?: { refundId: string; status: "succeeded"; alreadyProcessed?: boolean };
}) {
  const reply = vi.fn(async () => undefined);
  const order = {
    id: "payment-order",
    userId: "target-user",
    provider: "telegram_stars",
    status: "paid",
    amountMinor: 690,
    creditsUnits: 300
  };
  const services = {
    users: { isAdmin: vi.fn(() => input.isAdmin ?? true) },
    credits: { grant: vi.fn(async () => ({ id: "tx-1" })) },
    payments: {
      refundTelegramStarsPayment: vi.fn(
        async () => input.refundResult ?? { refundId: "refund-1", status: "succeeded" }
      )
    },
    prisma: {
      user: {
        findUnique: vi.fn(async () => ({
          id: "target-user",
          telegramId: 9001n,
          language: "ru",
          role: "user"
        }))
      },
      paymentOrder: { findUnique: vi.fn(async () => order) },
      auditLog: { create: vi.fn(async () => ({ id: "audit-1" })) }
    }
  };
  return {
    reply,
    services,
    ctx: {
      user: { id: "admin-user", role: "admin", language: "ru" },
      message: { text: input.text },
      api: { refundStarPayment: vi.fn() },
      services,
      reply
    }
  };
}
