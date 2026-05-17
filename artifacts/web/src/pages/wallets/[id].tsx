import { useParams, Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  useGetWallet, getGetWalletQueryKey,
  useGetWalletStatement, getGetWalletStatementQueryKey,
  useListWallets, getListWalletsQueryKey,
  useTransferFunds, useUpdateWallet,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ArrowRightLeft, AlertTriangle,
  ChevronLeft as PrevIcon, ChevronRight as NextIcon,
  Building2, Hash, Download, Receipt, TrendingUp, Search, X,
} from "lucide-react";

const LARGE_TRANSFER_THRESHOLD = 500_000;

const TX_TYPE_CONFIG: Record<string, { label: string; color: string; sign: string }> = {
  credit:       { label: "Credit",       color: "bg-emerald-500/10 text-emerald-700 border-emerald-200", sign: "+" },
  debit:        { label: "Debit",        color: "bg-destructive/10 text-destructive border-destructive/20", sign: "-" },
  transfer_in:  { label: "Transfer In",  color: "bg-emerald-500/10 text-emerald-700 border-emerald-200", sign: "+" },
  transfer_out: { label: "Transfer Out", color: "bg-orange-500/10 text-orange-700 border-orange-200", sign: "-" },
  bill_payment: { label: "Bill Payment", color: "bg-rose-500/10 text-rose-700 border-rose-200", sign: "-" },
};

