import { Queue } from "bullmq";
import { env } from "../config/env.js";

export const redisConnection = redisOptions(env.REDIS_URL);

export type AnalysisJobPayload = {
  analysisJobId: string;
};

export type PhotoSearchJobPayload = {
  photoSearchJobId: string;
};

export const analysisQueue = new Queue<AnalysisJobPayload, unknown, string>("analysis", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 100
  }
});

export const photoSearchQueue = new Queue<PhotoSearchJobPayload, unknown, string>("photo-search", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 100
  }
});

function redisOptions(url: string) {
  const parsed = new URL(url);
  const isTls = parsed.protocol === "rediss:";
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: parsed.pathname && parsed.pathname !== "/" ? Number(parsed.pathname.slice(1) || 0) : 0,
    ...(isTls ? { tls: {} } : {}),
    maxRetriesPerRequest: null
  };
}
