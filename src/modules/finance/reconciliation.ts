import {
  guardrailNetRubPerCredit,
  type EconomicsSettings,
  type PublicMode
} from "../economics/model.js";

export type FinanceDateRange = {
  from: Date;
  to: Date;
};

export type ReconciliationPaymentOrder = {
  id: string;
  provider: string;
  status: string;
  amountMinor: number;
  currency: string;
  creditsUnits: number;
  paidAt?: Date | null;
  createdAt: Date;
  packageCode?: string | null;
  providerPaymentId?: string | null;
  userId?: string | null;
  raw?: unknown;
  payload?: unknown;
};

export type ReconciliationRefund = {
  id: string;
  provider: string;
  status: string;
  amountMinor: number;
  currency: string;
  createdAt: Date;
  paymentOrderId?: string | null;
  providerRefundId?: string | null;
  raw?: unknown;
};

export type ReconciliationCreditTransaction = {
  id: string;
  type: string;
  amountUnits: number;
  createdAt: Date;
  provider?: string | null;
  providerPaymentId?: string | null;
  analysisMode?: string | null;
  analysisJobId?: string | null;
  photoSearchJobId?: string | null;
  reportChatMessageId?: string | null;
  metadata?: unknown;
};

export type ReconciliationCreditAccount = {
  balanceUnits: number;
  reservedUnits: number;
  plan?: string | null;
};

export type ReconciliationPaymentEvent = {
  id: string;
  provider: string;
  eventType: string;
  providerObjectId: string;
  processingStatus: string;
  receivedAt: Date;
  processedAt?: Date | null;
  errorCode?: string | null;
  payload?: unknown;
};

export type ReconciliationUsageEvent = {
  id: string;
  provider: string;
  operation: string;
  status: string;
  costEstimateRub?: number | null;
  createdAt: Date;
};

export type FinanceReconciliationInput = {
  paymentOrders: ReconciliationPaymentOrder[];
  refunds: ReconciliationRefund[];
  creditTransactions: ReconciliationCreditTransaction[];
  creditAccounts: ReconciliationCreditAccount[];
  paymentEvents: ReconciliationPaymentEvent[];
  usageEvents: ReconciliationUsageEvent[];
};

export type MoneySummary = {
  provider: string;
  currency: string;
  grossMinor: number;
  refundMinor: number;
  netMinor: number;
  paidOrders: number;
  succeededRefunds: number;
};

export type StatusSummary = {
  status: string;
  count: number;
  amountMinor?: number;
};

export type ProviderCostSummary = {
  provider: string;
  operation: string;
  costRub: number;
  events: number;
};

export type ModeledProviderCostSummary = {
  mode: PublicMode;
  captures: number;
  units: number;
  costRub: number;
};

export type FinanceAnomaly = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  value?: number;
  threshold?: number;
};

export type FinanceReconciliationReport = {
  generatedAt: string;
  range: {
    from: string;
    to: string;
  };
  thresholds: {
    targetRevenueMultiple: number;
    maxProviderCostToNetRevenueRatio: number;
    providerCostOverrunRatio: number;
  };
  payments: {
    byProviderCurrency: MoneySummary[];
    grossMinorByCurrency: Record<string, number>;
    refundMinorByCurrency: Record<string, number>;
    netMinorByCurrency: Record<string, number>;
    statusCounts: StatusSummary[];
  };
  credits: {
    soldUnits: number;
    consumedUnits: number;
    reservedUnits: number;
    releasedUnits: number;
    refundedUnits: number;
    adjustmentsUnits: number;
  };
  liability: {
    accountCount: number;
    balanceUnits: number;
    reservedUnits: number;
    availableUnits: number;
    netRubPerCredit: number;
    outstandingNetRevenueRub: number;
    reservedNetRevenueRub: number;
  };
  providerCosts: {
    actualUsageRub: number;
    modeledUsageRub: number;
    actualByProviderOperation: ProviderCostSummary[];
    modeledByMode: ModeledProviderCostSummary[];
    unknownCaptureUnits: number;
  };
  failedEvents: {
    count: number;
    byProviderEventError: Array<{
      provider: string;
      eventType: string;
      errorCode: string;
      count: number;
    }>;
    samples: Array<Record<string, unknown>>;
  };
  anomalies: FinanceAnomaly[];
};

