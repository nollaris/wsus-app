import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const servers = await prisma.wsusServer.findMany({
    orderBy: { name: "asc" },
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

  return NextResponse.json({ servers });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const baseUrl =
      typeof body?.baseUrl === "string"
        ? body.baseUrl.trim().replace(/\/+$/, "")
        : "";
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
    const enabled = body?.enabled !== false;

    if (!name || !baseUrl || !apiKey) {
      return NextResponse.json(
        { error: "Name, Base URL, and API Key are required." },
        { status: 400 }
      );
    }

    try {
      new URL(baseUrl);
    } catch {
      return NextResponse.json(
        { error: "Base URL must be a valid URL (e.g. http://wsus-hq:8530/wsus-api/api/v1)." },
        { status: 400 }
      );
    }

    const existing = await prisma.wsusServer.findUnique({ where: { baseUrl } });
    if (existing) {
      return NextResponse.json(
        { error: "A WSUS server with this Base URL already exists." },
        { status: 409 }
      );
    }

    const created = await prisma.wsusServer.create({
      data: { name, baseUrl, apiKey, enabled },
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

    return NextResponse.json({ server: created }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to add WSUS server";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
