"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

interface AppShellProps {
  user: { username: string; role: string };
  children: React.ReactNode;
}

function getPageLabel(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname === "/clients") return "Client Status";
  if (pathname.startsWith("/clients/")) return "Client Details";
  if (pathname === "/patches") return "Patches";
  if (pathname === "/sync") return "Sync & Catalog";
  if (pathname === "/import") return "Import Data";
  if (pathname === "/settings") return "Settings";
  return "Overview";
}

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const pageLabel = getPageLabel(pathname);

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset className="min-w-0 overflow-x-hidden">
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
