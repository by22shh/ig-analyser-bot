import { writeFile } from "node:fs/promises";
import { prisma } from "../../src/db/client.js";
import { economicsSettingsFromEnv } from "../../src/modules/economics/model.js";
import {
  buildFinanceReconciliationReport,
  financeReconciliationRows,
  formatDelimitedRows,
  type FinanceDateRange,
  type FinanceReconciliationInput
} from "../../src/modules/finance/reconciliation.js";

type CliOptions = {
  range: FinanceDateRange;
  format: "json" | "csv" | "tsv";
  output?: string;
};

const help = `Usage: pnpm exec tsx scripts/finance/export-reconciliation.ts [options]

Exports a finance reconciliation report without raw payment/user payloads.

Options:
  --from YYYY-MM-DD          Inclusive start date. Defaults to 7 days before --to.
  --to YYYY-MM-DD            Exclusive end date. Defaults to now.
  --format json|csv|tsv      Output format. Defaults to json.
  --json                     Shortcut for --format json.
  --csv                      Shortcut for --format csv.
  --tsv                      Shortcut for --format tsv.
  --output PATH              Write to file instead of stdout.
  --help                     Show this help.

Included sections:
  payments, refunds, credits sold/consumed, outstanding credit liability,
  failed payment events, provider usage costs and economics-mode cost estimates.
`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    console.log(help);
    return;
  }

  const input = await loadReconciliationInput(options.range);
  const report = buildFinanceReconciliationReport(input, {
    range: options.range,
    settings: economicsSettingsFromEnv()
  });
  const output =
    options.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : formatDelimitedRows(
          financeReconciliationRows(report),
          options.format === "csv" ? "," : "\t"
        );

  if (options.output) {
    await writeFile(options.output, output, "utf8");
  } else {
    console.log(output.trimEnd());
  }
}

function parseArgs(args: string[]): CliOptions | undefined {
  let from: Date | undefined;
  let to: Date | undefined;
  let format: CliOptions["format"] = "json";
  let output: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") return undefined;
    if (arg === "--json") {
      format = "json";
      continue;
    }
    if (arg === "--csv") {
      format = "csv";
      continue;
    }
    if (arg === "--tsv") {
      format = "tsv";
      continue;
    }
    if (arg === "--from") {
      from = parseDateArg(args[++index], "--from");
      continue;
    }
    if (arg === "--to") {
      to = parseDateArg(args[++index], "--to");
      continue;
    }
    if (arg === "--format") {
      const value = args[++index];
      if (value !== "json" && value !== "csv" && value !== "tsv") {
        throw new Error("--format must be one of json, csv, tsv");
      }
      format = value;
      continue;
    }
    if (arg === "--output") {
      output = args[++index];
      if (!output) throw new Error("--output requires a path");
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  to ??= new Date();
  from ??= new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (from.getTime() >= to.getTime()) throw new Error("--from must be earlier than --to");

  return {
    range: { from, to },
    format,
    output
  };
}

function parseDateArg(value: string | undefined, name: string): Date {
  if (!value) throw new Error(`${name} requires a value`);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${name} is not a valid date`);
  return date;
}

async function loadReconciliationInput(
  range: FinanceDateRange
): Promise<FinanceReconciliationInput> {
  const dateRange = { gte: range.from, lt: range.to };
  const [paymentOrders, refunds, creditTransactions, creditAccounts, paymentEvents, usageEvents] =
    await Promise.all([
      prisma.paymentOrder.findMany({
        where: {
          OR: [{ createdAt: dateRange }, { paidAt: dateRange }]
        },
        select: {
          id: true,
          userId: true,
          provider: true,
          status: true,
          amountMinor: true,
          currency: true,
          creditsUnits: true,
          paidAt: true,
          createdAt: true,
          providerPaymentId: true,
          package: { select: { code: true } }
        }
      }),
      prisma.paymentRefund.findMany({
        where: { createdAt: dateRange },
        select: {
          id: true,
          paymentOrderId: true,
          provider: true,
          providerRefundId: true,
          status: true,
          amountMinor: true,
          currency: true,
          createdAt: true
        }
      }),
      prisma.creditTransaction.findMany({
        where: { createdAt: dateRange },
        select: {
          id: true,
          type: true,
          amountUnits: true,
          provider: true,
          providerPaymentId: true,
          analysisJobId: true,
          photoSearchJobId: true,
          reportChatMessageId: true,
          createdAt: true,
          analysisJob: { select: { mode: true } }
        }
      }),
      prisma.creditAccount.findMany({
        select: {
          balanceUnits: true,
          reservedUnits: true,
          plan: true
        }
      }),
      prisma.paymentEvent.findMany({
        where: { receivedAt: dateRange },
        select: {
          id: true,
          provider: true,
          eventType: true,
          providerObjectId: true,
          processingStatus: true,
          errorCode: true,
          receivedAt: true,
          processedAt: true
        }
      }),
      prisma.apiUsageEvent.findMany({
        where: { createdAt: dateRange },
        select: {
          id: true,
          provider: true,
          operation: true,
          status: true,
          costEstimateRub: true,
          createdAt: true
        }
      })
    ]);

  return {
    paymentOrders: paymentOrders.map((order) => ({
      id: order.id,
      userId: order.userId,
      provider: order.provider,
      status: order.status,
      amountMinor: order.amountMinor,
      currency: order.currency,
      creditsUnits: order.creditsUnits,
      paidAt: order.paidAt,
      createdAt: order.createdAt,
      providerPaymentId: order.providerPaymentId,
      packageCode: order.package.code
    })),
    refunds,
    creditTransactions: creditTransactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amountUnits: transaction.amountUnits,
      provider: transaction.provider,
      providerPaymentId: transaction.providerPaymentId,
      analysisJobId: transaction.analysisJobId,
      photoSearchJobId: transaction.photoSearchJobId,
      reportChatMessageId: transaction.reportChatMessageId,
      analysisMode: transaction.analysisJob?.mode ?? null,
      createdAt: transaction.createdAt
    })),
    creditAccounts,
    paymentEvents,
    usageEvents: usageEvents.map((event) => ({
      id: event.id,
      provider: event.provider,
      operation: event.operation,
      status: event.status,
      costEstimateRub: decimalToNumber(event.costEstimateRub),
      createdAt: event.createdAt
    }))
  };
}

function decimalToNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
