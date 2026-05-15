import { useParams, Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  useGetUserProfile, getGetUserProfileQueryKey,
  useUpdateUser,
  useListWallets, getListWalletsQueryKey,
  useCreateWallet,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ShieldAlert, User as UserIcon, Wallet, Receipt,
  CheckCircle, Clock, AlertTriangle, Plus,
} from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  md: "MD — Chief Executive",
  treasury: "Treasury",
  payment_assistant: "Payment Assistant",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 border-amber-200",
  approved: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  on_hold: "bg-orange-500/10 text-orange-700 border-orange-200",
  partial: "bg-blue-500/10 text-blue-700 border-blue-200",
  paid: "bg-green-600/10 text-green-700 border-green-200",
  overdue: "bg-red-500/10 text-red-700 border-red-200",
};

export default function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [walletForm, setWalletForm] = useState({ name: "", bankName: "", accountNumber: "", balance: "", currency: "NGN" });

  const { data: profile, isLoading } = useGetUserProfile(id!);
  const { data: walletsData } = useListWallets(id ? { userId: id } : undefined);

  const createWallet = useCreateWallet({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(id!) });
        qc.invalidateQueries({ queryKey: getListWalletsQueryKey() });
        setShowAddWallet(false);
        setWalletForm({ name: "", bankName: "", accountNumber: "", balance: "", currency: "NGN" });
        toast({ title: "Wallet created" });
      },
      onError: () => toast({ title: "Failed to create wallet", variant: "destructive" }),
    },
  });

  const toggleActive = useUpdateUser({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetUserProfileQueryKey(id!) });
        toast({ title: `User ${profile?.isActive ? "deactivated" : "reactivated"}` });
      },
    },
  });

  const handleCreateWallet = () => {
    createWallet.mutate({
      data: {
        name: walletForm.name,
        bankName: walletForm.bankName || undefined,
        accountNumber: walletForm.accountNumber || undefined,
        balance: walletForm.balance ? parseFloat(walletForm.balance) : 0,
        currency: walletForm.currency || "NGN",
        ownedBy: id,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        User not found.
      </div>
    );
  }

  const wallets = walletsData?.wallets ?? profile.wallets ?? [];
  const isMd = currentUser?.role === "md";

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      {/* Back */}
      <Link href="/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="w-4 h-4" /> Back to Users
      </Link>

      {/* Header Card */}
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-sidebar-accent flex items-center justify-center font-bold text-3xl text-sidebar-foreground border-2 border-border flex-shrink-0">
              {profile.role === "md"
                ? <ShieldAlert className="w-10 h-10 text-primary" />
                : <UserIcon className="w-10 h-10" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground">{profile.name}</h1>
                {!profile.isActive && (
                  <Badge variant="destructive" className="text-xs">Deactivated</Badge>
                )}
              </div>
              <p className="text-muted-foreground text-sm mt-1">{ROLE_LABELS[profile.role] ?? profile.role}</p>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                {profile.email && <span>📧 {profile.email}</span>}
                {profile.phone && <span>📱 {profile.phone}</span>}
                <span>🗓 Joined {new Date(profile.createdAt).toLocaleDateString("en-NG", { month: "long", year: "numeric" })}</span>
              </div>
            </div>
            {isMd && profile.id !== currentUser?.id && (
              <Button
                variant={profile.isActive ? "outline" : "default"}
                className={profile.isActive ? "border-destructive text-destructive hover:bg-destructive/10" : ""}
                onClick={() => toggleActive.mutate({ id: profile.id, data: { isActive: !profile.isActive } })}
              >
                {profile.isActive ? "Deactivate User" : "Reactivate User"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Row */}
      {profile.billStats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="shadow-sm">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{profile.billStats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Bills</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{profile.billStats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{profile.billStats.approved}</p>
                  <p className="text-xs text-muted-foreground">Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm col-span-2 md:col-span-1">
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground mb-1">Total Submitted</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(profile.billStats.totalAmount)}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground mb-1">Paid</p>
              <p className="text-xl font-bold text-emerald-700">{formatCurrency(profile.billStats.paidAmount)}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground mb-1">Outstanding</p>
              <p className="text-xl font-bold text-destructive">{formatCurrency(profile.billStats.outstandingAmount)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Wallets */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" /> Wallets
          </CardTitle>
          {isMd && (
            <Button size="sm" variant="outline" onClick={() => setShowAddWallet(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add Wallet
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {wallets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No wallets assigned to this user.</p>
          ) : (
            <div className="space-y-3">
              {wallets.map(w => (
                <div key={w.id} className="flex items-center justify-between p-4 border rounded-lg bg-background hover:bg-muted/30 transition-colors">
                  <div>
                    <Link href={`/wallets/${w.id}`} className="font-semibold hover:underline">{w.name}</Link>
                    <p className="text-xs text-muted-foreground">{w.bankName ?? "—"}{w.accountNumber ? ` • ${w.accountNumber}` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-lg ${(w.balance ?? 0) < 10000 ? "text-destructive" : "text-emerald-700"}`}>
                      {formatCurrency(w.balance ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">{w.currency}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Bills */}
      {profile.recentBills && profile.recentBills.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" /> Recent Bills
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {profile.recentBills.map(b => (
                <div key={b.id} className="flex items-center gap-4 px-6 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <Link href={`/bills/${b.id}`} className="font-medium text-sm hover:underline truncate block">
                      {b.description}
                    </Link>
                    <p className="text-xs text-muted-foreground">{b.vendorName} · {new Date(b.createdAt).toLocaleDateString("en-NG")}</p>
                  </div>
                  <Badge className={`text-xs border ${STATUS_COLORS[b.status] ?? ""}`} variant="outline">
                    {b.status.replace("_", " ")}
                  </Badge>
                  <p className="font-semibold text-sm text-right shrink-0">{formatCurrency(b.amount)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Wallet Dialog */}
      <Dialog open={showAddWallet} onOpenChange={setShowAddWallet}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Wallet for {profile.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Wallet Name *</Label>
              <Input placeholder="GTBank Operations" value={walletForm.name} onChange={e => setWalletForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Bank Name</Label>
              <Input placeholder="Guaranty Trust Bank" value={walletForm.bankName} onChange={e => setWalletForm(f => ({ ...f, bankName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Account Number</Label>
              <Input placeholder="0123456789" value={walletForm.accountNumber} onChange={e => setWalletForm(f => ({ ...f, accountNumber: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Opening Balance</Label>
                <Input type="number" placeholder="0" value={walletForm.balance} onChange={e => setWalletForm(f => ({ ...f, balance: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input placeholder="NGN" value={walletForm.currency} onChange={e => setWalletForm(f => ({ ...f, currency: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddWallet(false)}>Cancel</Button>
            <Button onClick={handleCreateWallet} disabled={!walletForm.name || createWallet.isPending}>
              {createWallet.isPending ? "Creating…" : "Create Wallet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
