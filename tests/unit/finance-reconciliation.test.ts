import { describe, expect, it } from "vitest";
import {
  buildFinanceReconciliationReport,
  formatDelimitedRows,
  financeReconciliationRows,
  redactForFinanceExport,
  type FinanceReconciliationInput
} from "../../src/modules/finance/reconciliation.js";
import type { EconomicsSettings } from "../../src/modules/economics/model.js";

const from = new Date("2026-06-01T00:00:00.000Z");
const to = new Date("2026-06-08T00:00:00.000Z");
const now = new Date("2026-06-08T12:00:00.000Z");

const settings: EconomicsSettings = {
  usdToRubBuffer: 90,
  paymentFeeReserve: 0.2,
  starsUsdPerStarPayoutFloor: 0.01,
  starsPayoutReserve: 0.2,
  targetRevenueMultiple: 3,
  supportReserveRub: 5,
  providerCosts: {
    standard: 55,
    influencer: 63.25,
    hr: 63.25,
    osint_compliance: 74.25,
    photo_search: 25,
    chat_message: 2
  },
  caps: {
    metadataPostLimit: 120,
    postLimit: 30,
    visionBatchSize: 5,
    maxImagesAnalyzed: 30,
    maxImageDownloadMb: 8,
    finalInputTokens: 90000,
    finalOutputTokens: 8000,
    chatInputTokens: 12000,
    chatOutputTokens: 2048,
    facecheckTimeoutSeconds: 90,
    facecheckMaxCostRub: 15,
    pdfRenderTimeoutSeconds: 60
  }
};

describe("finance reconciliation", () => {
  it("aggregates payments, refunds, credits, liability and provider cost estimates", () => {
    const report = buildFinanceReconciliationReport(sampleInput(), {
      range: { from, to },
      settings,
      generatedAt: now
    });

    expect(report.payments.grossMinorByCurrency).toEqual({ RUB: 69000, XTR: 690 });
    expect(report.payments.refundMinorByCurrency).toEqual({ RUB: 23000 });
    expect(report.payments.netMinorByCurrency).toEqual({ RUB: 46000, XTR: 690 });
    expect(report.credits.soldUnits).toBe(600);
    expect(report.credits.consumedUnits).toBe(200);
    expect(report.credits.reservedUnits).toBe(100);
    expect(report.credits.refundedUnits).toBe(100);
    expect(report.liability.balanceUnits).toBe(500);
    expect(report.liability.reservedUnits).toBe(100);
    expect(report.liability.outstandingNetRevenueRub).toBe(828);
    expect(report.providerCosts.modeledUsageRub).toBe(80);
    expect(report.providerCosts.actualUsageRub).toBe(52);
    expect(report.providerCosts.modeledByMode).toEqual([
      { mode: "photo_search", captures: 1, units: 100, costRub: 25 },
      { mode: "standard", captures: 1, units: 100, costRub: 55 }
    ]);
    expect(report.failedEvents.count).toBe(1);
    expect(report.anomalies.map((item) => item.code)).toContain("failed_payment_events");
  });

  it("redacts raw payment/user payload fields before export", () => {
    const redacted = redactForFinanceExport({
      userId: "user-123",
      providerPaymentId: "pay-secret",
      amountMinor: 69000,
      payload: {
        customer: { email: "person@example.com", phone: "+70000000000" },
        token: "tok_live_secret"
      },
      nested: [{ providerObjectId: "evt-secret" }]
    });

    expect(redacted).toEqual({
      userId: "[REDACTED]",
      providerPaymentId: "[REDACTED]",
      amountMinor: 69000,
      payload: "[REDACTED]",
      nested: [{ providerObjectId: "[REDACTED]" }]
    });
  });

  it("returns zeroed sections for an empty range", () => {
    const report = buildFinanceReconciliationReport(
      {
        paymentOrders: [],
        refunds: [],
        creditTransactions: [],
        creditAccounts: [],
        paymentEvents: [],
        usageEvents: []
      },
      { range: { from, to }, settings, generatedAt: now }
    );

    expect(report.payments.byProviderCurrency).toEqual([]);
    expect(report.credits.consumedUnits).toBe(0);
    expect(report.liability.outstandingNetRevenueRub).toBe(0);
    expect(report.providerCosts.actualUsageRub).toBe(0);
    expect(report.anomalies).toEqual([]);
  });

  it("keeps failed refunds out of net revenue and reports successful refunds only", () => {
    const input = sampleInput();
    input.refunds.push({
      id: "refund-failed",
      provider: "yookassa",
      status: "failed",
      amountMinor: 69000,
      currency: "RUB",
      createdAt: new Date("2026-06-04T00:00:00.000Z")
    });

    const report = buildFinanceReconciliationReport(input, {
      range: { from, to },
      settings,
      generatedAt: now
    });

    expect(report.payments.refundMinorByCurrency).toEqual({ RUB: 23000 });
    expect(
      report.payments.byProviderCurrency.find((item) => item.provider === "yookassa")
    ).toMatchObject({ succeededRefunds: 1 });
  });

  it("flags provider cost overruns using economics-derived thresholds", () => {
    const input = sampleInput();
    input.usageEvents.push({
      id: "usage-expensive",
      provider: "openrouter",
      operation: "analysis",
      status: "success",
      costEstimateRub: 120,
      createdAt: new Date("2026-06-02T00:00:00.000Z")
    });

    const report = buildFinanceReconciliationReport(input, {
      range: { from, to },
      settings,
      generatedAt: now
    });

    expect(report.thresholds.maxProviderCostToNetRevenueRatio).toBeCloseTo(1 / 3);
    expect(report.thresholds.providerCostOverrunRatio).toBeCloseTo(1 / 3);
    expect(report.anomalies.map((item) => item.code)).toContain("actual_cost_over_model");
  });

  it("formats delimited export rows", () => {
    const report = buildFinanceReconciliationReport(sampleInput(), {
      range: { from, to },
      settings,
      generatedAt: now
    });

    const output = formatDelimitedRows(financeReconciliationRows(report), "\t");

    expect(output).toContain("section\tmetric\tscope\tvalue");
    expect(output).toContain("payments\tgross_minor\tyookassa:RUB\t69000");
    expect(output).toContain("provider_costs\tmodeled_usage_rub\tstandard\t55");
  });
});

