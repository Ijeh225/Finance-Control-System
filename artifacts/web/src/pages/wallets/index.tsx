import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  useListWallets, getListWalletsQueryKey,
  useCreateWallet, useUpdateWallet,
  getGetWalletQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wallet, Plus, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Wallets() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [editWallet, setEditWallet] = useState<{ id: string; name: string; balance: number } | null>(null);
  const [form, setForm] = useState({ name: "", bankName: "", accountNumber: "", currency: "NGN", balance: "" });

  const { data, isLoading } = useListWallets({ query: { queryKey: getListWalletsQueryKey() } });

  const createWallet = useCreateWallet({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListWalletsQueryKey() });
        setShowCreate(false);
        setForm({ name: "", bankName: "", accountNumber: "", currency: "NGN", balance: "" });
        toast({ title: "Wallet created" });
      },
      onError: () => toast({ title: "Failed to create wallet", variant: "destructive" }),
    },
  });

  const updateWallet = useUpdateWallet({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getListWalletsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetWalletQueryKey(data.id) });
        setEditWallet(null);
        toast({ title: "Wallet updated" });
      },
      onError: () => toast({ title: "Failed to update wallet", variant: "destructive" }),
    },
  });

  const isMd = user?.role === "md";
  const totalBalance = data?.wallets?.reduce((sum, w) => sum + (w.balance ?? 0), 0) ?? 0;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Wallets</h1>
          <p className="text-muted-foreground text-sm font-medium">Fund accounts and balance overview.</p>
        </div>
        {isMd && (
          <Button className="font-semibold shadow-sm" onClick={() => setShowCreate(true)} data-testid="button-create-wallet">
            <Plus className="w-4 h-4 mr-2" /> Add Wallet
          </Button>
        )}
      </div>

      <Card className="shadow-sm border-primary/20 bg-primary/5">
        <CardContent className="pt-5">
          <p className="text-xs uppercase tracking-wider font-semibold text-primary mb-1">Total Funds Available</p>
          <p className="text-4xl font-bold font-mono" data-testid="text-total-balance">{formatCurrency(totalBalance)}</p>
          <p className="text-xs text-muted-foreground mt-1">{data?.wallets?.length ?? 0} wallet{data?.wallets?.length !== 1 ? "s" : ""}</p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-36 w-full" />)}
        </div>
      ) : !data?.wallets?.length ? (
        <div className="flex flex-col items-center justify-center text-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Wallet className="w-8 h-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-bold">No wallets yet</h3>
          <p className="text-sm text-muted-foreground mt-2">Add your first wallet account to start tracking balances.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.wallets.map((wallet) => (
            <Card key={wallet.id} className="shadow-sm hover:shadow-md transition-shadow" data-testid={`card-wallet-${wallet.id}`}>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div>
                  <CardTitle className="text-base font-bold">{wallet.name}</CardTitle>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{wallet.accountNumber}</p>
                </div>
                {isMd && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => setEditWallet({ id: wallet.id, name: wallet.name, balance: wallet.balance ?? 0 })} data-testid={`button-edit-wallet-${wallet.id}`}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono">{formatCurrency(wallet.balance ?? 0, wallet.currency ?? "NGN")}</p>
                <p className="text-xs text-muted-foreground mt-1">{wallet.bankName} · {wallet.currency ?? "NGN"}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Wallet Name *</Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Operations Account" data-testid="input-wallet-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Bank Name</Label>
                <Input value={form.bankName} onChange={(e) => setForm(f => ({ ...f, bankName: e.target.value }))} placeholder="Zenith Bank" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Account Number</Label>
                <Input value={form.accountNumber} onChange={(e) => setForm(f => ({ ...f, accountNumber: e.target.value }))} placeholder="0123456789" className="font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Currency</Label>
                <Input value={form.currency} onChange={(e) => setForm(f => ({ ...f, currency: e.target.value }))} placeholder="NGN" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Initial Balance</Label>
                <Input type="number" value={form.balance} onChange={(e) => setForm(f => ({ ...f, balance: e.target.value }))} placeholder="0.00" className="font-mono" data-testid="input-wallet-balance" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button disabled={!form.name || createWallet.isPending} onClick={() => createWallet.mutate({ data: { name: form.name, bankName: form.bankName, accountNumber: form.accountNumber, currency: form.currency, balance: Number(form.balance) || 0 } })} data-testid="button-confirm-create-wallet">
              {createWallet.isPending ? "Creating..." : "Create Wallet"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editWallet} onOpenChange={(open) => { if (!open) setEditWallet(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Wallet</DialogTitle>
          </DialogHeader>
          {editWallet && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Name</Label>
                <Input value={editWallet.name} onChange={(e) => setEditWallet(w => w ? { ...w, name: e.target.value } : w)} data-testid="input-edit-wallet-name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Balance</Label>
                <Input type="number" value={editWallet.balance} onChange={(e) => setEditWallet(w => w ? { ...w, balance: Number(e.target.value) } : w)} className="font-mono" data-testid="input-edit-wallet-balance" />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditWallet(null)}>Cancel</Button>
            <Button disabled={updateWallet.isPending} onClick={() => editWallet && updateWallet.mutate({ id: editWallet.id, data: { name: editWallet.name, balance: editWallet.balance } })} data-testid="button-confirm-update-wallet">
              {updateWallet.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
