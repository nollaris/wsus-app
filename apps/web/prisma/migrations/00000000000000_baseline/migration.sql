-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."Classification" (
    "serverName" TEXT NOT NULL DEFAULT '',
    "classificationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "arrivalDate" TIMESTAMP(3),
    "releaseNotes" TEXT,

    CONSTRAINT "Classification_pkey" PRIMARY KEY ("serverName","classificationId")
);

-- CreateTable
CREATE TABLE "public"."ClientPatchStatus" (
    "id" SERIAL NOT NULL,
    "serverName" TEXT NOT NULL DEFAULT '',
    "computerName" TEXT NOT NULL,
    "computerTargetId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "updateTitle" TEXT NOT NULL,
    "kbArticle" TEXT,
    "classification" TEXT NOT NULL,
    "installationState" TEXT NOT NULL,
    "approvalAction" TEXT NOT NULL,
    "approvalTargetGroupId" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "ClientPatchStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClientStatus" (
    "serverName" TEXT NOT NULL DEFAULT '',
    "computerTargetId" TEXT NOT NULL,
    "computerName" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "osDescription" TEXT NOT NULL,
    "osVersion" TEXT,
    "clientVersion" TEXT NOT NULL,
    "computerRole" TEXT NOT NULL,
    "requestedTargetGroup" TEXT,
    "assignedTargetGroups" TEXT NOT NULL,
    "lastSyncTime" TIMESTAMP(3),
    "lastReportedStatusTime" TIMESTAMP(3),

    CONSTRAINT "ClientStatus_pkey" PRIMARY KEY ("serverName","computerTargetId")
);

-- CreateTable
CREATE TABLE "public"."PatchInventory" (
    "serverName" TEXT NOT NULL DEFAULT '',
    "updateId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "kbArticle" TEXT,
    "products" TEXT,
    "classification" TEXT NOT NULL,
    "arrivalDate" TIMESTAMP(3),
    "creationDate" TIMESTAMP(3),
    "msrcSeverity" TEXT NOT NULL,
    "isApproved" BOOLEAN NOT NULL,
    "isDeclined" BOOLEAN NOT NULL,
    "isSuperseded" BOOLEAN NOT NULL,
    "isLatestRevision" BOOLEAN NOT NULL,
    "updateType" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "PatchInventory_pkey" PRIMARY KEY ("serverName","updateId","revisionNumber")
);

-- CreateTable
CREATE TABLE "public"."Product" (
    "serverName" TEXT NOT NULL DEFAULT '',
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "arrivalDate" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("serverName","categoryId")
);

-- CreateTable
CREATE TABLE "public"."SynchronizationHistory" (
    "serverName" TEXT NOT NULL DEFAULT '',
    "synchronizationId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "result" TEXT NOT NULL,
    "startedManually" BOOLEAN NOT NULL,
    "updateErrors" TEXT,
    "error" TEXT,
    "errorText" TEXT,

    CONSTRAINT "SynchronizationHistory_pkey" PRIMARY KEY ("serverName","synchronizationId")
);

-- CreateTable
CREATE TABLE "public"."SynchronizationSetting" (
    "serverName" TEXT NOT NULL,
    "synchronizeAutomatically" BOOLEAN NOT NULL,
    "synchronizationTimeUtc" TEXT NOT NULL,
    "synchronizationTimeLocal" TEXT NOT NULL,
    "syncPerDay" INTEGER NOT NULL,
    "intervalHours" INTEGER NOT NULL,
    "lastModifiedBy" TEXT NOT NULL,
    "lastModifiedTime" TIMESTAMP(3),

    CONSTRAINT "SynchronizationSetting_pkey" PRIMARY KEY ("serverName")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WsusServer" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WsusServer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Classification_serverName_idx" ON "public"."Classification"("serverName" ASC);

-- CreateIndex
CREATE INDEX "ClientPatchStatus_classification_idx" ON "public"."ClientPatchStatus"("classification" ASC);

-- CreateIndex
CREATE INDEX "ClientPatchStatus_computerTargetId_idx" ON "public"."ClientPatchStatus"("computerTargetId" ASC);

-- CreateIndex
CREATE INDEX "ClientPatchStatus_installationState_idx" ON "public"."ClientPatchStatus"("installationState" ASC);

-- CreateIndex
CREATE INDEX "ClientPatchStatus_kbArticle_idx" ON "public"."ClientPatchStatus"("kbArticle" ASC);

-- CreateIndex
CREATE INDEX "ClientPatchStatus_serverName_idx" ON "public"."ClientPatchStatus"("serverName" ASC);

-- CreateIndex
CREATE INDEX "ClientPatchStatus_updateId_idx" ON "public"."ClientPatchStatus"("updateId" ASC);

-- CreateIndex
CREATE INDEX "ClientStatus_computerName_idx" ON "public"."ClientStatus"("computerName" ASC);

-- CreateIndex
CREATE INDEX "ClientStatus_computerTargetId_idx" ON "public"."ClientStatus"("computerTargetId" ASC);

-- CreateIndex
CREATE INDEX "ClientStatus_serverName_idx" ON "public"."ClientStatus"("serverName" ASC);

-- CreateIndex
CREATE INDEX "PatchInventory_classification_idx" ON "public"."PatchInventory"("classification" ASC);

-- CreateIndex
CREATE INDEX "PatchInventory_isApproved_isDeclined_idx" ON "public"."PatchInventory"("isApproved" ASC, "isDeclined" ASC);

-- CreateIndex
CREATE INDEX "PatchInventory_kbArticle_idx" ON "public"."PatchInventory"("kbArticle" ASC);

-- CreateIndex
CREATE INDEX "PatchInventory_msrcSeverity_idx" ON "public"."PatchInventory"("msrcSeverity" ASC);

-- CreateIndex
CREATE INDEX "PatchInventory_serverName_idx" ON "public"."PatchInventory"("serverName" ASC);

-- CreateIndex
CREATE INDEX "PatchInventory_updateId_idx" ON "public"."PatchInventory"("updateId" ASC);

-- CreateIndex
CREATE INDEX "Product_serverName_idx" ON "public"."Product"("serverName" ASC);

-- CreateIndex
CREATE INDEX "SynchronizationHistory_serverName_idx" ON "public"."SynchronizationHistory"("serverName" ASC);

-- CreateIndex
CREATE INDEX "SynchronizationHistory_startTime_idx" ON "public"."SynchronizationHistory"("startTime" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WsusServer_baseUrl_key" ON "public"."WsusServer"("baseUrl" ASC);