export type FinanceReconciliationOptions = {
  range: FinanceDateRange;
  settings: EconomicsSettings;
  generatedAt?: Date;
};

type MutableMoneySummary = MoneySummary;

const CREDIT_UNIT = 100;

const publicModes = new Set<PublicMode>([
  "standard",
  "influencer",
  "hr",
  "osint_compliance",
  "photo_search",
  "chat_message"
]);

const sensitiveKeyPattern =
  /(^|_)(raw|payload|metadata|token|secret|password|authorization|cookie|email|phone|telegram|providerpaymentid|providerobjectid|providerrefundid|invoicepayload|idempotencykey|userid)($|_)/i;

export function buildFinanceReconciliationReport(
  input: FinanceReconciliationInput,
  options: FinanceReconciliationOptions
): FinanceReconciliationReport {
  const range = options.range;
  const generatedAt = options.generatedAt ?? new Date();
  const netRubPerCredit = guardrailNetRubPerCredit(options.settings);
  const thresholds = {
    targetRevenueMultiple: options.settings.targetRevenueMultiple,
    maxProviderCostToNetRevenueRatio: 1 / options.settings.targetRevenueMultiple,
    providerCostOverrunRatio: Math.max(0.25, 1 / options.settings.targetRevenueMultiple)
  };

  const paidOrders = input.paymentOrders.filter(
    (order) => order.status === "paid" && dateInRange(order.paidAt ?? order.createdAt, range)
  );
  const ordersInRange = input.paymentOrders.filter((order) => dateInRange(order.createdAt, range));
  const refundsInRange = input.refunds.filter((refund) => dateInRange(refund.createdAt, range));
  const successfulRefunds = refundsInRange.filter((refund) => refund.status === "succeeded");
  const creditTransactions = input.creditTransactions.filter((transaction) =>
    dateInRange(transaction.createdAt, range)
  );
  const usageEvents = input.usageEvents.filter((event) => dateInRange(event.createdAt, range));
  const paymentEvents = input.paymentEvents.filter((event) => dateInRange(event.receivedAt, range));

  const byProviderCurrency = buildMoneySummary(paidOrders, successfulRefunds);
  const grossMinorByCurrency = sumMoneyByCurrency(byProviderCurrency, "grossMinor");
  const refundMinorByCurrency = sumMoneyByCurrency(byProviderCurrency, "refundMinor");
  const netMinorByCurrency = sumMoneyByCurrency(byProviderCurrency, "netMinor");
  const statusCounts = countOrderStatuses(ordersInRange);
  const credits = summarizeCredits(creditTransactions);
  const liability = summarizeLiability(input.creditAccounts, netRubPerCredit);
  const providerCosts = summarizeProviderCosts(creditTransactions, usageEvents, options.settings);
  const failedEvents = summarizeFailedEvents(paymentEvents);
  const anomalies = buildAnomalies({
    byProviderCurrency,
    credits,
    failedEventsCount: failedEvents.count,
    liability,
    providerCosts,
    thresholds
  });

  return {
    generatedAt: generatedAt.toISOString(),
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString()
    },
    thresholds,
    payments: {
      byProviderCurrency,
      grossMinorByCurrency,
      refundMinorByCurrency,
      netMinorByCurrency,
      statusCounts
    },
    credits,
    liability,
    providerCosts,
    failedEvents,
    anomalies
  };
}

export function redactForFinanceExport(value: unknown): unknown {
  return redactValue(value, undefined, 0);
}

