import { existsSync, readFileSync } from "node:fs";

type AlertConfig = {
  version?: number;
  routes?: Record<string, AlertRoute>;
  alerts?: AlertRule[];
};

type AlertRoute = {
  owner?: string;
  primary?: string;
  backup?: string;
};

type AlertRule = {
  id?: string;
  name?: string;
  description?: string;
  severity?: string;
  owner?: string;
  route?: string;
  source?: {
    type?: string;
    query?: string;
  };
  threshold?: {
    operator?: string;
    value?: number;
    unit?: string;
    window?: string;
  };
  runbook?: string;
  smoke?: string;
};

const configPath = "config/alerts/production.json";
const requiredAlertIds = [
  "provider.openrouter.error_rate",
  "provider.apify.error_rate",
  "provider.facecheck.error_rate",
  "payment.failed_events",
  "payment.pending_orders_age",
  "queue.analysis_backlog",
  "queue.photo_search_backlog",
  "queue.stale_leases",
  "report.failure_rate",
  "retention.failures",
  "storage.s3_upload_failures",
  "pdf.render_failures",
  "analysis.repair_rate_high",
  "finance.cost_anomaly"
] as const;

const severities = new Set(["info", "warning", "critical"]);
const sourceTypes = new Set([
  "sentry",
  "otel",
  "logs",
  "sql",
  "usage_events",
  "finance_reconciliation"
]);
const operators = new Set([">", ">=", "<", "<=", "=", "!="]);
const secretLikePattern =
  /(xox[baprs]-|gh[pousr]_|sk-[a-z0-9]|AKIA[0-9A-Z]{16}|-----BEGIN|bot[0-9]+:[A-Za-z0-9_-]{20,})/i;

const failures: string[] = [];

if (!existsSync(configPath)) {
  failures.push(`${configPath}: file missing`);
} else {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as AlertConfig;
  validateConfig(config);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log(
  `Alert config validated: ${configPath}; required alerts=${requiredAlertIds.length}; routes=3`
);

function validateConfig(config: AlertConfig): void {
  if (config.version !== 1) failures.push("version must be 1");
  if (!config.routes || Object.keys(config.routes).length === 0) {
    failures.push("routes must be configured");
  }
  if (!Array.isArray(config.alerts) || config.alerts.length === 0) {
    failures.push("alerts must be a non-empty array");
    return;
  }

  const ids = new Set<string>();
  for (const [index, alert] of config.alerts.entries()) {
    validateAlert(alert, index, ids, config.routes ?? {});
  }

  for (const requiredId of requiredAlertIds) {
    if (!ids.has(requiredId)) failures.push(`missing required alert ${requiredId}`);
  }
}

function validateAlert(
  alert: AlertRule,
  index: number,
  ids: Set<string>,
  routes: Record<string, AlertRoute>
): void {
  const prefix = alert.id ?? `alerts[${index}]`;
  const requiredStrings: Array<
    keyof Pick<
      AlertRule,
      "id" | "name" | "description" | "severity" | "owner" | "route" | "runbook" | "smoke"
    >
  > = ["id", "name", "description", "severity", "owner", "route", "runbook", "smoke"];

  for (const key of requiredStrings) {
    if (!nonEmptyString(alert[key])) failures.push(`${prefix}: ${key} is required`);
  }

  if (alert.id) {
    if (ids.has(alert.id)) failures.push(`${prefix}: duplicate alert id`);
    ids.add(alert.id);
  }
  if (alert.severity && !severities.has(alert.severity)) {
    failures.push(`${prefix}: severity must be info, warning or critical`);
  }
  if (alert.route && !routes[alert.route]) {
    failures.push(`${prefix}: route ${alert.route} is not defined`);
  }
  if (!alert.source) {
    failures.push(`${prefix}: source is required`);
  } else {
    if (!alert.source.type || !sourceTypes.has(alert.source.type)) {
      failures.push(`${prefix}: source.type is invalid`);
    }
    if (!nonEmptyString(alert.source.query)) {
      failures.push(`${prefix}: source.query is required`);
    }
  }
  if (!alert.threshold) {
    failures.push(`${prefix}: threshold is required`);
  } else {
    if (!alert.threshold.operator || !operators.has(alert.threshold.operator)) {
      failures.push(`${prefix}: threshold.operator is invalid`);
    }
    if (typeof alert.threshold.value !== "number" || !Number.isFinite(alert.threshold.value)) {
      failures.push(`${prefix}: threshold.value must be a finite number`);
    }
    if (!nonEmptyString(alert.threshold.unit)) {
      failures.push(`${prefix}: threshold.unit is required`);
    }
    if (!nonEmptyString(alert.threshold.window)) {
      failures.push(`${prefix}: threshold.window is required`);
    }
  }
  validateRunbook(prefix, alert.runbook);
  validateNoSecrets(prefix, alert);
}

function validateRunbook(prefix: string, runbook: string | undefined): void {
  if (!runbook) return;
  const [filePath] = runbook.split("#");
  if (!filePath?.startsWith("docs/operations/")) {
    failures.push(`${prefix}: runbook must point to docs/operations`);
    return;
  }
  if (!existsSync(filePath)) failures.push(`${prefix}: runbook file missing (${filePath})`);
}

function validateNoSecrets(prefix: string, value: unknown): void {
  const serialized = JSON.stringify(value);
  if (secretLikePattern.test(serialized)) {
    failures.push(`${prefix}: contains a secret-shaped value`);
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
