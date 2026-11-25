import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canControlWsus } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  const scheduleId = Number(id);
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
    return NextResponse.json({ error: "Invalid schedule ID." }, { status: 400 });
  }

  const result = await prisma.wsusApprovalSchedule.updateMany({
    where: { id: scheduleId, status: "pending" },
    data: { status: "cancelled" },
  });
  if (result.count !== 1) {
    return NextResponse.json(
      { error: "Schedule not found or no longer pending." },
      { status: 409 }
    );
  }
  return NextResponse.json({ success: true });
}
