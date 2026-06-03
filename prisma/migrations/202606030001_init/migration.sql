-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "telegramUsername" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "role" TEXT NOT NULL DEFAULT 'user',
    "status" TEXT NOT NULL DEFAULT 'active',
    "timezone" TEXT,
    "consentVersion" TEXT,
    "consentAcceptedAt" TIMESTAMP(3),
    "email" TEXT,
    "referralCode" TEXT,
    "referredByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "userId" UUID NOT NULL,
    "defaultReportLanguage" TEXT NOT NULL DEFAULT 'ru',
    "defaultExportFormat" TEXT NOT NULL DEFAULT 'pdf',
    "protectContent" BOOLEAN NOT NULL DEFAULT false,
    "reportRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "notifyOnCompletion" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "credit_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "balanceUnits" INTEGER NOT NULL DEFAULT 0,
    "reservedUnits" INTEGER NOT NULL DEFAULT 0,
    "plan" TEXT,
    "planExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "analysisJobId" UUID,
    "type" TEXT NOT NULL,
    "amountUnits" INTEGER NOT NULL,
    "balanceAfterUnits" INTEGER NOT NULL,
    "provider" TEXT,
    "providerPaymentId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_packages" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "creditsUnits" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_package_prices" (
    "id" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "yookassaDescription" TEXT,
    "starsTitle" TEXT,
    "starsDescription" TEXT,
    "receiptSubject" TEXT,
    "receiptVatCode" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_package_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "packagePriceId" UUID,
    "status" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "creditsUnits" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "confirmationUrl" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "userEmail" TEXT,
    "telegramChatId" BIGINT,
    "telegramInvoiceMessageId" BIGINT,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerObjectId" TEXT NOT NULL,
    "paymentOrderId" UUID,
    "payload" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingStatus" TEXT NOT NULL DEFAULT 'received',
    "errorCode" TEXT,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yookassa_payments" (
    "id" UUID NOT NULL,
    "paymentOrderId" UUID NOT NULL,
    "yookassaPaymentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "incomeAmountMinor" INTEGER,
    "paymentMethodType" TEXT,
    "refundable" BOOLEAN NOT NULL DEFAULT false,
    "test" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAtProvider" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "yookassa_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_star_payments" (
    "id" UUID NOT NULL,
    "paymentOrderId" UUID NOT NULL,
    "telegramUserId" BIGINT NOT NULL,
    "telegramChatId" BIGINT NOT NULL,
    "invoicePayload" TEXT NOT NULL,
    "invoiceMessageId" BIGINT,
    "preCheckoutQueryId" TEXT,
    "telegramPaymentChargeId" TEXT,
    "providerPaymentChargeId" TEXT,
    "status" TEXT NOT NULL,
    "starsAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XTR',
    "successfulPayment" JSONB,
    "rawPreCheckoutQuery" JSONB,
    "rawSuccessfulPayment" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_star_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_refunds" (
    "id" UUID NOT NULL,
    "paymentOrderId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "status" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "adminUserId" UUID,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_receipts" (
    "id" UUID NOT NULL,
    "paymentOrderId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerReceiptId" TEXT,
    "customerEmail" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "taxSystemCode" INTEGER,
    "vatCode" INTEGER,
    "payload" JSONB,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_jobs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "inputType" TEXT NOT NULL,
    "targetUsername" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "targetPosition" TEXT,
    "goal" TEXT,
    "status" TEXT NOT NULL,
    "stage" TEXT,
    "progressCurrent" INTEGER NOT NULL DEFAULT 0,
    "progressTotal" INTEGER NOT NULL DEFAULT 0,
    "progressPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "telegramChatId" BIGINT NOT NULL,
    "telegramProgressMessageId" BIGINT,
    "costCreditUnits" INTEGER NOT NULL,
    "reservedTransactionId" UUID,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_profile_snapshots" (
    "id" UUID NOT NULL,
    "analysisJobId" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "fullName" TEXT,
    "biography" TEXT,
    "followersCount" INTEGER NOT NULL DEFAULT 0,
    "followsCount" INTEGER NOT NULL DEFAULT 0,
    "postsCount" INTEGER NOT NULL DEFAULT 0,
    "profilePicUrl" TEXT,
    "externalUrl" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "relatedProfiles" JSONB,
    "provider" TEXT NOT NULL,
    "providerDatasetId" TEXT,
    "rawDebug" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instagram_profile_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_post_snapshots" (
    "id" UUID NOT NULL,
    "profileSnapshotId" UUID NOT NULL,
    "postId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "caption" TEXT,
    "hashtags" TEXT[],
    "mentions" TEXT[],
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "latestComments" JSONB,
    "timestamp" TIMESTAMP(3),
    "displayUrl" TEXT,
    "url" TEXT,
    "videoViewCount" INTEGER,
    "videoDuration" DECIMAL(65,30),
    "location" JSONB,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "productType" TEXT,
    "musicInfo" JSONB,
    "childPosts" TEXT[],
    "taggedUsers" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "instagram_post_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_analysis_items" (
    "id" UUID NOT NULL,
    "analysisJobId" UUID NOT NULL,
    "postSnapshotId" UUID,
    "postId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vision_analysis_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "analysisJobId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "summary" JSONB,
    "metrics" JSONB,
    "sourceMap" JSONB,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_sections" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "kind" TEXT,
    "sources" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_artifacts" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "telegramFileId" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_search_jobs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "telegramFileId" TEXT NOT NULL,
    "telegramFileUniqueId" TEXT,
    "inputMimeType" TEXT,
    "inputSizeBytes" INTEGER,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "photo_search_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_search_matches" (
    "id" UUID NOT NULL,
    "photoSearchJobId" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "profileUrl" TEXT NOT NULL,
    "confidence" DECIMAL(65,30) NOT NULL,
    "source" TEXT,
    "sourceUrl" TEXT,
    "rawScore" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_search_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_chat_sessions" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_chat_messages" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_usage_events" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "analysisJobId" UUID,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "costEstimateRub" DECIMAL(65,30),
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "targetUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID,
    "metadata" JSONB,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_updates" (
    "updateId" BIGINT NOT NULL,
    "userId" UUID,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_updates_pkey" PRIMARY KEY ("updateId")
);

-- CreateTable
CREATE TABLE "telegram_wizard_states" (
    "userId" UUID NOT NULL,
    "state" TEXT NOT NULL,
    "payload" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_wizard_states_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegramId_key" ON "users"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");

-- CreateIndex
CREATE INDEX "users_status_createdAt_idx" ON "users"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "credit_accounts_userId_key" ON "credit_accounts"("userId");

-- CreateIndex
CREATE INDEX "credit_transactions_userId_createdAt_idx" ON "credit_transactions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "credit_transactions_analysisJobId_idx" ON "credit_transactions"("analysisJobId");

-- CreateIndex
CREATE INDEX "credit_transactions_provider_providerPaymentId_idx" ON "credit_transactions"("provider", "providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_packages_code_key" ON "credit_packages"("code");

-- CreateIndex
CREATE INDEX "credit_package_prices_provider_currency_isActive_isPublic_idx" ON "credit_package_prices"("provider", "currency", "isActive", "isPublic");

-- CreateIndex
CREATE UNIQUE INDEX "credit_package_prices_packageId_provider_currency_key" ON "credit_package_prices"("packageId", "provider", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_providerPaymentId_key" ON "payment_orders"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_idempotencyKey_key" ON "payment_orders"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payment_orders_userId_createdAt_idx" ON "payment_orders"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "payment_orders_status_createdAt_idx" ON "payment_orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "payment_events_processingStatus_receivedAt_idx" ON "payment_events"("processingStatus", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_eventType_providerObjectId_key" ON "payment_events"("provider", "eventType", "providerObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "yookassa_payments_paymentOrderId_key" ON "yookassa_payments"("paymentOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "yookassa_payments_yookassaPaymentId_key" ON "yookassa_payments"("yookassaPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_star_payments_paymentOrderId_key" ON "telegram_star_payments"("paymentOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_star_payments_invoicePayload_key" ON "telegram_star_payments"("invoicePayload");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_star_payments_preCheckoutQueryId_key" ON "telegram_star_payments"("preCheckoutQueryId");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_star_payments_telegramPaymentChargeId_key" ON "telegram_star_payments"("telegramPaymentChargeId");

-- CreateIndex
CREATE INDEX "telegram_star_payments_telegramUserId_createdAt_idx" ON "telegram_star_payments"("telegramUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_refunds_providerRefundId_key" ON "payment_refunds"("providerRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_refunds_idempotencyKey_key" ON "payment_refunds"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payment_refunds_provider_status_createdAt_idx" ON "payment_refunds"("provider", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_jobs_idempotencyKey_key" ON "analysis_jobs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "analysis_jobs_userId_createdAt_idx" ON "analysis_jobs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "analysis_jobs_status_createdAt_idx" ON "analysis_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "analysis_jobs_targetUsername_idx" ON "analysis_jobs"("targetUsername");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_profile_snapshots_analysisJobId_key" ON "instagram_profile_snapshots"("analysisJobId");

-- CreateIndex
CREATE INDEX "instagram_profile_snapshots_username_idx" ON "instagram_profile_snapshots"("username");

-- CreateIndex
CREATE INDEX "instagram_post_snapshots_profileSnapshotId_sortOrder_idx" ON "instagram_post_snapshots"("profileSnapshotId", "sortOrder");

-- CreateIndex
CREATE INDEX "instagram_post_snapshots_postId_idx" ON "instagram_post_snapshots"("postId");

-- CreateIndex
CREATE INDEX "instagram_post_snapshots_timestamp_idx" ON "instagram_post_snapshots"("timestamp");

-- CreateIndex
CREATE INDEX "vision_analysis_items_analysisJobId_postId_idx" ON "vision_analysis_items"("analysisJobId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "reports_analysisJobId_key" ON "reports"("analysisJobId");

-- CreateIndex
CREATE INDEX "reports_userId_createdAt_idx" ON "reports"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "reports_expiresAt_idx" ON "reports"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "report_sections_reportId_position_key" ON "report_sections"("reportId", "position");

-- CreateIndex
CREATE INDEX "report_artifacts_reportId_type_idx" ON "report_artifacts"("reportId", "type");

-- CreateIndex
CREATE INDEX "report_artifacts_expiresAt_idx" ON "report_artifacts"("expiresAt");

-- CreateIndex
CREATE INDEX "photo_search_jobs_userId_createdAt_idx" ON "photo_search_jobs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "photo_search_jobs_status_createdAt_idx" ON "photo_search_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "photo_search_matches_photoSearchJobId_idx" ON "photo_search_matches"("photoSearchJobId");

-- CreateIndex
CREATE INDEX "report_chat_sessions_userId_updatedAt_idx" ON "report_chat_sessions"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "report_chat_messages_sessionId_createdAt_idx" ON "report_chat_messages"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "api_usage_events_userId_createdAt_idx" ON "api_usage_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "api_usage_events_analysisJobId_provider_operation_idx" ON "api_usage_events"("analysisJobId", "provider", "operation");

-- CreateIndex
CREATE INDEX "api_usage_events_provider_operation_createdAt_idx" ON "api_usage_events"("provider", "operation", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_targetUserId_createdAt_idx" ON "audit_logs"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_analysisJobId_fkey" FOREIGN KEY ("analysisJobId") REFERENCES "analysis_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_package_prices" ADD CONSTRAINT "credit_package_prices_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "credit_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "credit_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_packagePriceId_fkey" FOREIGN KEY ("packagePriceId") REFERENCES "credit_package_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yookassa_payments" ADD CONSTRAINT "yookassa_payments_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "payment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_star_payments" ADD CONSTRAINT "telegram_star_payments_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "payment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "payment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "payment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_profile_snapshots" ADD CONSTRAINT "instagram_profile_snapshots_analysisJobId_fkey" FOREIGN KEY ("analysisJobId") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_post_snapshots" ADD CONSTRAINT "instagram_post_snapshots_profileSnapshotId_fkey" FOREIGN KEY ("profileSnapshotId") REFERENCES "instagram_profile_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_analysis_items" ADD CONSTRAINT "vision_analysis_items_analysisJobId_fkey" FOREIGN KEY ("analysisJobId") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_analysis_items" ADD CONSTRAINT "vision_analysis_items_postSnapshotId_fkey" FOREIGN KEY ("postSnapshotId") REFERENCES "instagram_post_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_analysisJobId_fkey" FOREIGN KEY ("analysisJobId") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_artifacts" ADD CONSTRAINT "report_artifacts_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_search_jobs" ADD CONSTRAINT "photo_search_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_search_matches" ADD CONSTRAINT "photo_search_matches_photoSearchJobId_fkey" FOREIGN KEY ("photoSearchJobId") REFERENCES "photo_search_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_chat_sessions" ADD CONSTRAINT "report_chat_sessions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_chat_sessions" ADD CONSTRAINT "report_chat_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_chat_messages" ADD CONSTRAINT "report_chat_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "report_chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_usage_events" ADD CONSTRAINT "api_usage_events_analysisJobId_fkey" FOREIGN KEY ("analysisJobId") REFERENCES "analysis_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_updates" ADD CONSTRAINT "telegram_updates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_wizard_states" ADD CONSTRAINT "telegram_wizard_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