function formatDateTime(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type TransferStep = "form" | "confirm";

export default function WalletDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [showTransfer, setShowTransfer] = useState(false);
  const [transferStep, setTransferStep] = useState<TransferStep>("form");
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [transferForm, setTransferForm] = useState({ fromWalletId: id ?? "", toWalletId: "", amount: "", narration: "" });

  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpNarration, setTopUpNarration] = useState("");

  const [txType, setTxType] = useState<string>("");
  const [txFrom, setTxFrom] = useState("");
  const [txTo, setTxTo] = useState("");
  const [txSearch, setTxSearch] = useState("");

  const { data: walletData, isLoading: isWalletLoading } = useGetWallet(id!, {
    query: { queryKey: getGetWalletQueryKey(id!) },
  });

  const stmtParams = {
    page,
    pageSize,
    ...(txType ? { type: txType as "credit" } : {}),
    ...(txFrom ? { from: txFrom } : {}),
    ...(txTo ? { to: txTo } : {}),
    ...(txSearch ? { search: txSearch } : {}),
  };

  const { data: statement, isLoading: isStatementLoading } = useGetWalletStatement(
    id!,
    stmtParams,
    { query: { queryKey: getGetWalletStatementQueryKey(id!, stmtParams) } },
  );

  const topUp = useUpdateWallet({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetWalletQueryKey(id!) });
        qc.invalidateQueries({ queryKey: getGetWalletStatementQueryKey(id!, stmtParams) });
        setShowTopUp(false);
        setTopUpAmount("");
        setTopUpNarration("");
        toast({ title: "Funds added to wallet" });
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error;
        toast({ title: msg ?? "Top-up failed", variant: "destructive" });
      },
    },
  });

  const { data: walletsData } = useListWallets(undefined, {
    query: { queryKey: getListWalletsQueryKey() },
  });

  const transfer = useTransferFunds({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetWalletQueryKey(id!) });
        qc.invalidateQueries({ queryKey: getGetWalletStatementQueryKey(id!, { page, pageSize }) });
        qc.invalidateQueries({ queryKey: getListWalletsQueryKey() });
        setShowTransfer(false);
        resetTransfer();
        toast({ title: "Transfer completed" });
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error;
        toast({ title: msg ?? "Transfer failed", variant: "destructive" });
      },
    },
  });

  const wallet = walletData;
  const allWallets = walletsData?.wallets ?? [];
  const transactions = statement?.transactions ?? [];
  const total = statement?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const isLargeTransfer = parseFloat(transferForm.amount || "0") > LARGE_TRANSFER_THRESHOLD;
  const fromWallet = allWallets.find(w => w.id === transferForm.fromWalletId);
  const toWallet = allWallets.find(w => w.id === transferForm.toWalletId);
  const formValid =
    !!transferForm.fromWalletId &&
    !!transferForm.toWalletId &&
    !!transferForm.amount &&
    parseFloat(transferForm.amount) > 0 &&
    !!transferForm.narration;

  const resetTransfer = () => {
    setTransferForm({ fromWalletId: id ?? "", toWalletId: "", amount: "", narration: "" });
    setTransferStep("form");
    setTransferConfirmed(false);
  };

  const closeTransfer = () => {
    setShowTransfer(false);
    resetTransfer();
  };

  const handleReviewOrConfirm = () => {
    if (isLargeTransfer && transferStep === "form") {
      setTransferStep("confirm");
      setTransferConfirmed(false);
      return;
    }
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
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => { setTopUpAmount(""); setTopUpNarration(""); setShowTopUp(true); }}
          >
            <TrendingUp className="w-4 h-4 mr-2" /> Top Up
          </Button>
          <Button onClick={() => { setTransferForm(f => ({ ...f, fromWalletId: id ?? "" })); setShowTransfer(true); }}>
            <ArrowRightLeft className="w-4 h-4 mr-2" /> Transfer Funds
          </Button>
          <a href={`/api/export/wallets/${id}/statement?format=excel`} download data-testid="button-export-wallet-excel">
            <Button variant="outline" size="sm" className="text-xs">
              <Download className="w-3.5 h-3.5 mr-1.5" /> Excel
            </Button>
          </a>
          <a href={`/api/export/wallets/${id}/statement?format=pdf`} download data-testid="button-export-wallet-pdf">
            <Button variant="outline" size="sm" className="text-xs">
              <Download className="w-3.5 h-3.5 mr-1.5" /> PDF
            </Button>
          </a>
        </div>
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

        {/* Filters */}
        <div className="px-6 py-3 border-b bg-muted/20 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              className="w-full h-8 rounded-md border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Search narration…"
              value={txSearch}
              onChange={e => { setTxSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={txType || "all"} onValueChange={v => { setTxType(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="credit">Credit</SelectItem>
              <SelectItem value="debit">Debit</SelectItem>
              <SelectItem value="transfer_in">Transfer In</SelectItem>
              <SelectItem value="transfer_out">Transfer Out</SelectItem>
              <SelectItem value="bill_payment">Bill Payment</SelectItem>
            </SelectContent>
          </Select>
          <input
            type="date"
            className="h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            value={txFrom}
            onChange={e => { setTxFrom(e.target.value); setPage(1); }}
            title="From date"
          />
          <input
            type="date"
            className="h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            value={txTo}
            onChange={e => { setTxTo(e.target.value); setPage(1); }}
            title="To date"
          />
          {(txType || txFrom || txTo || txSearch) && (
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => { setTxType(""); setTxFrom(""); setTxTo(""); setTxSearch(""); setPage(1); }}
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
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
            <p className="text-sm mt-1">Transfers and bill payments will appear here as a running ledger.</p>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-[1fr_130px_1fr_120px_130px] gap-4 px-6 py-2 text-xs uppercase tracking-wider font-semibold text-muted-foreground border-b bg-muted/30">
              <span>Date / Narration</span>
              <span>Type</span>
              <span>Reference</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Balance After</span>
            </div>

            <div className="divide-y">
              {transactions.map((tx) => {
                const cfg = TX_TYPE_CONFIG[tx.type ?? "debit"] ?? TX_TYPE_CONFIG["debit"]!;
                const isPositive = cfg.sign === "+";

                return (
                  <div key={tx.id} className="px-6 py-3 grid grid-cols-1 md:grid-cols-[1fr_130px_1fr_120px_130px] gap-1 md:gap-4 items-center" data-testid={`tx-row-${tx.id}`}>
                    <div>
                      <p className="text-sm font-medium">{tx.narration ?? "—"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{formatDateTime(tx.createdAt?.toString())}</p>
                    </div>
                    <div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${cfg.color}`}>{cfg.label}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {tx.type === "bill_payment" && tx.relatedBillId ? (
                        <Link
                          href={`/bills/${tx.relatedBillId}`}
                          className="inline-flex items-center gap-1 hover:underline hover:text-foreground transition-colors"
                        >
                          <Receipt className="w-3.5 h-3.5 shrink-0" />
                          View Bill
                        </Link>
                      ) : tx.relatedWalletName ? (
                        <Link href={`/wallets/${tx.relatedWalletId}`} className="hover:underline hover:text-foreground transition-colors">
                          {tx.relatedWalletName}
                        </Link>
                      ) : "—"}
                    </div>
                    <div className={`text-right font-bold font-mono text-sm ${isPositive ? "text-emerald-600" : "text-rose-600"}`}>
                      {cfg.sign}{formatCurrency(Math.abs(parseFloat(String(tx.amount ?? 0))))}
                    </div>
                    <div className="text-right font-mono text-sm text-muted-foreground">
                      {formatCurrency(parseFloat(String(tx.balanceAfter ?? 0)))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t flex items-center justify-between">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  <PrevIcon className="w-4 h-4 mr-1" /> Prev
                </Button>
                <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  Next <NextIcon className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Transfer Dialog */}
      <Dialog open={showTransfer} onOpenChange={open => { if (!open) closeTransfer(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {transferStep === "confirm" ? "Confirm Large Transfer" : "Transfer Funds"}
            </DialogTitle>
          </DialogHeader>

          {transferStep === "form" ? (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">From Wallet</Label>
                <Select
                  value={transferForm.fromWalletId}
                  onValueChange={(v) => setTransferForm(f => ({ ...f, fromWalletId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select wallet..." />
                  </SelectTrigger>
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
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">To Wallet</Label>
                <Select
                  value={transferForm.toWalletId}
                  onValueChange={(v) => setTransferForm(f => ({ ...f, toWalletId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select wallet..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allWallets.filter(w => w.id !== transferForm.fromWalletId).map(w => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} — {formatCurrency(w.balance ?? 0, w.currency ?? "NGN")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Amount</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  className="font-mono"
                  value={transferForm.amount}
                  onChange={(e) => setTransferForm(f => ({ ...f, amount: e.target.value }))}
                />
                {isLargeTransfer && (
                  <p className="text-xs text-amber-600 flex items-center gap-1 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Large transfer — you'll need to confirm on the next step.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Narration</Label>
                <Input
                  placeholder="Purpose of transfer..."
                  value={transferForm.narration}
                  onChange={(e) => setTransferForm(f => ({ ...f, narration: e.target.value }))}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-amber-50 border-amber-200 p-4 space-y-3">
                <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  Transfer above ₦500,000 — please review carefully
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <span className="text-muted-foreground">From</span>
                  <span className="font-semibold">{fromWallet?.name ?? "—"}</span>
                  <span className="text-muted-foreground">To</span>
                  <span className="font-semibold">{toWallet?.name ?? "—"}</span>
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold font-mono text-rose-600">{formatCurrency(parseFloat(transferForm.amount || "0"))}</span>
                  <span className="text-muted-foreground">Narration</span>
                  <span className="font-medium">{transferForm.narration}</span>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  id="transfer-confirm-check-detail"
                  checked={transferConfirmed}
                  onCheckedChange={(v) => setTransferConfirmed(!!v)}
                  data-testid="checkbox-confirm-transfer"
                />
                <label htmlFor="transfer-confirm-check-detail" className="text-sm leading-snug cursor-pointer select-none">
                  I confirm this transfer and understand it cannot be automatically reversed.
                </label>
              </div>
            </div>
          )}

          <DialogFooter>
            {transferStep === "confirm" ? (
              <>
                <Button variant="outline" onClick={() => setTransferStep("form")}>Back</Button>
                <Button
                  disabled={!transferConfirmed || transfer.isPending}
                  onClick={handleReviewOrConfirm}
                  data-testid="button-confirm-transfer"
                >
                  {transfer.isPending ? "Processing..." : "Confirm Transfer"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={closeTransfer}>Cancel</Button>
                <Button
                  disabled={!formValid || transfer.isPending}
                  onClick={handleReviewOrConfirm}
                  data-testid="button-confirm-transfer"
                >
                  {transfer.isPending ? "Processing..." : isLargeTransfer ? "Review Transfer" : "Transfer"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Top Up Dialog */}
      <Dialog open={showTopUp} onOpenChange={setShowTopUp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Top Up — {wallet?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Amount (NGN) *</Label>
              <Input
                type="number"
                placeholder="0.00"
                className="font-mono"
                value={topUpAmount}
                onChange={e => setTopUpAmount(e.target.value)}
                data-testid="input-topup-amount"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Narration</Label>
              <Input
                placeholder="e.g. Monthly fund injection"
                value={topUpNarration}
                onChange={e => setTopUpNarration(e.target.value)}
                data-testid="input-topup-narration"
              />
            </div>
            {wallet && topUpAmount && Number(topUpAmount) > 0 && (
              <div className="rounded-md bg-muted/40 border px-3 py-2 text-sm space-y-1">
                <div className="flex justify-between text-muted-foreground">
                  <span>Current balance</span>
                  <span className="font-mono">{formatCurrency(wallet.balance ?? 0)}</span>
                </div>
                <div className="flex justify-between font-semibold text-emerald-700">
                  <span>New balance</span>
                  <span className="font-mono">{formatCurrency((wallet.balance ?? 0) + Number(topUpAmount))}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 mt-1">
            <Button variant="outline" onClick={() => setShowTopUp(false)} disabled={topUp.isPending}>Cancel</Button>
            <Button
              disabled={!topUpAmount || Number(topUpAmount) <= 0 || topUp.isPending}
              data-testid="button-confirm-topup"
              onClick={() => topUp.mutate({ id: id!, data: {
                balance: (wallet?.balance ?? 0) + Number(topUpAmount),
                narration: topUpNarration || undefined,
              }})}
            >
              {topUp.isPending ? "Adding…" : "Add Funds"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
