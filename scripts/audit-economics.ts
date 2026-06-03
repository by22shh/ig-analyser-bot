import { runEconomicsAudit } from "../src/modules/economics/audit.js";

const result = runEconomicsAudit();

console.log(`net RUB/credit floor: ${result.netRubPerCredit.toFixed(2)}`);
if (result.cardFloor != null) console.log(`  YooKassa floor: ${result.cardFloor.toFixed(2)}`);
if (result.starsFloor != null) console.log(`  Stars floor:    ${result.starsFloor.toFixed(2)}`);
console.log("");
console.log("mode                 cost RUB   charged units   required units   multiple");
for (const row of result.rows) {
  console.log(
    `${row.mode.padEnd(20)} ${row.providerCostRub.toFixed(2).padStart(8)}   ${String(row.chargedUnits).padStart(13)}   ${String(row.requiredUnits).padStart(14)}   ${row.multiple.toFixed(2)}x`
  );
}

if (result.problems.length > 0) {
  console.log("\nFAIL:");
  for (const problem of result.problems) {
    console.log(`- ${problem}`);
  }
  process.exit(1);
}

console.log("\nOK: economics guardrails pass.");
