import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const serverId = Number(id);
  if (!Number.isInteger(serverId)) {
    return NextResponse.json({ error: "Invalid server ID" }, { status: 400 });
  }

  const body = await request.json();
  const data: Record<string, unknown> = {};
  if (typeof body?.name === "string" && body.name.trim()) {
    data.name = body.name.trim();
  }
  if (typeof body?.baseUrl === "string" && body.baseUrl.trim()) {
    data.baseUrl = body.baseUrl.trim().replace(/\/+$/, "");
  }
  if (typeof body?.apiKey === "string" && body.apiKey.trim()) {
    data.apiKey = body.apiKey.trim();
  }
  if (typeof body?.enabled === "boolean") {
    data.enabled = body.enabled;
  }

  const updated = await prisma.wsusServer.update({
    where: { id: serverId },
    data,
    select: {
      id: true,
      name: true,
      baseUrl: true,
      enabled: true,
      lastSyncedAt: true,
      lastStatus: true,
      lastError: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ server: updated });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const serverId = Number(id);
  if (!Number.isInteger(serverId)) {
    return NextResponse.json({ error: "Invalid server ID" }, { status: 400 });
  }

  await prisma.wsusServer.delete({ where: { id: serverId } });
  return NextResponse.json({ success: true });
}
