import { PrismaClient } from "@prisma/client";
import { childLogger } from "../config/logger.js";

const log = childLogger("db");

export const prisma = new PrismaClient({
  log: [
    { emit: "event", level: "error" },
    { emit: "event", level: "warn" }
  ]
});

prisma.$on("error", (event) => log.error({ event }, "prisma_error"));
prisma.$on("warn", (event) => log.warn({ event }, "prisma_warn"));
