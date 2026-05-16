import { useState, useRef, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  useListBills, getListBillsQueryKey,
  useCreateBill,
  useListVendors, getListVendorsQueryKey,
  useListWallets, getListWalletsQueryKey,
  useRequestBillAttachmentUpload,
  useConfirmBillAttachment,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, FileText, ChevronRight, Paperclip, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ALLOWED_ATTACH_TYPES = new Set([
  "application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv", "application/octet-stream",
]);

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-600 border-red-500/20",
  on_hold: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  partial: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  paid: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  overdue: "bg-rose-500/10 text-rose-600 border-rose-500/20",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-orange-50 text-orange-700",
  urgent: "bg-red-50 text-red-700",
};

const STATUSES = ["pending", "approved", "rejected", "on_hold", "partial", "paid", "overdue"];
const PRIORITIES = ["low", "medium", "high", "urgent"];

export default function BillsList() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const rawSearch = useSearch();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(() => new URLSearchParams(rawSearch).get("status") ?? "all");
  const [priorityFilter, setPriorityFilter] = useState<string>(() => new URLSearchParams(rawSearch).get("priority") ?? "all");
  const presetVendorId = new URLSearchParams(rawSearch).get("vendorId") ?? "";

  useEffect(() => {
    const params = new URLSearchParams(rawSearch);
    setStatusFilter(params.get("status") ?? "all");
    setPriorityFilter(params.get("priority") ?? "all");
    const create = params.get("create");
    const vid = params.get("vendorId") ?? "";
    if (create === "1") {
      setShowCreate(true);
      if (vid) setForm(f => ({ ...f, vendorId: vid }));
    }
  }, [rawSearch]);
  const [showCreate, setShowCreate] = useState(() => new URLSearchParams(rawSearch).get("create") === "1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const attachFileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    vendorId: presetVendorId,
    description: "",
    amount: "",
    scheduledDate: "",
    dueDate: "",
    walletId: "none",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
    notes: "",
  });

  const queryParams = {
    ...(statusFilter && statusFilter !== "all" ? { status: statusFilter as any } : {}),
    ...(priorityFilter && priorityFilter !== "all" ? { priority: priorityFilter as any } : {}),
    ...(user?.role !== "md" ? { userId: user?.id } : {}),
  };

  const { data, isLoading } = useListBills(
    Object.keys(queryParams).length ? queryParams : undefined,
    { query: { queryKey: getListBillsQueryKey(Object.keys(queryParams).length ? queryParams : undefined) } }
  );

  const { data: vendorsData } = useListVendors(undefined, {
    query: { queryKey: getListVendorsQueryKey() },
  });
  const { data: walletsData } = useListWallets(undefined, {
    query: { queryKey: getListWalletsQueryKey() },
  });

  const createBill = useCreateBill();
  const requestUpload = useRequestBillAttachmentUpload();
  const confirmUpload = useConfirmBillAttachment();

  const resetCreateDialog = () => {
    setShowCreate(false);
    setIsSubmitting(false);
    setPendingFile(null);
    setForm({ vendorId: "", description: "", amount: "", scheduledDate: "", dueDate: "", walletId: "none", priority: "medium", notes: "" });
    if (attachFileRef.current) attachFileRef.current.value = "";
  };

  const handleSubmitBill = async () => {
    setIsSubmitting(true);
    try {
      const created = await createBill.mutateAsync({
        data: {
          vendorId: form.vendorId,
          description: form.description,
          amount: Number(form.amount),
          scheduledDate: form.scheduledDate,
          dueDate: form.dueDate || undefined,
          walletId: (form.walletId && form.walletId !== "none") ? form.walletId : undefined,
          priority: form.priority,
          createdBy: user!.id,
        },
      });
      qc.invalidateQueries({ queryKey: getListBillsQueryKey() });

      if (pendingFile && created?.id) {
        try {
          const uploadData = await requestUpload.mutateAsync({
            id: created.id,
            data: {
              fileName: pendingFile.name,
              fileSize: pendingFile.size,
              mimeType: pendingFile.type || "application/octet-stream",
            },
          });
          const putRes = await fetch(uploadData.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": pendingFile.type || "application/octet-stream" },
            body: pendingFile,
          });
          if (!putRes.ok) throw new Error(`Storage upload failed: ${putRes.status}`);
          await confirmUpload.mutateAsync({ id: created.id, attachmentId: uploadData.attachmentId });
          toast({ title: "Bill submitted with attachment" });
        } catch {
          toast({ title: "Bill submitted but attachment upload failed", variant: "destructive" });
        }
      } else {
        toast({ title: "Bill submitted for approval" });
      }

      resetCreateDialog();
    } catch {
      toast({ title: "Failed to create bill", variant: "destructive" });
      setIsSubmitting(false);
    }
  };

  const filteredBills = data?.bills?.filter(b =>
    !search || b.vendorName?.toLowerCase().includes(search.toLowerCase()) || b.description?.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Bills & Approvals</h1>
          <p className="text-muted-foreground text-sm font-medium">
            {user?.role === "md" ? "All pending liabilities and scheduled payments." : "Your submitted bills and their approval status."}
          </p>
        </div>
        <Button className="font-semibold shadow-sm" onClick={() => setShowCreate(true)} data-testid="button-create-bill">
          <Plus className="w-4 h-4 mr-2" /> Submit Bill
        </Button>
      </div>

      <Card className="shadow-sm">
        <div className="p-4 border-b flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search vendor or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-muted/50 border-none"
              data-testid="input-bill-search"
            />
          </div>
          <div className="flex gap-2 shrink-0">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 text-xs font-semibold bg-background shadow-sm" data-testid="select-status-filter">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-36 text-xs font-semibold bg-background shadow-sm" data-testid="select-priority-filter">
                <SelectValue placeholder="All Priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="p-4 flex gap-4">
                  <Skeleton className="w-10 h-10 rounded-md shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-8 w-24 shrink-0" />
                </div>
              ))}
            </div>
          ) : !filteredBills.length ? (
            <div className="p-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-bold">No bills found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-2">
                {search || (statusFilter !== "all") || (priorityFilter !== "all") ? "Try adjusting your filters." : "Submit a bill to get started."}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredBills.map((bill) => (
                <Link key={bill.id} href={`/bills/${bill.id}`}>
                  <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/30 transition-colors cursor-pointer group" data-testid={`row-bill-${bill.id}`}>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-foreground group-hover:text-primary transition-colors">{bill.vendorName}</span>
                          <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${PRIORITY_COLORS[bill.priority ?? "low"]}`}>{bill.priority}</span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-1">{bill.description}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs font-mono text-muted-foreground">
                          <span>Due: {formatDate(bill.dueDate)}</span>
                          <span>·</span>
                          <Link href={`/users/${bill.createdBy}`} className="hover:underline hover:text-foreground transition-colors">{bill.createdByName}</Link>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between md:justify-end gap-5 md:w-auto border-t md:border-t-0 pt-3 md:pt-0">
                      <div className="text-right">
                        <div className="font-bold text-lg font-mono">{formatCurrency(bill.amount ?? 0)}</div>
                        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_COLORS[bill.status ?? "pending"]}`}>{bill.status?.replace("_", " ")}</span>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit Bill for Approval</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Vendor *</Label>
              <Select value={form.vendorId} onValueChange={(v) => setForm(f => ({ ...f, vendorId: v }))}>
                <SelectTrigger data-testid="select-bill-vendor">
                  <SelectValue placeholder="Select vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {vendorsData?.vendors?.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Description *</Label>
              <Input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Invoice #1234 — Q1 supplies" data-testid="input-bill-description" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Amount (NGN) *</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="font-mono" data-testid="input-bill-amount" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Priority *</Label>
              <Select value={form.priority} onValueChange={(v: any) => setForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger data-testid="select-bill-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Scheduled Date *</Label>
              <Input type="date" value={form.scheduledDate} onChange={(e) => setForm(f => ({ ...f, scheduledDate: e.target.value }))} data-testid="input-bill-scheduled-date" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))} data-testid="input-bill-due-date" />
            </div>
            {walletsData?.wallets?.length ? (
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Pay From Wallet</Label>
                <Select value={form.walletId} onValueChange={(v) => setForm(f => ({ ...f, walletId: v }))}>
                  <SelectTrigger data-testid="select-bill-wallet">
                    <SelectValue placeholder="Select wallet (optional)..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No wallet specified</SelectItem>
                    {walletsData.wallets.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name} — {formatCurrency(w.balance ?? 0)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          {/* Optional attachment */}
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Attach Document (optional)</Label>
            <input
              ref={attachFileRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv"
              data-testid="input-create-bill-attachment"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                if (!file) { setPendingFile(null); return; }
                if (file.type && !ALLOWED_ATTACH_TYPES.has(file.type)) {
                  toast({ title: "File type not allowed. Permitted: PDF, images, Word, Excel, CSV.", variant: "destructive" });
                  if (attachFileRef.current) attachFileRef.current.value = "";
                  return;
                }
                if (file.size > 20 * 1024 * 1024) {
                  toast({ title: "File exceeds the 20 MB limit.", variant: "destructive" });
                  if (attachFileRef.current) attachFileRef.current.value = "";
                  return;
                }
                setPendingFile(file);
              }}
            />
            {pendingFile ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded border text-sm">
                <Paperclip className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="flex-1 truncate font-medium">{pendingFile.name}</span>
                <button
                  type="button"
                  onClick={() => { setPendingFile(null); if (attachFileRef.current) attachFileRef.current.value = ""; }}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  data-testid="button-remove-attachment"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => attachFileRef.current?.click()}
                data-testid="button-pick-attachment"
              >
                <Paperclip className="w-3.5 h-3.5 mr-1.5" /> Choose file…
              </Button>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={resetCreateDialog}>Cancel</Button>
            <Button
              disabled={!form.vendorId || !form.description || !form.amount || !form.scheduledDate || isSubmitting}
              onClick={() => void handleSubmitBill()}
              data-testid="button-confirm-create-bill"
            >
              {isSubmitting ? "Submitting..." : "Submit Bill"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
