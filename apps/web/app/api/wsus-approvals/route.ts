import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canControlWsus } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  callWsusApi,
  type WsusGroupDetail,
  type WsusUpdateDetail,
} from "@/lib/wsus-control-api";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canControlWsus(session.role)) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required." },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const rawServerId = url.searchParams.get("serverId");
  const serverId = rawServerId ? Number(rawServerId) : undefined;
  if (rawServerId && (!Number.isInteger(serverId) || serverId! <= 0)) {
    return NextResponse.json({ error: "Invalid serverId." }, { status: 400 });
  }

  const schedules = await prisma.wsusApprovalSchedule.findMany({
    where: serverId ? { serverId } : undefined,
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: { server: { select: { name: true } } },
  });
  return NextResponse.json({ schedules });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canControlWsus(session.role)) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const serverId = body.serverId;
  const updateId = body.updateId;
  const revisionNumber = body.revisionNumber;
  const targetGroupId = body.targetGroupId;
  const scheduledAt = typeof body.scheduledAt === "string" ? new Date(body.scheduledAt) : null;

  if (typeof serverId !== "number" || !Number.isInteger(serverId) || serverId <= 0) {
    return NextResponse.json({ error: "Invalid serverId." }, { status: 400 });
  }
  if (typeof updateId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(updateId)) {
    return NextResponse.json({ error: "Invalid updateId." }, { status: 400 });
  }
  if (typeof revisionNumber !== "number" || !Number.isInteger(revisionNumber) || revisionNumber < 1) {
    return NextResponse.json({ error: "Invalid revisionNumber." }, { status: 400 });
  }
  if (typeof targetGroupId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetGroupId)) {
    return NextResponse.json({ error: "Invalid targetGroupId." }, { status: 400 });
  }
  if (!scheduledAt || !Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + 30_000) {
    return NextResponse.json(
      { error: "scheduledAt must be at least 30 seconds in the future." },
      { status: 400 }
    );
  }

  const server = await prisma.wsusServer.findUnique({
    where: { id: serverId },
    select: { id: true, enabled: true, baseUrl: true, apiKey: true },
  });
  if (!server) {
    return NextResponse.json({ error: "WSUS server not found." }, { status: 404 });
  }
  if (!server.enabled) {
    return NextResponse.json({ error: "WSUS server is disabled." }, { status: 409 });
  }

  try {
    const [updateDetail, groupDetail] = await Promise.all([
      callWsusApi<WsusUpdateDetail>(
        server,
        `/updates/${encodeURIComponent(updateId)}?revisionNumber=${revisionNumber}`
      ),
      callWsusApi<WsusGroupDetail>(server, `/groups/${encodeURIComponent(targetGroupId)}`),
    ]);

    if (
      updateDetail.update.updateId.toLowerCase() !== updateId.toLowerCase() ||
      updateDetail.update.revisionNumber !== revisionNumber ||
      groupDetail.group.groupId.toLowerCase() !== targetGroupId.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "The selected WSUS update revision or target group could not be verified." },
        { status: 409 }
      );
    }

    const schedule = await prisma.wsusApprovalSchedule.create({
      data: {
        serverId,
        updateId,
        revisionNumber,
        updateTitle: updateDetail.update.title,
        targetGroupId,
        targetGroupName: groupDetail.group.name,
        scheduledAt,
        createdBy: session.username,
      },
    });
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not validate WSUS approval target.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
