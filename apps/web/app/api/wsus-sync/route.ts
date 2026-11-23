import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canTriggerSync } from "@/lib/rbac";
import {
  isValidSyncScope,
  startBackgroundSync,
  type SyncScope,
} from "@/lib/wsus-api-sync";

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

  if (requestedServerId !== null) {
    const server = await prisma.wsusServer.findUnique({
      where: { id: requestedServerId },
      select: { id: true },
    });
    if (!server) {
      return NextResponse.json(
        { success: false, error: "WSUS server not found." },
        { status: 404 }
      );
    }

    const result = await startBackgroundSync([server.id], scope);
    return NextResponse.json(
      { success: true, scope, ...result },
      { status: 202 }
    );
  }

  const enabledServers = await prisma.wsusServer.findMany({
    where: { enabled: true },
    orderBy: { name: "asc" },
    select: { id: true },
  });

  if (enabledServers.length === 0) {
    return NextResponse.json(
      { success: false, error: "No enabled WSUS servers configured." },
      { status: 400 }
    );
  }

  const result = await startBackgroundSync(
    enabledServers.map((s) => s.id),
    scope
  );
  return NextResponse.json(
    { success: true, scope, ...result },
    { status: 202 }
  );
}
