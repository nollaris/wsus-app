import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canTriggerSync } from "@/lib/rbac";
import { recordUserAction } from "@/lib/user-action-log";
import {
  cancelBackgroundSync,
  isValidSyncScope,
  startBackgroundSync,
  type SyncLimits,
  type SyncScope,
} from "@/lib/wsus-api-sync";

function parseOptionalNumber(val: unknown): number | undefined {
  return typeof val === "number" && Number.isFinite(val) ? val : undefined;
}

function parseSyncLimits(raw: unknown): SyncLimits | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  return {
    maxComputers: parseOptionalNumber(obj.maxComputers),
    maxUpdates: parseOptionalNumber(obj.maxUpdates),
    maxClientDetailComputers: parseOptionalNumber(obj.maxClientDetailComputers),
    pageSize: parseOptionalNumber(obj.pageSize),
    concurrency: parseOptionalNumber(obj.concurrency),
    requestTimeoutMs: parseOptionalNumber(obj.requestTimeoutMs),
    approvedUpdatesOnly:
      typeof obj.approvedUpdatesOnly === "boolean"
        ? obj.approvedUpdatesOnly
        : undefined,
    skipInstalledClientPatches:
      typeof obj.skipInstalledClientPatches === "boolean"
        ? obj.skipInstalledClientPatches
        : undefined,
  };
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canTriggerSync(session.role)) {
    return NextResponse.json(
      { error: "Forbidden: Operator or Admin access required." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const requestedServerId =
    typeof body?.serverId === "number" ? body.serverId : null;

  if (body?.action === "cancel") {
    if (requestedServerId !== null) {
      const result = await cancelBackgroundSync([requestedServerId]);
      if (result.cancelledIds.length > 0) {
        const servers = await prisma.wsusServer.findMany({
          where: { id: { in: result.cancelledIds } },
          select: { name: true },
        });
        await recordUserAction({
          username: session.username,
          action: "Cancelled portal synchronization",
          target: servers.map((server) => server.name).join(", "),
          details: "Cancelled a running synchronization from the portal.",
        });
      }
      return NextResponse.json({ success: true, ...result });
    }
    const result = await cancelBackgroundSync();
    if (result.cancelledIds.length > 0) {
      const servers = await prisma.wsusServer.findMany({
        where: { id: { in: result.cancelledIds } },
        select: { name: true },
      });
      await recordUserAction({
        username: session.username,
        action: "Cancelled portal synchronization",
        target: servers.map((server) => server.name).join(", "),
        details: "Cancelled running synchronizations from the portal.",
      });
    }
    return NextResponse.json({ success: true, ...result });
  }
  const rawScope = body?.scope;
  if (rawScope !== undefined && !isValidSyncScope(rawScope)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid sync scope. Must be all, computers, updates, sync, or client-patches.",
      },
      { status: 400 }
    );
  }
  const scope: SyncScope = isValidSyncScope(rawScope) ? rawScope : "all";
  const limits = parseSyncLimits(body?.limits);

  if (requestedServerId !== null) {
    const server = await prisma.wsusServer.findUnique({
      where: { id: requestedServerId },
      select: { id: true, name: true },
    });
    if (!server) {
      return NextResponse.json(
        { success: false, error: "WSUS server not found." },
        { status: 404 }
      );
    }

    const result = await startBackgroundSync([server.id], scope, limits);
    if (result.startedIds.length > 0) {
      await recordUserAction({
        username: session.username,
        action: "Requested portal data import",
        target: server.name,
        details: `Requested portal import for scope: ${scope}.`,
      });
    }
    return NextResponse.json(
      { success: true, scope, ...result },
      { status: 202 }
    );
  }

  const enabledServers = await prisma.wsusServer.findMany({
    where: { enabled: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (enabledServers.length === 0) {
    return NextResponse.json(
      { success: false, error: "No enabled WSUS servers configured." },
      { status: 400 }
    );
  }

  const result = await startBackgroundSync(
    enabledServers.map((s) => s.id),
    scope,
    limits
  );
  const startedServers = enabledServers.filter((server) =>
    result.startedIds.includes(server.id)
  );
  if (startedServers.length > 0) {
    await recordUserAction({
      username: session.username,
      action: "Requested portal data import",
      target: startedServers.map((server) => server.name).join(", "),
      details: `Requested portal import for scope: ${scope}.`,
    });
  }
  return NextResponse.json(
    { success: true, scope, ...result },
    { status: 202 }
  );
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canTriggerSync(session.role)) {
    return NextResponse.json(
      { error: "Forbidden: Operator or Admin access required." },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const queryIdRaw = url.searchParams.get("serverId");
  const body = await request.json().catch(() => ({}));
  const rawServerId =
    typeof body?.serverId === "number"
      ? body.serverId
      : queryIdRaw
        ? Number(queryIdRaw)
        : null;

  if (rawServerId !== null) {
    if (!Number.isInteger(rawServerId) || rawServerId <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid serverId." },
        { status: 400 }
      );
    }
    const result = await cancelBackgroundSync([rawServerId]);
    if (result.cancelledIds.length > 0) {
      const servers = await prisma.wsusServer.findMany({
        where: { id: { in: result.cancelledIds } },
        select: { name: true },
      });
      await recordUserAction({
        username: session.username,
        action: "Cancelled portal synchronization",
        target: servers.map((server) => server.name).join(", "),
        details: "Cancelled a running synchronization from the portal.",
      });
    }
    return NextResponse.json({ success: true, ...result });
  }

  const result = await cancelBackgroundSync();
  if (result.cancelledIds.length > 0) {
    const servers = await prisma.wsusServer.findMany({
      where: { id: { in: result.cancelledIds } },
      select: { name: true },
    });
    await recordUserAction({
      username: session.username,
      action: "Cancelled portal synchronization",
      target: servers.map((server) => server.name).join(", "),
      details: "Cancelled running synchronizations from the portal.",
    });
  }
  return NextResponse.json({ success: true, ...result });
}
