"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Monitor,
  RefreshCw,
  ScrollText,
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

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard, adminOnly: false },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { title: "Client Status", url: "/clients", icon: Monitor, adminOnly: false },
      { title: "Patches", url: "/patches", icon: ShieldAlert, adminOnly: false },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Sync & Servers", url: "/sync", icon: RefreshCw, adminOnly: false },
      { title: "Logs", url: "/logs", icon: ScrollText, adminOnly: false },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Users", url: "/users", icon: Users, adminOnly: true },
      { title: "Settings", url: "/settings", icon: Settings2, adminOnly: false },
    ],
  },
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
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.adminOnly || canManageUsers(user.role)
          );
          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {visibleItems.map((item) => {
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
          );
        })}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
