import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { startBackgroundSync } from "@/lib/wsus-api-sync";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedServerId =
    typeof body?.serverId === "number" ? body.serverId : null;

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

    const result = await startBackgroundSync([server.id]);
    return NextResponse.json(
      { success: true, ...result },
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

  const result = await startBackgroundSync(enabledServers.map((s) => s.id));
  return NextResponse.json(
    { success: true, ...result },
    { status: 202 }
  );
}
