import { describe, expect, it } from "vitest";
import { decodeInvoicePayload, encodeInvoicePayload } from "../../src/modules/payments/invoice-payload.js";

describe("invoice payload", () => {
  it("round trips bounded payment data", () => {
    const encoded = encodeInvoicePayload({
      v: 1,
      orderId: "order",
      userId: "user",
      packageCode: "start",
      provider: "telegram_stars",
      currency: "XTR",
      amountMinor: 690
    });
    expect(decodeInvoicePayload(encoded)).toMatchObject({ orderId: "order", amountMinor: 690 });
  });

  it("rejects malformed payloads", () => {
    expect(decodeInvoicePayload("bad")).toBeNull();
    expect(decodeInvoicePayload("zreti:1:telegram_stars:o:u:start:XTR:0")).toBeNull();
  });
});
