import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { WsusServersManager } from "./_components/wsus-servers-manager";

export const instant = false;

export const metadata: Metadata = {
  title: "Sync & Servers",
};

export default async function SyncPage() {
  const [session, wsusServers] = await Promise.all([
    getSession(),
    prisma.wsusServer.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        enabled: true,
        lastSyncedAt: true,
        lastStatus: true,
        lastError: true,
      },
    }),
  ]);

  const serializedServers = wsusServers.map((s) => ({
    id: s.id,
    name: s.name,
    baseUrl: s.baseUrl,
    enabled: s.enabled,
    lastSyncedAt: s.lastSyncedAt ? s.lastSyncedAt.toISOString() : null,
    lastStatus: s.lastStatus,
    lastError: s.lastError,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Synchronization &amp; Servers
        </h1>
        <p className="text-muted-foreground">
          Manage WSUS server API endpoints and pull live synchronization data.
        </p>
      </div>

      <WsusServersManager
        initialServers={serializedServers}
        userRole={session?.role ?? "viewer"}
      />
    </div>
  );
}