export function financeReconciliationRows(
  report: FinanceReconciliationReport
): Array<Record<string, string | number>> {
  const rows: Array<Record<string, string | number>> = [
    { section: "range", metric: "from", scope: "all", value: report.range.from },
    { section: "range", metric: "to", scope: "all", value: report.range.to },
    {
      section: "thresholds",
      metric: "target_revenue_multiple",
      scope: "economics",
      value: report.thresholds.targetRevenueMultiple
    },
    {
      section: "thresholds",
      metric: "max_provider_cost_to_net_revenue_ratio",
      scope: "economics",
      value: roundMoney(report.thresholds.maxProviderCostToNetRevenueRatio)
    }
  ];

  for (const item of report.payments.byProviderCurrency) {
    const scope = `${item.provider}:${item.currency}`;
    rows.push({ section: "payments", metric: "gross_minor", scope, value: item.grossMinor });
    rows.push({ section: "payments", metric: "refund_minor", scope, value: item.refundMinor });
    rows.push({ section: "payments", metric: "net_minor", scope, value: item.netMinor });
    rows.push({ section: "payments", metric: "paid_orders", scope, value: item.paidOrders });
  }

  rows.push({
    section: "credits",
    metric: "sold_units",
    scope: "all",
    value: report.credits.soldUnits
  });
  rows.push({
    section: "credits",
    metric: "consumed_units",
    scope: "all",
    value: report.credits.consumedUnits
  });
  rows.push({
    section: "credits",
    metric: "reserved_units",
    scope: "all",
    value: report.credits.reservedUnits
  });
  rows.push({
    section: "liability",
    metric: "balance_units",
    scope: "all_accounts",
    value: report.liability.balanceUnits
  });
  rows.push({
    section: "liability",
    metric: "outstanding_net_revenue_rub",
    scope: "all_accounts",
    value: report.liability.outstandingNetRevenueRub
  });
  rows.push({
    section: "provider_costs",
    metric: "actual_usage_rub",
    scope: "all",
    value: report.providerCosts.actualUsageRub
  });
  rows.push({
    section: "provider_costs",
    metric: "modeled_usage_rub",
    scope: "all",
    value: report.providerCosts.modeledUsageRub
  });
  rows.push({
    section: "failed_events",
    metric: "count",
    scope: "all",
    value: report.failedEvents.count
  });
  rows.push({
    section: "anomalies",
    metric: "count",
    scope: "all",
    value: report.anomalies.length
  });

  for (const item of report.providerCosts.actualByProviderOperation) {
    rows.push({
      section: "provider_costs",
      metric: "actual_usage_rub",
      scope: `${item.provider}:${item.operation}`,
      value: item.costRub
    });
  }

  for (const item of report.providerCosts.modeledByMode) {
    rows.push({
      section: "provider_costs",
      metric: "modeled_usage_rub",
      scope: item.mode,
      value: item.costRub
    });
  }

  for (const item of report.failedEvents.byProviderEventError) {
    rows.push({
      section: "failed_events",
      metric: item.errorCode,
      scope: `${item.provider}:${item.eventType}`,
      value: item.count
    });
  }

  return rows;
}

export function formatDelimitedRows(
  rows: Array<Record<string, string | number>>,
  delimiter: "," | "\t"
): string {
  const headers = ["section", "metric", "scope", "value"];
  const lines = [
    headers.join(delimiter),
    ...rows.map((row) =>
      headers.map((header) => escapeCell(row[header] ?? "", delimiter)).join(delimiter)
    )
  ];
  return `${lines.join("\n")}\n`;
}

function buildMoneySummary(
  paidOrders: ReconciliationPaymentOrder[],
  successfulRefunds: ReconciliationRefund[]
): MoneySummary[] {
  const map = new Map<string, MutableMoneySummary>();

  for (const order of paidOrders) {
    const key = moneyKey(order.provider, order.currency);
    const item = map.get(key) ?? emptyMoneySummary(order.provider, order.currency);
    item.grossMinor += order.amountMinor;
    item.netMinor += order.amountMinor;
    item.paidOrders += 1;
    map.set(key, item);
  }

  for (const refund of successfulRefunds) {
    const key = moneyKey(refund.provider, refund.currency);
    const item = map.get(key) ?? emptyMoneySummary(refund.provider, refund.currency);
    item.refundMinor += refund.amountMinor;
    item.netMinor -= refund.amountMinor;
    item.succeededRefunds += 1;
    map.set(key, item);
  }

  return [...map.values()].sort((a, b) =>
    `${a.provider}:${a.currency}`.localeCompare(`${b.provider}:${b.currency}`)
  );
}

