import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const username = searchParams.get("username") ?? "all";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    100,
    Math.max(10, Number(searchParams.get("pageSize") ?? "25") || 25)
  );
  const where = {
    ...(username !== "all" ? { username } : {}),
    ...(search
      ? {
          OR: [
            { username: { contains: search, mode: "insensitive" as const } },
            { action: { contains: search, mode: "insensitive" as const } },
            { target: { contains: search, mode: "insensitive" as const } },
            { details: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, users] = await Promise.all([
    prisma.userActionLog.count({ where }),
    prisma.userActionLog.findMany({
      distinct: ["username"],
      orderBy: { username: "asc" },
      select: { username: true },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const entries = await prisma.userActionLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
  });

  return NextResponse.json({
    entries,
    users: users.map((user) => user.username),
    total,
    totalPages,
    page: currentPage,
  });
}
