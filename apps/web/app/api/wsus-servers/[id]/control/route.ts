import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canControlWsus } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { recordUserAction } from "@/lib/user-action-log";
import {
  callWsusApi,
  type WsusComputer,
  type WsusGroup,
  type WsusUpdate,
} from "@/lib/wsus-control-api";

type RouteContext = { params: Promise<{ id: string }> };

async function getAdminServer(context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!canControlWsus(session.role)) {
    return {
      response: NextResponse.json(
        { error: "Forbidden: Admin access required." },
        { status: 403 }
      ),
    };
  }

  const { id } = await context.params;
  const serverId = Number(id);
  if (!Number.isInteger(serverId) || serverId <= 0) {
    return { response: NextResponse.json({ error: "Invalid server ID." }, { status: 400 }) };
  }
  const server = await prisma.wsusServer.findUnique({
    where: { id: serverId },
    select: { id: true, name: true, baseUrl: true, apiKey: true, enabled: true },
  });
  if (!server) {
    return { response: NextResponse.json({ error: "WSUS server not found." }, { status: 404 }) };
  }
  if (!server.enabled) {
    return { response: NextResponse.json({ error: "WSUS server is disabled." }, { status: 409 }) };
  }
  return { session, server };
}

export async function GET(request: Request, context: RouteContext) {
  const result = await getAdminServer(context);
  if ("response" in result) return result.response;

  try {
    const url = new URL(request.url);
    const computerSearch = (url.searchParams.get("computerSearch") ?? "").trim().slice(0, 200);
    const updateSearch = (url.searchParams.get("updateSearch") ?? "").trim().slice(0, 200);
    const [groups, computers, updates] = await Promise.all([
      callWsusApi<WsusGroup[]>(result.server, "/groups?page=1&pageSize=500"),
      callWsusApi<WsusComputer[]>(
        result.server,
        `/computers?${new URLSearchParams({
          ...(computerSearch ? { search: computerSearch } : {}),
          page: "1",
          pageSize: "500",
        })}`
      ),
      callWsusApi<WsusUpdate[]>(
        result.server,
        `/updates?${new URLSearchParams({
          approved: "false",
          declined: "false",
          ...(updateSearch ? { search: updateSearch } : {}),
          page: "1",
          pageSize: "500",
        })}`
      ),
    ]);
    return NextResponse.json({ groups, computers, updates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WSUS request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const result = await getAdminServer(context);
  if ("response" in result) return result.response;

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

  const action = body.action;
  let path: string;
  let payload: object;
  let status = 200;

  if (action === "create-group") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 256) {
      return NextResponse.json(
        { error: "Group name must contain 1 to 256 characters." },
        { status: 400 }
      );
    }
    path = "/groups";
    payload = { name };
    status = 201;
  } else if (action === "add-computer") {
    const groupId = typeof body.groupId === "string" ? body.groupId : "";
    const computerId = typeof body.computerId === "string" ? body.computerId : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupId)) {
      return NextResponse.json({ error: "Invalid groupId." }, { status: 400 });
    }
    if (!computerId.trim() || computerId.length > 256) {
      return NextResponse.json({ error: "Invalid computerId." }, { status: 400 });
    }
    path = `/groups/${encodeURIComponent(groupId)}/computers`;
    payload = { computerId: computerId.trim() };
  } else if (action === "sync") {
    path = "/sync";
    payload = {};
    status = 202;
  } else if (action === "approve") {
    const updateId = typeof body.updateId === "string" ? body.updateId : "";
    const groupId = typeof body.targetGroupId === "string" ? body.targetGroupId : "";
    const revisionNumber = body.revisionNumber;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(updateId)) {
      return NextResponse.json({ error: "Invalid updateId." }, { status: 400 });
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupId)) {
      return NextResponse.json({ error: "Invalid targetGroupId." }, { status: 400 });
    }
    if (typeof revisionNumber !== "number" || !Number.isInteger(revisionNumber) || revisionNumber < 1) {
      return NextResponse.json({ error: "Invalid revisionNumber." }, { status: 400 });
    }
    path = `/updates/${encodeURIComponent(updateId)}/approvals`;
    payload = { revisionNumber, targetGroupId: groupId };
  } else {
    return NextResponse.json({ error: "Unknown control action." }, { status: 400 });
  }

  try {
    const data = await callWsusApi<unknown>(result.server, path, {
      method: "POST",
      body: payload,
    });
    const actionLabels: Record<string, string> = {
      "create-group": "Created WSUS computer group",
      "add-computer": "Added computer to WSUS group",
      sync: "Requested upstream WSUS synchronization",
      approve: "Approved WSUS update",
    };
    const details =
      action === "create-group"
        ? `Created group "${String(body.name).trim()}".`
        : action === "add-computer"
          ? `Added computer "${String(body.computerId).trim()}" to group ${String(body.groupId)}.`
          : action === "approve"
            ? `Approved update ${String(body.updateId)} revision ${String(body.revisionNumber)} for group ${String(body.targetGroupId)}.`
            : "Requested synchronization from the upstream WSUS server.";
    await recordUserAction({
      username: result.session.username,
      action: actionLabels[action as keyof typeof actionLabels],
      target: result.server.name,
      details,
    });
    return NextResponse.json({ data }, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WSUS request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
