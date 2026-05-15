import { useParams, Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  useGetWallet, getGetWalletQueryKey,
  useGetWalletStatement, getGetWalletStatementQueryKey,
  useListWallets, getListWalletsQueryKey,
  useTransferFunds,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ArrowRightLeft, ArrowDownRight, ArrowUpRight,
  ChevronLeft as PrevIcon, ChevronRight as NextIcon,
  Building2, Hash,
} from "lucide-react";

const TX_TYPE_CONFIG: Record<string, { label: string; color: string; sign: string }> = {
  credit:       { label: "Credit",       color: "bg-emerald-500/10 text-emerald-700 border-emerald-200", sign: "+" },
  debit:        { label: "Debit",        color: "bg-destructive/10 text-destructive border-destructive/20", sign: "-" },
  transfer_in:  { label: "Transfer In",  color: "bg-emerald-500/10 text-emerald-700 border-emerald-200", sign: "+" },
  transfer_out: { label: "Transfer Out", color: "bg-orange-500/10 text-orange-700 border-orange-200", sign: "-" },
};

function formatDateTime(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function WalletDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [showTransfer, setShowTransfer] = useState(false);
  const [transferForm, setTransferForm] = useState({ fromWalletId: id ?? "", toWalletId: "", amount: "", narration: "" });

  const { data: walletData, isLoading: isWalletLoading } = useGetWallet(id!, {
    query: { queryKey: getGetWalletQueryKey(id!) },
  });

  const { data: statement, isLoading: isStatementLoading } = useGetWalletStatement(
    id!,
    { page, pageSize },
    { query: { queryKey: getGetWalletStatementQueryKey(id!, { page, pageSize }) } },
  );

  const { data: walletsData } = useListWallets(undefined, {
    query: { queryKey: getListWalletsQueryKey() },
  });

  const transfer = useTransferFunds({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetWalletQueryKey(id!) });
        qc.invalidateQueries({ queryKey: [`/api/wallets/${id}/statement`] });
        qc.invalidateQueries({ queryKey: getListWalletsQueryKey() });
        setShowTransfer(false);
        setTransferForm({ fromWalletId: id ?? "", toWalletId: "", amount: "", narration: "" });
        toast({ title: "Transfer completed" });
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: msg ?? "Transfer failed", variant: "destructive" });
      },
    },
  });

  const wallet = walletData;
  const allWallets = walletsData?.wallets ?? [];
  const transactions = statement?.transactions ?? [];
  const total = statement?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const handleTransfer = () => {
    transfer.mutate({
      data: {
        fromWalletId: transferForm.fromWalletId,
        toWalletId: transferForm.toWalletId,
        amount: parseFloat(transferForm.amount),
        narration: transferForm.narration,
      },
    });
  };

  if (isWalletLoading) {
    return (
      <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        Wallet not found.
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <Link href="/wallets" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="w-4 h-4" /> Back to Wallets
      </Link>

      {/* Wallet Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{wallet.name}</h1>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            {wallet.bankName && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" /> {wallet.bankName}
              </span>
            )}
            {wallet.accountNumber && (
              <span className="flex items-center gap-1 font-mono">
                <Hash className="w-3.5 h-3.5" /> {wallet.accountNumber}
              </span>
            )}
            {wallet.ownedByName && (
              <span>Owned by {wallet.ownedByName}</span>
            )}
          </div>
        </div>
        <Button onClick={() => { setTransferForm(f => ({ ...f, fromWalletId: id ?? "" })); setShowTransfer(true); }}>
          <ArrowRightLeft className="w-4 h-4 mr-2" /> Transfer Funds
        </Button>
      </div>

      {/* Balance Card */}
      <Card className="shadow-sm border-primary/20 bg-primary/5">
        <CardContent className="pt-5">
          <p className="text-xs uppercase tracking-wider font-semibold text-primary mb-1">Current Balance</p>
          <p className="text-4xl font-bold font-mono">{formatCurrency(wallet.balance ?? 0, wallet.currency ?? "NGN")}</p>
          <p className="text-xs text-muted-foreground mt-1">{wallet.currency ?? "NGN"} Account</p>
        </CardContent>
      </Card>

      {/* Statement Table */}
      <Card className="shadow-sm">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg">Transaction Statement</h2>
          <span className="text-sm text-muted-foreground">{total} transaction{total !== 1 ? "s" : ""}</span>
        </div>

        {isStatementLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <ArrowRightLeft className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="font-semibold">No transactions yet</p>
            <p className="text-sm mt-1">Transfers will appear here as a running ledger.</p>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-[1fr_140px_1fr_120px_130px] gap-4 px-6 py-2 text-xs uppercase tracking-wider font-semibold text-muted-foreground border-b bg-muted/30">
              <span>Date / Narration</span>
              <span>Type</span>
              <span>Related Wallet</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Balance After</span>
            </div>

            <div className="divide-y">
              {transactions.map((tx) => {
                const cfg = TX_TYPE_CONFIG[tx.type] ?? TX_TYPE_CONFIG["credit"];
                const isCredit = tx.type === "credit" || tx.type === "transfer_in";
                return (
                  <div key={tx.id} className="grid grid-cols-1 md:grid-cols-[1fr_140px_1fr_120px_130px] gap-2 md:gap-4 px-6 py-3 hover:bg-muted/20 transition-colors">
                    <div>
                      <p className="font-medium text-sm truncate">{tx.narration}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{formatDateTime(tx.createdAt)} · {tx.initiatedByName}</p>
                    </div>
                    <div className="flex items-center">
                      <Badge variant="outline" className={`text-[10px] font-semibold uppercase border ${cfg.color}`}>
                        {isCredit ? <ArrowDownRight className="w-3 h-3 mr-0.5" /> : <ArrowUpRight className="w-3 h-3 mr-0.5" />}
                        {cfg.label}
                      </Badge>
                    </div>
                    <div className="flex items-center text-sm text-muted-foreground truncate">
                      {tx.relatedWalletName ?? "—"}
                    </div>
                    <div className={`flex items-center justify-end font-mono font-bold text-sm ${isCredit ? "text-emerald-600" : "text-destructive"}`}>
                      {cfg.sign}{formatCurrency(tx.amount)}
                    </div>
                    <div className="flex items-center justify-end font-mono text-sm text-foreground">
                      {formatCurrency(tx.balanceAfter)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t">
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages} · {total} records
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                    <PrevIcon className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                    <NextIcon className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Transfer Dialog */}
      <Dialog open={showTransfer} onOpenChange={open => !open && setShowTransfer(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Funds</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>From Wallet</Label>
              <Select value={transferForm.fromWalletId} onValueChange={v => setTransferForm(f => ({ ...f, fromWalletId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select source wallet" /></SelectTrigger>
                <SelectContent>
                  {allWallets.map(w => (
                    <SelectItem key={w.id} value={w.id} disabled={w.id === transferForm.toWalletId}>
                      {w.name} — {formatCurrency(w.balance ?? 0, w.currency ?? "NGN")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>To Wallet</Label>
              <Select value={transferForm.toWalletId} onValueChange={v => setTransferForm(f => ({ ...f, toWalletId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select destination wallet" /></SelectTrigger>
                <SelectContent>
                  {allWallets.map(w => (
                    <SelectItem key={w.id} value={w.id} disabled={w.id === transferForm.fromWalletId}>
                      {w.name} — {formatCurrency(w.balance ?? 0, w.currency ?? "NGN")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount (₦)</Label>
              <Input
                type="number"
                min="1"
                step="0.01"
                placeholder="0.00"
                className="font-mono"
                value={transferForm.amount}
                onChange={e => setTransferForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Narration / Reason</Label>
              <Input
                placeholder="Office petty cash top-up"
                value={transferForm.narration}
                onChange={e => setTransferForm(f => ({ ...f, narration: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransfer(false)}>Cancel</Button>
            <Button
              onClick={handleTransfer}
              disabled={
                !transferForm.fromWalletId ||
                !transferForm.toWalletId ||
                !transferForm.amount ||
                !transferForm.narration ||
                transfer.isPending
              }
            >
              {transfer.isPending ? "Transferring…" : "Confirm Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
