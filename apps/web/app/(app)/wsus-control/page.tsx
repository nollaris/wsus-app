import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canControlWsus } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { WsusControlPanel } from "./_components/wsus-control-panel";

export const instant = false;

export const metadata: Metadata = {
  title: "WSUS Control",
};

export default async function WsusControlPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canControlWsus(session.role)) redirect("/");

  const servers = await prisma.wsusServer.findMany({
    where: { enabled: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">WSUS Control</h1>
        <p className="text-muted-foreground">
          Manage computer groups, upstream synchronization, and update approvals.
        </p>
      </div>
      <WsusControlPanel servers={servers} />
    </div>
  );
}