function summarizeCredits(transactions: ReconciliationCreditTransaction[]) {
  let soldUnits = 0;
  let consumedUnits = 0;
  let reservedUnits = 0;
  let releasedUnits = 0;
  let refundedUnits = 0;
  let adjustmentsUnits = 0;

  for (const transaction of transactions) {
    if (transaction.type === "purchase" && transaction.amountUnits > 0) {
      soldUnits += transaction.amountUnits;
    } else if (transaction.type === "capture" && transaction.amountUnits < 0) {
      consumedUnits += Math.abs(transaction.amountUnits);
    } else if (transaction.type === "reserve" && transaction.amountUnits < 0) {
      reservedUnits += Math.abs(transaction.amountUnits);
    } else if (transaction.type === "refund" && transaction.amountUnits > 0) {
      releasedUnits += transaction.amountUnits;
    } else if (transaction.type === "refund" && transaction.amountUnits < 0) {
      refundedUnits += Math.abs(transaction.amountUnits);
    } else if (transaction.type === "admin_adjustment" || transaction.type === "grant") {
      adjustmentsUnits += transaction.amountUnits;
    }
  }

  return {
    soldUnits,
    consumedUnits,
    reservedUnits,
    releasedUnits,
    refundedUnits,
    adjustmentsUnits
  };
}

function summarizeLiability(accounts: ReconciliationCreditAccount[], netRubPerCredit: number) {
  const balanceUnits = accounts.reduce((sum, account) => sum + account.balanceUnits, 0);
  const reservedUnits = accounts.reduce((sum, account) => sum + account.reservedUnits, 0);
  const availableUnits = balanceUnits - reservedUnits;
  return {
    accountCount: accounts.length,
    balanceUnits,
    reservedUnits,
    availableUnits,
    netRubPerCredit: roundMoney(netRubPerCredit),
    outstandingNetRevenueRub: roundMoney(unitsToCredits(balanceUnits) * netRubPerCredit),
    reservedNetRevenueRub: roundMoney(unitsToCredits(reservedUnits) * netRubPerCredit)
  };
}

function summarizeProviderCosts(
  transactions: ReconciliationCreditTransaction[],
  usageEvents: ReconciliationUsageEvent[],
  settings: EconomicsSettings
) {
  const actualMap = new Map<string, ProviderCostSummary>();
  for (const event of usageEvents) {
    if (event.status !== "success" || event.costEstimateRub == null) continue;
    const costRub = Number(event.costEstimateRub);
    if (!Number.isFinite(costRub) || costRub <= 0) continue;
    const key = `${event.provider}:${event.operation}`;
    const item = actualMap.get(key) ?? {
      provider: event.provider,
      operation: event.operation,
      costRub: 0,
      events: 0
    };
    item.costRub += costRub;
    item.events += 1;
    actualMap.set(key, item);
  }

  const modeledMap = new Map<PublicMode, ModeledProviderCostSummary>();
  let unknownCaptureUnits = 0;
  for (const transaction of transactions) {
    if (transaction.type !== "capture" || transaction.amountUnits >= 0) continue;
    const mode = modeForTransaction(transaction);
    if (!mode) {
      unknownCaptureUnits += Math.abs(transaction.amountUnits);
      continue;
    }
    const cost = settings.providerCosts[mode];
    if (cost == null || !Number.isFinite(cost)) {
      unknownCaptureUnits += Math.abs(transaction.amountUnits);
      continue;
    }
    const item = modeledMap.get(mode) ?? {
      mode,
      captures: 0,
      units: 0,
      costRub: 0
    };
    item.captures += 1;
    item.units += Math.abs(transaction.amountUnits);
    item.costRub += cost;
    modeledMap.set(mode, item);
  }

  const actualByProviderOperation = [...actualMap.values()]
    .map((item) => ({ ...item, costRub: roundMoney(item.costRub) }))
    .sort((a, b) => `${a.provider}:${a.operation}`.localeCompare(`${b.provider}:${b.operation}`));
  const modeledByMode = [...modeledMap.values()]
    .map((item) => ({ ...item, costRub: roundMoney(item.costRub) }))
    .sort((a, b) => a.mode.localeCompare(b.mode));

  return {
    actualUsageRub: roundMoney(
      actualByProviderOperation.reduce((sum, item) => sum + item.costRub, 0)
    ),
    modeledUsageRub: roundMoney(modeledByMode.reduce((sum, item) => sum + item.costRub, 0)),
    actualByProviderOperation,
    modeledByMode,
    unknownCaptureUnits
  };
}

