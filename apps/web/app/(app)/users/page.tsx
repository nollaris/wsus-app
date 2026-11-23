import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canManageUsers } from "@/lib/rbac";
import { UsersManager } from "@/components/users-manager";

export const instant = false;

export const metadata: Metadata = {
  title: "Users & RBAC",
};

export default async function UsersPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (!canManageUsers(session.role)) {
    redirect("/");
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

  const serializedUsers = users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Users &amp; Access Control
        </h1>
        <p className="text-muted-foreground">
          Manage portal user accounts, assign RBAC roles, and reset passwords.
        </p>
      </div>

      <UsersManager
        initialUsers={serializedUsers}
        currentUserId={session.userId}
      />
    </div>
  );
}
