import { describe, expect, it, vi } from "vitest";
import { safeNotify } from "../../src/jobs/workers/notify.js";

function botWithSend(send: ReturnType<typeof vi.fn>) {
  return { api: { sendMessage: send } } as never;
}

describe("safeNotify", () => {
  it("swallows a delivery failure instead of throwing, and reports it via onError", async () => {
    const error = new Error("Forbidden: bot was blocked by the user");
    const send = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();

    // The whole point: a progress ping that fails must NOT propagate. Otherwise a
    // paid worker's success path would throw, the job would fail, and a retry
    // would re-run the already-paid pipeline (re-billing Apify/OpenRouter).
    await expect(safeNotify(botWithSend(send), 123, "progress", onError)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("does nothing (no throw, no send) when the bot is undefined", async () => {
    const onError = vi.fn();
    await expect(safeNotify(undefined, 123, "progress", onError)).resolves.toBeUndefined();
    expect(onError).not.toHaveBeenCalled();
  });

  it("delivers with HTML parse mode and a disabled link preview", async () => {
    const send = vi.fn().mockResolvedValue({ message_id: 1 });
    await safeNotify(botWithSend(send), 555, "<b>hi</b>");
    expect(send).toHaveBeenCalledWith(
      555,
      "<b>hi</b>",
      expect.objectContaining({ parse_mode: "HTML", link_preview_options: { is_disabled: true } })
    );
  });
});
