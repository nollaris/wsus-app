"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Eye,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  XCircle,
} from "lucide-react";
import {
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  normalizeRole,
  type Role,
} from "@/lib/rbac";
import { Alert, AlertDescription } from "@workspace/ui/components/ui/alert";
import { Badge } from "@workspace/ui/components/ui/badge";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/ui/table";

export interface UserItem {
  id: number;
  username: string;
  role: string;
  createdAt: string;
}

interface UsersManagerProps {
  initialUsers: UserItem[];
  currentUserId: number;
}

function RoleBadge({ role }: { role: string }) {
  const normalized = normalizeRole(role);
  if (normalized === "admin") {
    return (
      <Badge className="gap-1 bg-primary/15 text-primary hover:bg-primary/20 border-0">
        <ShieldCheck className="size-3" />
        {ROLE_LABELS.admin}
      </Badge>
    );
  }
  if (normalized === "operator") {
    return (
      <Badge
        variant="secondary"
        className="gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0"
      >
        <UserCog className="size-3" />
        {ROLE_LABELS.operator}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Eye className="size-3" />
      {ROLE_LABELS.viewer}
    </Badge>
  );
}

export function UsersManager({
  initialUsers,
  currentUserId,
}: UsersManagerProps) {
  const router = useRouter();
  const [users, setUsers] = React.useState<UserItem[]>(initialUsers);
  const [feedback, setFeedback] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Add user dialog
  const [addOpen, setAddOpen] = React.useState(false);
  const [newUsername, setNewUsername] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [newRole, setNewRole] = React.useState<Role>("viewer");
  const [addBusy, setAddBusy] = React.useState(false);

  // Edit user dialog
  const [editUser, setEditUser] = React.useState<UserItem | null>(null);
  const [editRole, setEditRole] = React.useState<Role>("viewer");
  const [editPassword, setEditPassword] = React.useState("");
  const [editBusy, setEditBusy] = React.useState(false);

  // Delete user dialog
  const [deleteUser, setDeleteUser] = React.useState<UserItem | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const adminCount = React.useMemo(
    () => users.filter((u) => u.role === "admin").length,
    [users]
  );

  async function refreshUsers() {
    const res = await fetch("/api/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users ?? []);
    }
    router.refresh();
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setAddBusy(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create user.");
      }

      setNewUsername("");
      setNewPassword("");
      setNewRole("viewer");
      setAddOpen(false);
      setFeedback({
        type: "success",
        message: `Created user "${data.user.username}" with role ${ROLE_LABELS[normalizeRole(data.user.role)]}.`,
      });
      await refreshUsers();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to create user.",
      });
    } finally {
      setAddBusy(false);
    }
  }

  function openEditDialog(user: UserItem) {
    setEditUser(user);
    setEditRole(normalizeRole(user.role));
    setEditPassword("");
  }

  async function handleEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setEditBusy(true);
    setFeedback(null);

    try {
      const payload: { role?: Role; password?: string } = {};
      if (editUser.id !== currentUserId) {
        payload.role = editRole;
      }
      if (editPassword.trim().length > 0) {
        payload.password = editPassword;
      }

      const res = await fetch(`/api/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update user.");
      }

      setEditUser(null);
      setEditPassword("");
      setFeedback({
        type: "success",
        message: `Updated user "${data.user.username}".`,
      });
      await refreshUsers();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to update user.",
      });
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDeleteUser() {
    if (!deleteUser) return;
    setDeleteBusy(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/users/${deleteUser.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to delete user.");
      }

      const removedName = deleteUser.username;
      setDeleteUser(null);
      setFeedback({
        type: "success",
        message: `Deleted user "${removedName}".`,
      });
      await refreshUsers();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to delete user.",
      });
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <Alert
          variant={feedback.type === "error" ? "destructive" : "default"}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <XCircle className="size-4" />
          )}
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      {/* Role Permissions Reference */}
      <div className="grid gap-4 md:grid-cols-3">
        {ROLES.map((role) => {
          const count = users.filter((u) => normalizeRole(u.role) === role).length;
          return (
            <Card key={role}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <RoleBadge role={role} />
                  <span className="font-mono text-xs text-muted-foreground">
                    {count} {count === 1 ? "user" : "users"}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {ROLE_DESCRIPTIONS[role]}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5" />
              Portal Users ({users.length})
            </CardTitle>
            <CardDescription className="mt-1">
              Accounts permitted to sign in to the WSUS Portal.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 size-4" />
            Add User
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                const isLastAdmin = u.role === "admin" && adminCount <= 1;
                const canDelete = !isSelf && !isLastAdmin;

                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{u.username}</span>
                        {isSelf && (
                          <Badge variant="outline" className="text-[11px]">
                            You
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={u.role} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(u)}
                          title="Edit role or reset password"
                        >
                          <Pencil className="size-4" />
                          <span className="sr-only">Edit {u.username}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!canDelete}
                          onClick={() => setDeleteUser(u)}
                          title={
                            isSelf
                              ? "You cannot delete your own account"
                              : isLastAdmin
                                ? "Cannot delete the last admin"
                                : `Delete ${u.username}`
                          }
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">Delete {u.username}</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!addBusy) setAddOpen(open);
        }}
      >
        <DialogContent>
          <form onSubmit={handleAddUser}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="size-4" />
                Create User Account
              </DialogTitle>
              <DialogDescription>
                Add a new user and assign their RBAC role.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="add-username">Username</Label>
                <Input
                  id="add-username"
                  placeholder="e.g. jdoe"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                  minLength={3}
                  maxLength={50}
                  disabled={addBusy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-password">Password</Label>
                <Input
                  id="add-password"
                  type="password"
                  placeholder="Minimum 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  disabled={addBusy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-role">Role</Label>
                <Select
                  value={newRole}
                  onValueChange={(val) => {
                    if (val) setNewRole(normalizeRole(val));
                  }}
                  disabled={addBusy}
                >
                  <SelectTrigger id="add-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {ROLE_DESCRIPTIONS[newRole]}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
                disabled={addBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addBusy}>
                {addBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
                Create User
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog
        open={Boolean(editUser)}
        onOpenChange={(open) => {
          if (!open && !editBusy) {
            setEditUser(null);
            setEditPassword("");
          }
        }}
      >
        <DialogContent>
          <form onSubmit={handleEditUser}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="size-4" />
                Edit User: {editUser?.username}
              </DialogTitle>
              <DialogDescription>
                Update role assignment or set a new password.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-role">Role</Label>
                <Select
                  value={editRole}
                  onValueChange={(val) => {
                    if (val) setEditRole(normalizeRole(val));
                  }}
                  disabled={editBusy || editUser?.id === currentUserId}
                >
                  <SelectTrigger id="edit-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editUser?.id === currentUserId ? (
                  <p className="text-xs text-muted-foreground">
                    You cannot change your own admin role.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {ROLE_DESCRIPTIONS[editRole]}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-password">
                  New Password (optional)
                </Label>
                <Input
                  id="edit-password"
                  type="password"
                  placeholder="Leave blank to keep current password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  minLength={6}
                  disabled={editBusy}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditUser(null);
                  setEditPassword("");
                }}
                disabled={editBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editBusy}>
                {editBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteUser)}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteUser(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User Account?</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete{" "}
              <span className="font-semibold text-foreground">
                {deleteUser?.username}
              </span>
              ? This user will immediately lose access to the WSUS Portal.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteUser(null)}
              disabled={deleteBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={deleteBusy}
            >
              {deleteBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
