import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  useListUsers, getListUsersQueryKey,
  useCreateUser, useUpdateUser, useDeactivateUser,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, ChevronRight, UserX, Pencil, ShieldAlert, User as UserIcon } from "lucide-react";
import type { User } from "@workspace/api-client-react";

const ROLE_LABELS: Record<string, string> = {
  md: "MD — Chief Executive",
  treasury: "Treasury",
  payment_assistant: "Payment Assistant",
};

const ROLE_COLORS: Record<string, string> = {
  md: "bg-primary/10 text-primary border-primary/20",
  treasury: "bg-blue-500/10 text-blue-700 border-blue-200",
  payment_assistant: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
};

type FormState = {
  name: string; role: string; email: string; phone: string; password: string;
};

const emptyForm = (): FormState => ({ name: "", role: "payment_assistant", email: "", phone: "", password: "" });

export default function UsersList() {
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editForm, setEditForm] = useState<Partial<FormState>>({});

  const { data, isLoading } = useListUsers();
  const users = data?.users ?? [];

  const createUser = useCreateUser({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setShowCreate(false);
        setForm(emptyForm());
        toast({ title: "User created" });
      },
      onError: (e: any) => toast({
        title: e?.response?.data?.error ?? "Failed to create user",
        variant: "destructive",
      }),
    },
  });

  const updateUser = useUpdateUser({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setEditTarget(null);
        toast({ title: "User updated" });
      },
      onError: () => toast({ title: "Failed to update user", variant: "destructive" }),
    },
  });

  const deactivateUser = useDeactivateUser({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setDeactivateTarget(null);
        toast({ title: "User deactivated" });
      },
      onError: () => toast({ title: "Failed to deactivate user", variant: "destructive" }),
    },
  });

  if (currentUser?.role !== "md") {
    return (
      <div className="p-10 text-center text-muted-foreground">
        Access restricted. MD role required.
      </div>
    );
  }

  const openEdit = (u: User) => {
    setEditTarget(u);
    setEditForm({ name: u.name, role: u.role, email: u.email ?? "", phone: u.phone ?? "" });
  };

  const handleCreate = () => {
    createUser.mutate({ data: { name: form.name, role: form.role as any, email: form.email || undefined, phone: form.phone || undefined, password: form.password } });
  };

  const handleUpdate = () => {
    if (!editTarget) return;
    const payload: Record<string, any> = {};
    if (editForm.name) payload["name"] = editForm.name;
    if (editForm.role) payload["role"] = editForm.role;
    if (editForm.email !== undefined) payload["email"] = editForm.email;
    if (editForm.phone !== undefined) payload["phone"] = editForm.phone;
    if (editForm.password) payload["password"] = editForm.password;
    updateUser.mutate({ id: editTarget.id, data: payload });
  };

  const handleDeactivate = () => {
    if (!deactivateTarget) return;
    deactivateUser.mutate({ id: deactivateTarget.id });
  };

  const handleReactivate = (u: User) => {
    updateUser.mutate({ id: u.id, data: { isActive: true } });
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">User Management</h1>
          <p className="text-muted-foreground text-sm font-medium">Create, edit, and manage system access for your team.</p>
        </div>
        <Button className="font-semibold shadow-sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add User
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <Card className="shadow-sm divide-y divide-border">
          {users.map((u) => (
            <div key={u.id} className={`flex items-center gap-4 px-6 py-4 transition-colors ${!u.isActive ? "opacity-50 bg-muted/30" : "hover:bg-muted/30"}`}>
              <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center font-bold text-sidebar-foreground border border-border flex-shrink-0">
                {u.role === "md" ? <ShieldAlert className="w-5 h-5 text-primary" /> : <UserIcon className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link href={`/users/${u.id}`} className="font-semibold text-foreground hover:underline truncate">
                    {u.name}
                  </Link>
                  {!u.isActive && <span className="text-xs text-destructive font-medium">(Deactivated)</span>}
                </div>
                <p className="text-sm text-muted-foreground truncate">{u.email ?? "—"}</p>
              </div>
              <Badge className={`text-xs font-medium border ${ROLE_COLORS[u.role] ?? ""}`} variant="outline">
                {ROLE_LABELS[u.role] ?? u.role}
              </Badge>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button size="sm" variant="ghost" onClick={() => openEdit(u)} title="Edit user">
                  <Pencil className="w-4 h-4" />
                </Button>
                {u.isActive ? (
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeactivateTarget(u)} title="Deactivate user" disabled={u.id === currentUser?.id}>
                    <UserX className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => handleReactivate(u)} title="Reactivate user">
                    <UserIcon className="w-4 h-4" />
                  </Button>
                )}
                <Link href={`/users/${u.id}`}>
                  <Button size="sm" variant="ghost">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <CardContent className="py-12 text-center text-muted-foreground">
              No users found.
            </CardContent>
          )}
        </Card>
      )}

      {/* Create User Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input placeholder="Mr D (Payments)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment_assistant">Payment Assistant</SelectItem>
                  <SelectItem value="treasury">Treasury</SelectItem>
                  <SelectItem value="md">MD — Chief Executive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="mrd@fincommand.ng" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input placeholder="+234 800 000 0005" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Password *</Label>
              <Input type="password" placeholder="••••••••" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.name || !form.password || createUser.isPending}>
              {createUser.isPending ? "Creating…" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editTarget} onOpenChange={open => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User — {editTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={editForm.name ?? ""} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={editForm.role ?? "payment_assistant"} onValueChange={v => setEditForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment_assistant">Payment Assistant</SelectItem>
                  <SelectItem value="treasury">Treasury</SelectItem>
                  <SelectItem value="md">MD — Chief Executive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={editForm.email ?? ""} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={editForm.phone ?? ""} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>New Password <span className="text-muted-foreground text-xs">(leave blank to keep current)</span></Label>
              <Input type="password" placeholder="••••••••" value={editForm.password ?? ""} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateUser.isPending}>
              {updateUser.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={open => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This user will immediately lose system access. They can be reactivated at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
