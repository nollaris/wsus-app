import { prisma } from "@/lib/prisma";
import { callWsusApi } from "@/lib/wsus-control-api";

const POLL_INTERVAL_MS = 15_000;
const STALE_PROCESSING_MS = 5 * 60_000;
const MAX_ERROR_LENGTH = 1000;

const globalForScheduler = globalThis as typeof globalThis & {
  wsusApprovalSchedulerTimer?: NodeJS.Timeout;
  wsusApprovalSchedulerRunning?: boolean;
};

async function processDueApprovals() {
  if (globalForScheduler.wsusApprovalSchedulerRunning) return;
  globalForScheduler.wsusApprovalSchedulerRunning = true;

  try {
    const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
    await prisma.wsusApprovalSchedule.updateMany({
      where: { status: "processing", updatedAt: { lt: staleBefore } },
      data: {
        status: "pending",
        error: "Recovered an interrupted approval attempt.",
      },
    });

    const dueSchedules = await prisma.wsusApprovalSchedule.findMany({
      where: { status: "pending", scheduledAt: { lte: new Date() } },
      orderBy: { scheduledAt: "asc" },
      take: 10,
    });

    for (const schedule of dueSchedules) {
      const claimed = await prisma.wsusApprovalSchedule.updateMany({
        where: { id: schedule.id, status: "pending" },
        data: { status: "processing", error: null },
      });
      if (claimed.count !== 1) continue;

      try {
        const server = await prisma.wsusServer.findUnique({
          where: { id: schedule.serverId },
          select: { baseUrl: true, apiKey: true, enabled: true },
        });
        if (!server) throw new Error("WSUS server not found.");
        if (!server.enabled) throw new Error("WSUS server is disabled.");

        await callWsusApi(server, `/updates/${encodeURIComponent(schedule.updateId)}/approvals`, {
          method: "POST",
          body: {
            revisionNumber: schedule.revisionNumber,
            targetGroupId: schedule.targetGroupId,
          },
        });

        await prisma.wsusApprovalSchedule.update({
          where: { id: schedule.id },
          data: { status: "completed", executedAt: new Date(), error: null },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Approval execution failed.";
        await prisma.wsusApprovalSchedule.update({
          where: { id: schedule.id },
          data: {
            status: "failed",
            executedAt: new Date(),
            error: message.slice(0, MAX_ERROR_LENGTH),
          },
        });
        console.error(`Scheduled WSUS approval ${schedule.id} failed:`, error);
      }
    }
  } catch (error) {
    console.error("WSUS approval scheduler cycle failed:", error);
  } finally {
    globalForScheduler.wsusApprovalSchedulerRunning = false;
  }
}

export function startWsusApprovalScheduler() {
  if (globalForScheduler.wsusApprovalSchedulerTimer) return;
  globalForScheduler.wsusApprovalSchedulerTimer = setInterval(() => {
    void processDueApprovals();
  }, POLL_INTERVAL_MS);
  globalForScheduler.wsusApprovalSchedulerTimer.unref();
  void processDueApprovals();
}
