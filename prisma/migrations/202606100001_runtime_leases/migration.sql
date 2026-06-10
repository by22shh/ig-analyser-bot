CREATE TABLE "runtime_leases" (
  "name" TEXT NOT NULL,
  "holder_id" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "runtime_leases_pkey" PRIMARY KEY ("name")
);

CREATE INDEX "runtime_leases_expires_at_idx" ON "runtime_leases" ("expires_at");
