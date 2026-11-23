import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canManageUsers, isValidRole } from "@/lib/rbac";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.role)) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
  }

  try {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const body = await request.json();
    const data: { role?: string; passwordHash?: string } = {};

    if (body?.role !== undefined) {
      if (!isValidRole(body.role)) {
        return NextResponse.json(
          { error: "Invalid role. Must be admin, operator, or viewer." },
          { status: 400 }
        );
      }

      if (userId === session.userId && body.role !== "admin") {
        return NextResponse.json(
          { error: "You cannot demote your own admin account." },
          { status: 400 }
        );
      }

      if (target.role === "admin" && body.role !== "admin") {
        const adminCount = await prisma.user.count({
          where: { role: "admin" },
        });
        if (adminCount <= 1) {
          return NextResponse.json(
            { error: "Cannot demote the last remaining admin account." },
            { status: 400 }
          );
        }
      }

      data.role = body.role;
    }

    if (typeof body?.password === "string" && body.password.length > 0) {
      if (body.password.length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters long." },
          { status: 400 }
        );
      }
      data.passwordHash = await bcrypt.hash(body.password, 12);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields provided for update." },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.role)) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
  }

  if (userId === session.userId) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (target.role === "admin") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last remaining admin account." },
        { status: 400 }
      );
    }
  }

  await prisma.user.delete({ where: { id: userId } });
  return NextResponse.json({ success: true });
}