function sampleInput(): FinanceReconciliationInput {
  return {
    paymentOrders: [
      {
        id: "order-rub",
        provider: "yookassa",
        status: "paid",
        amountMinor: 69000,
        currency: "RUB",
        creditsUnits: 300,
        createdAt: new Date("2026-06-02T00:00:00.000Z"),
        paidAt: new Date("2026-06-02T00:10:00.000Z")
      },
      {
        id: "order-stars",
        provider: "telegram_stars",
        status: "paid",
        amountMinor: 690,
        currency: "XTR",
        creditsUnits: 300,
        createdAt: new Date("2026-06-03T00:00:00.000Z"),
        paidAt: new Date("2026-06-03T00:10:00.000Z")
      },
      {
        id: "order-pending",
        provider: "yookassa",
        status: "pending_payment",
        amountMinor: 23000,
        currency: "RUB",
        creditsUnits: 100,
        createdAt: new Date("2026-06-03T00:00:00.000Z")
      },
      {
        id: "order-outside",
        provider: "yookassa",
        status: "paid",
        amountMinor: 99900,
        currency: "RUB",
        creditsUnits: 300,
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        paidAt: new Date("2026-05-01T00:10:00.000Z")
      }
    ],
    refunds: [
      {
        id: "refund-rub",
        paymentOrderId: "order-rub",
        provider: "yookassa",
        status: "succeeded",
        amountMinor: 23000,
        currency: "RUB",
        createdAt: new Date("2026-06-04T00:00:00.000Z")
      }
    ],
    creditTransactions: [
      {
        id: "purchase-rub",
        type: "purchase",
        amountUnits: 300,
        createdAt: new Date("2026-06-02T00:10:00.000Z"),
        provider: "yookassa"
      },
      {
        id: "purchase-stars",
        type: "purchase",
        amountUnits: 300,
        createdAt: new Date("2026-06-03T00:10:00.000Z"),
        provider: "telegram_stars"
      },
      {
        id: "reserve-standard",
        type: "reserve",
        amountUnits: -100,
        createdAt: new Date("2026-06-03T00:20:00.000Z"),
        analysisMode: "standard",
        analysisJobId: "job-standard"
      },
      {
        id: "capture-standard",
        type: "capture",
        amountUnits: -100,
        createdAt: new Date("2026-06-03T00:40:00.000Z"),
        analysisMode: "standard",
        analysisJobId: "job-standard"
      },
      {
        id: "capture-photo",
        type: "capture",
        amountUnits: -100,
        createdAt: new Date("2026-06-04T00:40:00.000Z"),
        photoSearchJobId: "photo-job"
      },
      {
        id: "refund-credit",
        type: "refund",
        amountUnits: -100,
        createdAt: new Date("2026-06-04T01:00:00.000Z"),
        provider: "yookassa"
      }
    ],
    creditAccounts: [{ balanceUnits: 500, reservedUnits: 100 }],
    paymentEvents: [
      {
        id: "event-failed",
        provider: "yookassa",
        eventType: "payment.succeeded",
        providerObjectId: "pay-secret",
        processingStatus: "failed",
        errorCode: "PAYMENT_AMOUNT_MISMATCH",
        receivedAt: new Date("2026-06-04T00:00:00.000Z"),
        payload: { raw: true, email: "person@example.com" }
      }
    ],
    usageEvents: [
      {
        id: "usage-apify",
        provider: "apify",
        operation: "profile_fetch",
        status: "success",
        costEstimateRub: 12,
        createdAt: new Date("2026-06-03T00:20:00.000Z")
      },
      {
        id: "usage-openrouter",
        provider: "openrouter",
        operation: "analysis",
        status: "success",
        costEstimateRub: 40,
        createdAt: new Date("2026-06-03T00:30:00.000Z")
      }
    ]
  };
}
