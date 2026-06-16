import { createServices } from "../../src/modules/container.js";

const help = `Usage: pnpm payments:reconcile-yookassa -- [options]

Polls YooKassa for aged pending payment orders and reconciles paid/canceled state.

Options:
  --limit N                 Max pending orders to check. Default: 50, max: 200.
  --older-than-minutes N    Only check orders at least N minutes old. Default: 10.
  --help                   Show this help.
`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    console.log(help);
    return;
  }

  const services = createServices();
  try {
    const result = await services.payments.reconcilePendingYooKassaPayments(options);
    console.log(JSON.stringify(result, null, 2));
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await services.prisma.$disconnect();
  }
}

function parseArgs(args: string[]): { limit: number; olderThanMinutes: number } | undefined {
  let limit = 50;
  let olderThanMinutes = 10;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") return undefined;
    if (arg === "--limit") {
      limit = positiveInteger(args[++index], "--limit");
      continue;
    }
    if (arg === "--older-than-minutes") {
      olderThanMinutes = positiveInteger(args[++index], "--older-than-minutes");
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { limit: Math.min(limit, 200), olderThanMinutes };
}

function positiveInteger(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
