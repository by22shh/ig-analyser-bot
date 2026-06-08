import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";

function buildApp(rowStatus: string | null) {
  const findUnique = vi.fn(async () => (rowStatus === null ? null : { status: rowStatus }));
  const services = { prisma: { telegramUpdate: { findUnique } } };
  const bot = { handleUpdate: vi.fn(async () => undefined) };
  return {
    app: createApp({ services: services as never, bot: bot as never }),
    findUnique,
    bot
  };
}

describe("POST /telegram/webhook", () => {
  it("returns 500 so Telegram retries when the update failed processing", async () => {
    const { app } = buildApp("failed");
    const res = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      payload: { update_id: 42, message: { text: "x" } }
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it("returns 500 when a retried update is still marked as processing", async () => {
    const { app } = buildApp("processing");
    const res = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      payload: { update_id: 42, message: { text: "x" } }
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it("returns 200 when the update was processed", async () => {
    const { app, bot } = buildApp("processed");
    const res = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      payload: { update_id: 42 }
    });
    expect(res.statusCode).toBe(200);
    expect(bot.handleUpdate).toHaveBeenCalledOnce();
    await app.close();
  });

  it("returns 200 without a status lookup when the update has no update_id", async () => {
    const { app, findUnique } = buildApp("failed");
    const res = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      payload: { message: { text: "x" } }
    });
    expect(res.statusCode).toBe(200);
    expect(findUnique).not.toHaveBeenCalled();
    await app.close();
  });
});
