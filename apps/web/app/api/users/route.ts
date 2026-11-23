import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canManageUsers, isValidRole } from "@/lib/rbac";

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,50}$/;

export async function GET() {
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

  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      username: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
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

  try {
    const body = await request.json();
    const username =
      typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const role = body?.role;

    if (!USERNAME_PATTERN.test(username)) {
      return NextResponse.json(
        {
          error:
            "Username must be 3-50 characters and contain only letters, numbers, '.', '_', or '-'.",
        },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    if (!isValidRole(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be admin, operator, or viewer." },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json(
        { error: "A user with this username already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role,
      },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user: created }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
