import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LogsBrowser } from "./_components/logs-browser";

export const instant = false;

export const metadata: Metadata = {
  title: "Logs",
};

export default async function LogsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Logs</h1>
        <p className="text-muted-foreground">
          Review actions initiated by users in the WSUS portal.
        </p>
      </div>
      <LogsBrowser />
    </div>
  );
}
