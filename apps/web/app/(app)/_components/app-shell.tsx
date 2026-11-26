"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "./app-sidebar";
import { LazyDataRefresh } from "./lazy-data-refresh";
import { ThemeToggle } from "./theme-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/ui/breadcrumb";
import { Separator } from "@workspace/ui/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui/components/ui/sidebar";

interface AppShellProps {
  user: { username: string; role: string };
  defaultSidebarOpen?: boolean;
  children: React.ReactNode;
}

function getPageLabel(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname === "/clients") return "Client Status";
  if (pathname.startsWith("/clients/")) return "Client Details";
  if (pathname === "/patches") return "Patches";
  if (pathname === "/sync") return "Sync & Servers";
  if (pathname.startsWith("/sync/")) return "Server Control";
  if (pathname === "/logs") return "Logs";
  if (pathname === "/users") return "Users & RBAC";
  if (pathname === "/settings") return "Settings";
  return "Overview";
}

export function AppShell({
  user,
  defaultSidebarOpen = true,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const pageLabel = getPageLabel(pathname);

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <LazyDataRefresh />
      <AppSidebar user={user} />
      <SidebarInset className="min-w-0 overflow-x-clip">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-2 px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 border-b bg-background/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/">WSUS Portal</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <ThemeToggle />
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 w-full min-w-0">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
