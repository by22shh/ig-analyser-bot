import { Queue } from "bullmq";
import { env } from "../config/env.js";

export type AnalysisJobPayload = {
  analysisJobId: string;
};

export type PhotoSearchJobPayload = {
  photoSearchJobId: string;
};

let redisConnection: ReturnType<typeof redisOptions> | undefined;
let analysisQueue: Queue<AnalysisJobPayload, unknown, string> | undefined;
let photoSearchQueue: Queue<PhotoSearchJobPayload, unknown, string> | undefined;

export function getRedisConnection() {
  redisConnection ??= redisOptions(env.REDIS_URL);
  return redisConnection;
}

export function getAnalysisQueue() {
  analysisQueue ??= new Queue<AnalysisJobPayload, unknown, string>("analysis", {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 100,
      removeOnFail: 100
    }
  });
  return analysisQueue;
}

export function getPhotoSearchQueue() {
  photoSearchQueue ??= new Queue<PhotoSearchJobPayload, unknown, string>("photo-search", {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 100,
      removeOnFail: 100
    }
  });
  return photoSearchQueue;
}

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