function summarizeFailedEvents(paymentEvents: ReconciliationPaymentEvent[]) {
  const failed = paymentEvents.filter(
    (event) => event.processingStatus === "failed" || event.errorCode != null
  );
  const map = new Map<
    string,
    { provider: string; eventType: string; errorCode: string; count: number }
  >();

  for (const event of failed) {
    const errorCode = event.errorCode ?? "unknown";
    const key = `${event.provider}:${event.eventType}:${errorCode}`;
    const item = map.get(key) ?? {
      provider: event.provider,
      eventType: event.eventType,
      errorCode,
      count: 0
    };
    item.count += 1;
    map.set(key, item);
  }

  return {
    count: failed.length,
    byProviderEventError: [...map.values()].sort((a, b) =>
      `${a.provider}:${a.eventType}:${a.errorCode}`.localeCompare(
        `${b.provider}:${b.eventType}:${b.errorCode}`
      )
    ),
    samples: failed.slice(0, 5).map((event) =>
      redactForFinanceExport({
        id: event.id,
        provider: event.provider,
        eventType: event.eventType,
        providerObjectId: event.providerObjectId,
        processingStatus: event.processingStatus,
        errorCode: event.errorCode,
        receivedAt: event.receivedAt.toISOString(),
        payload: event.payload
      })
    ) as Array<Record<string, unknown>>
  };
}

function buildAnomalies(input: {
  byProviderCurrency: MoneySummary[];
  credits: ReturnType<typeof summarizeCredits>;
  failedEventsCount: number;
  liability: ReturnType<typeof summarizeLiability>;
  providerCosts: ReturnType<typeof summarizeProviderCosts>;
  thresholds: FinanceReconciliationReport["thresholds"];
}): FinanceAnomaly[] {
  const anomalies: FinanceAnomaly[] = [];
  const grossRubMinor = input.byProviderCurrency
    .filter((item) => item.currency === "RUB")
    .reduce((sum, item) => sum + item.grossMinor, 0);
  const netRevenueRub = grossRubMinor / 100;

  if (input.providerCosts.unknownCaptureUnits > 0) {
    anomalies.push({
      code: "unknown_capture_mapping",
      severity: "warning",
      message: "Some captured credit transactions cannot be mapped to an economics mode.",
      value: input.providerCosts.unknownCaptureUnits
    });
  }

  if (input.failedEventsCount > 0) {
    anomalies.push({
      code: "failed_payment_events",
      severity: "warning",
      message: "Failed payment events require triage before weekly close.",
      value: input.failedEventsCount
    });
  }

  if (input.liability.balanceUnits < 0 || input.liability.reservedUnits < 0) {
    anomalies.push({
      code: "negative_credit_liability",
      severity: "critical",
      message: "Credit account liability contains negative balances or reserves."
    });
  }

  for (const item of input.byProviderCurrency) {
    if (item.netMinor < 0) {
      anomalies.push({
        code: "negative_net_payments",
        severity: "critical",
        message: `Refunds exceed gross payments for ${item.provider}/${item.currency}.`,
        value: item.netMinor
      });
    }
  }

  if (netRevenueRub > 0) {
    const ratio = input.providerCosts.actualUsageRub / netRevenueRub;
    if (ratio > input.thresholds.maxProviderCostToNetRevenueRatio) {
      anomalies.push({
        code: "provider_cost_ratio_high",
        severity: "critical",
        message: "Actual provider cost estimates exceed the economics target multiple.",
        value: roundMoney(ratio),
        threshold: roundMoney(input.thresholds.maxProviderCostToNetRevenueRatio)
      });
    }
  }

  if (input.providerCosts.modeledUsageRub > 0) {
    const overrun =
      (input.providerCosts.actualUsageRub - input.providerCosts.modeledUsageRub) /
      input.providerCosts.modeledUsageRub;
    if (overrun > input.thresholds.providerCostOverrunRatio) {
      anomalies.push({
        code: "actual_cost_over_model",
        severity: "warning",
        message: "Actual usage cost estimates are above modeled economics costs.",
        value: roundMoney(overrun),
        threshold: roundMoney(input.thresholds.providerCostOverrunRatio)
      });
    }
  }

  if (input.credits.soldUnits < input.credits.refundedUnits) {
    anomalies.push({
      code: "refund_credits_exceed_sold",
      severity: "critical",
      message: "Refunded credits exceed purchased credits inside the reconciliation range.",
      value: input.credits.refundedUnits - input.credits.soldUnits
    });
  }

  return anomalies;
}

