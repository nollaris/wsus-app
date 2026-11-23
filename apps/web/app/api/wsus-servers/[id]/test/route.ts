import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canTriggerSync } from "@/lib/rbac";
import { testWsusServerConnection } from "@/lib/wsus-api-sync";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  const serverId = Number(id);
  if (!Number.isInteger(serverId)) {
    return NextResponse.json({ error: "Invalid server ID" }, { status: 400 });
  }

  const server = await prisma.wsusServer.findUnique({ where: { id: serverId } });
  if (!server) {
    return NextResponse.json({ error: "WSUS server not found" }, { status: 404 });
  }

  try {
    const health = await testWsusServerConnection(server);
    return NextResponse.json({ ok: true, health });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
