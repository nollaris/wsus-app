import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { SettingsPanel } from "./_components/settings-panel";

export const instant = false;

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage theme appearance, session details, and PostgreSQL database
          reset controls.
        </p>
      </div>
      <SettingsPanel
        user={session}
        initialCounts={{
          classifications,
          products,
          clientStatus,
          patchInventory,
          clientPatchStatus,
          synchronizationHistory,
          synchronizationSetting,
        }}
      />
    </div>
  );
}
