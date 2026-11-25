import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canManageServers } from "@/lib/rbac";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageServers(session.role)) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required." },
      { status: 403 }
    );
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
    const normalizedUrl = body.baseUrl.trim().replace(/\/+$/, "");
    try {
      new URL(normalizedUrl);
    } catch {
      return NextResponse.json(
        { error: "Base URL must be a valid URL." },
        { status: 400 }
      );
    }
    data.baseUrl = normalizedUrl;
  }
  if (typeof body?.apiKey === "string") {
    const trimmedKey = body.apiKey.trim();
    if (!trimmedKey) {
      return NextResponse.json(
        { error: "API Key cannot be empty." },
        { status: 400 }
      );
    }
    data.apiKey = trimmedKey;
  }
  if (typeof body?.enabled === "boolean") {
    data.enabled = body.enabled;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "No valid fields provided to update." },
      { status: 400 }
    );
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
  if (!canManageServers(session.role)) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const serverId = Number(id);
  if (!Number.isInteger(serverId)) {
    return NextResponse.json({ error: "Invalid server ID" }, { status: 400 });
  }

  const approvalSchedules = await prisma.wsusApprovalSchedule.count({
    where: {
      serverId,
      status: { in: ["pending", "processing"] },
    },
  });
  if (approvalSchedules > 0) {
    return NextResponse.json(
      { error: "Cancel or wait for scheduled approvals before deleting this WSUS server." },
      { status: 409 }
    );
  }

  await prisma.wsusServer.delete({ where: { id: serverId } });
  return NextResponse.json({ success: true });
}