function countOrderStatuses(orders: ReconciliationPaymentOrder[]): StatusSummary[] {
  const map = new Map<string, { status: string; count: number; amountMinor: number }>();
  for (const order of orders) {
    const item = map.get(order.status) ?? { status: order.status, count: 0, amountMinor: 0 };
    item.count += 1;
    item.amountMinor += order.amountMinor;
    map.set(order.status, item);
  }
  return [...map.values()].sort((a, b) => a.status.localeCompare(b.status));
}

function modeForTransaction(transaction: ReconciliationCreditTransaction): PublicMode | undefined {
  if (transaction.analysisMode && publicModes.has(transaction.analysisMode as PublicMode)) {
    return transaction.analysisMode as PublicMode;
  }
  if (transaction.photoSearchJobId) return "photo_search";
  if (transaction.reportChatMessageId) return "chat_message";
  return undefined;
}

function emptyMoneySummary(provider: string, currency: string): MutableMoneySummary {
  return {
    provider,
    currency,
    grossMinor: 0,
    refundMinor: 0,
    netMinor: 0,
    paidOrders: 0,
    succeededRefunds: 0
  };
}

function sumMoneyByCurrency(
  items: MoneySummary[],
  key: "grossMinor" | "refundMinor" | "netMinor"
): Record<string, number> {
  return items.reduce<Record<string, number>>((accumulator, item) => {
    if (item[key] === 0) return accumulator;
    accumulator[item.currency] = (accumulator[item.currency] ?? 0) + item[key];
    return accumulator;
  }, {});
}

function moneyKey(provider: string, currency: string): string {
  return `${provider}:${currency}`;
}

function dateInRange(date: Date | null | undefined, range: FinanceDateRange): boolean {
  if (!date) return false;
  const time = date.getTime();
  return time >= range.from.getTime() && time < range.to.getTime();
}

function unitsToCredits(units: number): number {
  return units / CREDIT_UNIT;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function redactValue(value: unknown, key: string | undefined, depth: number): unknown {
  if (key && sensitiveKeyPattern.test(key.toLowerCase())) {
    return "[REDACTED]";
  }
  if (depth > 6) return "[REDACTED_DEPTH]";
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, undefined, depth + 1));

  const redacted: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    redacted[childKey] = redactValue(childValue, childKey, depth + 1);
  }
  return redacted;
}

function escapeCell(value: string | number, delimiter: "," | "\t"): string {
  const text = String(value);
  if (delimiter === "\t") return text.replace(/\t/g, " ").replace(/\r?\n/g, " ");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
