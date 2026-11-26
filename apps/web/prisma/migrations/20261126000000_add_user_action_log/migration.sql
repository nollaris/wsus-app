CREATE TABLE "UserActionLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "username" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "details" TEXT NOT NULL,

    CONSTRAINT "UserActionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserActionLog_createdAt_idx" ON "UserActionLog"("createdAt");
CREATE INDEX "UserActionLog_username_createdAt_idx" ON "UserActionLog"("username", "createdAt");
