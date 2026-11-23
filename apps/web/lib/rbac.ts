export const ROLES = ["admin", "operator", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  operator: "Operator",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin:
    "Full access: manage users, WSUS servers, trigger syncs, and reset database.",
  operator:
    "Operational access: view all reports, test connections, and trigger WSUS syncs.",
  viewer:
    "Read-only access: view dashboards, client status, patches, and sync history.",
};

export function isValidRole(role: unknown): role is Role {
  return typeof role === "string" && (ROLES as readonly string[]).includes(role);
}

export function normalizeRole(role: string | undefined | null): Role {
  if (isValidRole(role)) return role;
  return "viewer";
}

export function hasRole(
  role: string | undefined | null,
  allowed: readonly Role[]
): boolean {
  return isValidRole(role) && allowed.includes(role);
}

export function canManageUsers(role: string | undefined | null): boolean {
  return hasRole(role, ["admin"]);
}

export function canManageServers(role: string | undefined | null): boolean {
  return hasRole(role, ["admin"]);
}

export function canTriggerSync(role: string | undefined | null): boolean {
  return hasRole(role, ["admin", "operator"]);
}

export function canResetDatabase(role: string | undefined | null): boolean {
  return hasRole(role, ["admin"]);
}
