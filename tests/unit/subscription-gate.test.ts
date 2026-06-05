import { beforeEach, describe, expect, it, vi } from "vitest";

// Enable the gate for this file by flipping just the feature flag on the real,
// fully-parsed env (everything else keeps its default value).
vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/config/env.js")>();
  return { ...actual, env: { ...actual.env, FEATURE_REQUIRE_CHANNEL_SUB: true } };
});

import { CB } from "../../src/telegram/constants.js";
import {
  clearMembershipCache,
  isSubscriptionExemptAction,
  memberStatusIsSubscribed,
  subscriptionGate,
  subscriptionGateEnabled,
  userIsSubscribed
} from "../../src/telegram/middleware/subscription-gate.js";

function makeCtx(overrides: Record<string, unknown> = {}) {
  const getChatMember = vi.fn();
  const reply = vi.fn();
  const answerCallbackQuery = vi.fn();
  const ctx = {
    user: { language: "ru", consentAcceptedAt: new Date() },
    from: { id: 555 },
    services: { users: { isAdmin: () => false } },
    api: { getChatMember },
    reply,
    answerCallbackQuery,
    ...overrides
  } as never;
  return { ctx, getChatMember, reply };
}

beforeEach(() => clearMembershipCache());

describe("memberStatusIsSubscribed", () => {
  it("treats creator/administrator/member as subscribed", () => {
    expect(memberStatusIsSubscribed("creator")).toBe(true);
    expect(memberStatusIsSubscribed("administrator")).toBe(true);
    expect(memberStatusIsSubscribed("member")).toBe(true);
  });

  it("treats left/kicked as not subscribed", () => {
    expect(memberStatusIsSubscribed("left")).toBe(false);
    expect(memberStatusIsSubscribed("kicked")).toBe(false);
  });
});

describe("subscriptionGateEnabled", () => {
  it("is on when the flag and a channel id are present", () => {
    expect(subscriptionGateEnabled()).toBe(true);
  });
});

describe("isSubscriptionExemptAction", () => {
  it("exempts onboarding commands, language/consent callbacks and payments", () => {
    expect(isSubscriptionExemptAction({ message: { text: "/start" } } as never)).toBe(true);
    expect(isSubscriptionExemptAction({ callbackQuery: { data: `${CB.LANG}:en` } } as never)).toBe(
      true
    );
    expect(isSubscriptionExemptAction({ callbackQuery: { data: CB.ACCEPT_RULES } } as never)).toBe(
      true
    );
    expect(isSubscriptionExemptAction({ callbackQuery: { data: CB.CHECK_SUB } } as never)).toBe(
      true
    );
    expect(isSubscriptionExemptAction({ message: { successful_payment: {} } } as never)).toBe(true);
  });

  it("does not exempt normal actions", () => {
    expect(isSubscriptionExemptAction({ callbackQuery: { data: CB.ANALYZE } } as never)).toBe(
      false
    );
    expect(isSubscriptionExemptAction({ message: { text: "someusername" } } as never)).toBe(false);
  });
});

describe("userIsSubscribed", () => {
  it("returns true and caches when the member is active", async () => {
    const { ctx, getChatMember } = makeCtx();
    getChatMember.mockResolvedValue({ status: "member" });
    expect(await userIsSubscribed(ctx)).toBe(true);
    expect(await userIsSubscribed(ctx)).toBe(true); // served from cache
    expect(getChatMember).toHaveBeenCalledTimes(1);
  });

  it("returns false when the user has left", async () => {
    const { ctx, getChatMember } = makeCtx();
    getChatMember.mockResolvedValue({ status: "left" });
    expect(await userIsSubscribed(ctx)).toBe(false);
  });

  it("force bypasses the cache", async () => {
    const { ctx, getChatMember } = makeCtx();
    getChatMember.mockResolvedValue({ status: "member" });
    await userIsSubscribed(ctx);
    await userIsSubscribed(ctx, { force: true });
    expect(getChatMember).toHaveBeenCalledTimes(2);
  });

  it("fails open and does not cache on API errors", async () => {
    const { ctx, getChatMember } = makeCtx();
    getChatMember.mockRejectedValue(new Error("CHAT_ADMIN_REQUIRED"));
    expect(await userIsSubscribed(ctx)).toBe(true);
    expect(await userIsSubscribed(ctx)).toBe(true);
    expect(getChatMember).toHaveBeenCalledTimes(2); // not cached → retried
  });
});

describe("subscriptionGate middleware", () => {
  it("blocks a non-subscriber on a gated action", async () => {
    const { ctx, getChatMember, reply } = makeCtx({ message: { text: "someusername" } });
    getChatMember.mockResolvedValue({ status: "left" });
    const next = vi.fn();
    await subscriptionGate(ctx, next);
    expect(next).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalled();
  });

  it("lets a subscriber through", async () => {
    const { ctx, getChatMember, reply } = makeCtx({ message: { text: "someusername" } });
    getChatMember.mockResolvedValue({ status: "member" });
    const next = vi.fn();
    await subscriptionGate(ctx, next);
    expect(next).toHaveBeenCalledOnce();
    expect(reply).not.toHaveBeenCalled();
  });

  it("does not gate onboarding actions", async () => {
    const { ctx, getChatMember } = makeCtx({ message: { text: "/start" } });
    getChatMember.mockResolvedValue({ status: "left" });
    const next = vi.fn();
    await subscriptionGate(ctx, next);
    expect(next).toHaveBeenCalledOnce();
    expect(getChatMember).not.toHaveBeenCalled();
  });

  it("defers to consentGate before consent is accepted", async () => {
    const { ctx } = makeCtx({
      user: { language: "ru", consentAcceptedAt: null },
      message: { text: "x" }
    });
    const next = vi.fn();
    await subscriptionGate(ctx, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
