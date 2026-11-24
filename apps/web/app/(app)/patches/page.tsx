import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PatchesBrowser } from "./_components/patches-browser";

export const instant = false;

export const metadata: Metadata = {
  title: "Patches",
};

export default async function PatchesPage() {
  const [classifications, severities, servers] = await Promise.all([
    prisma.patchInventory.findMany({
      distinct: ["classification"],
      select: { classification: true },
      orderBy: { classification: "asc" },
    }),
    prisma.patchInventory.findMany({
      distinct: ["msrcSeverity"],
      select: { msrcSeverity: true },
      orderBy: { msrcSeverity: "asc" },
    }),
    prisma.patchInventory.findMany({
      distinct: ["serverName"],
      select: { serverName: true },
      orderBy: { serverName: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Patches</h1>
        <p className="text-muted-foreground">
          Browse the WSUS patch inventory catalog.
        </p>
      </div>
      <PatchesBrowser
        classifications={classifications.map((c) => c.classification).filter(Boolean)}
        severities={severities.map((s) => s.msrcSeverity).filter(Boolean)}
        servers={servers.map((s) => s.serverName).filter(Boolean)}
      />
    </div>
  );
}
