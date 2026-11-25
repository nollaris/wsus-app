CREATE TABLE "WsusApprovalSchedule" (
    "id" SERIAL NOT NULL,
    "serverId" INTEGER NOT NULL,
    "updateId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "updateTitle" TEXT NOT NULL,
    "targetGroupId" TEXT NOT NULL,
    "targetGroupName" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "WsusApprovalSchedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WsusApprovalSchedule_serverId_status_scheduledAt_idx"
    ON "WsusApprovalSchedule"("serverId", "status", "scheduledAt");

CREATE INDEX "WsusApprovalSchedule_status_scheduledAt_idx"
    ON "WsusApprovalSchedule"("status", "scheduledAt");

ALTER TABLE "WsusApprovalSchedule"
    ADD CONSTRAINT "WsusApprovalSchedule_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "WsusServer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
