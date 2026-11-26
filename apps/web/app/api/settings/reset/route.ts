import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canResetDatabase } from "@/lib/rbac";
import { recordUserAction } from "@/lib/user-action-log";

async function getTableCounts() {
  const [
    classifications,
    products,
    clientStatus,
    patchInventory,
    clientPatchStatus,
    synchronizationHistory,
    synchronizationSetting,
  ] = await Promise.all([
    prisma.classification.count(),
    prisma.product.count(),
    prisma.clientStatus.count(),
    prisma.patchInventory.count(),
    prisma.clientPatchStatus.count(),
    prisma.synchronizationHistory.count(),
    prisma.synchronizationSetting.count(),
  ]);

  return {
    classifications,
    products,
    clientStatus,
    patchInventory,
    clientPatchStatus,
    synchronizationHistory,
    synchronizationSetting,
  };
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canResetDatabase(session.role)) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const action = body?.action;
    const confirmText =
      typeof body?.confirmText === "string" ? body.confirmText.trim() : "";

    if (confirmText !== "RESET") {
      return NextResponse.json(
        { error: 'Please type "RESET" to confirm this action.' },
        { status: 400 }
      );
    }

    if (action === "truncate") {
      await prisma.$transaction([
        prisma.clientPatchStatus.deleteMany(),
        prisma.patchInventory.deleteMany(),
        prisma.clientStatus.deleteMany(),
        prisma.synchronizationHistory.deleteMany(),
        prisma.synchronizationSetting.deleteMany(),
        prisma.product.deleteMany(),
        prisma.classification.deleteMany(),
      ]);

      await recordUserAction({
        username: session.username,
        action: "Reset WSUS data",
        target: "Portal database",
        details: "Cleared imported WSUS data and synchronization history.",
      });
      return NextResponse.json({
        ok: true,
        action: "truncate",
        counts: await getTableCounts(),
      });
    }

    return NextResponse.json({ error: "Invalid reset action." }, { status: 400 });
  } catch (error) {
    console.error("Database reset error:", error);
    return NextResponse.json(
      { error: "Failed to reset database." },
      { status: 500 }
    );
  }
}
