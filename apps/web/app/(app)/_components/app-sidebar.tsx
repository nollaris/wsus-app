"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Monitor,
  RefreshCw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { canManageUsers } from "@/lib/rbac";
import { NavUser } from "./nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/ui/sidebar";

const NAV_ITEMS = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, adminOnly: false },
  { title: "Client Status", url: "/clients", icon: Monitor, adminOnly: false },
  { title: "Patches", url: "/patches", icon: ShieldAlert, adminOnly: false },
  { title: "Sync & Servers", url: "/sync", icon: RefreshCw, adminOnly: false },
  { title: "Users", url: "/users", icon: Users, adminOnly: true },
  { title: "Settings", url: "/settings", icon: Settings2, adminOnly: false },
];

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { username: string; role: string };
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/" />}
              tooltip="WSUS Portal"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ShieldCheck className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">WSUS Portal</span>
                <span className="truncate text-xs text-muted-foreground">
                  Patch Management
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            {NAV_ITEMS.filter(
              (item) => !item.adminOnly || canManageUsers(user.role)
            ).map((item) => {
              const Icon = item.icon;
              const isActive =
                item.url === "/"
                  ? pathname === "/"
                  : pathname === item.url ||
                    pathname.startsWith(`${item.url}/`);
              return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    isActive={isActive}
                    tooltip={item.title}
                    render={<Link href={item.url} />}
                  >
                    <Icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
