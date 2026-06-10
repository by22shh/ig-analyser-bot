import type { FastifyInstance } from "fastify";
import * as Sentry from "@sentry/node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { env } from "./env.js";
import { childLogger } from "./logger.js";

const log = childLogger("observability");

const sentryEnabled = Boolean(env.SENTRY_DSN.trim());
let otelSdk: NodeSDK | undefined;

if (sentryEnabled) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.APP_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE ?? 0
  });
  log.info("sentry_initialized");
}

if (env.OTEL_EXPORTER_OTLP_ENDPOINT.trim()) {
  otelSdk = new NodeSDK({
    serviceName: "ig-analyser-telegram-bot",
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [getNodeAutoInstrumentations()]
  });
  otelSdk.start();
  log.info("otel_initialized");
}

export function setupFastifyObservability(app: FastifyInstance): void {
  if (sentryEnabled) Sentry.setupFastifyErrorHandler(app);
}

export function captureException(error: unknown, extra?: Record<string, unknown>): void {
  if (!sentryEnabled) return;
  Sentry.withScope((scope) => {
    if (extra) scope.setExtras(extra);
    Sentry.captureException(error);
  });
}

export async function shutdownObservability(): Promise<void> {
  const tasks: Array<Promise<unknown>> = [];
  if (otelSdk) tasks.push(otelSdk.shutdown());
  if (sentryEnabled) tasks.push(Sentry.close(2000));
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") {
      log.warn({ error: result.reason }, "observability_shutdown_failed");
    }
  }
}
