import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncWsusServerById } from "@/lib/wsus-api-sync";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedServerId =
    typeof body?.serverId === "number" ? body.serverId : null;

  if (requestedServerId !== null) {
    try {
      const result = await syncWsusServerById(requestedServerId);
      revalidatePath("/", "layout");
      return NextResponse.json({ success: true, results: [result] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      return NextResponse.json({ success: false, error: message }, { status: 502 });
    }
  }

  const enabledServers = await prisma.wsusServer.findMany({
    where: { enabled: true },
    orderBy: { name: "asc" },
  });

  if (enabledServers.length === 0) {
    return NextResponse.json(
      { success: false, error: "No enabled WSUS servers configured." },
      { status: 400 }
    );
  }

  const results = [];
  const errors = [];

  for (const srv of enabledServers) {
    try {
      results.push(await syncWsusServerById(srv.id));
    } catch (err) {
      errors.push({
        serverId: srv.id,
        serverName: srv.name,
        error: err instanceof Error ? err.message : "Sync failed",
      });
    }
  }

  revalidatePath("/", "layout");
  return NextResponse.json({
    success: errors.length === 0,
    results,
    errors,
  });
}
