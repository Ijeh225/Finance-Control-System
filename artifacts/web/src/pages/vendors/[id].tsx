import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetVendor, getGetVendorQueryKey,
  useGetVendorLiabilities, getGetVendorLiabilitiesQueryKey,
  useUpdateBill, useDeleteVendor, useUpdateVendor,
  getListVendorsQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Building2, Phone, Mail, Download, Plus, Trash2, ExternalLink, Package, FileText, Link2, Pencil } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-600 border-red-500/20",
  on_hold: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  partial: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  paid: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  overdue: "bg-rose-500/10 text-rose-600 border-rose-500/20",
};

const ACTIVE_STATUSES = new Set(["pending", "approved", "partial", "on_hold", "overdue"]);

export default function VendorDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditVendor, setShowEditVendor] = useState(false);
  const emptyEditForm = () => ({ name: "", phone: "", email: "", bankName: "", accountNumber: "", containers: "", requestPurpose: "", relatedLink: "" });
  const [editVendorForm, setEditVendorForm] = useState(emptyEditForm());

  const updateVendor = useUpdateVendor({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetVendorQueryKey(id!) });
        queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
        setShowEditVendor(false);
        toast({ title: "Vendor updated" });
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error;
        toast({ title: msg ?? "Failed to update vendor", variant: "destructive" });
      },
    },
  });

  const deleteVendor = useDeleteVendor({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
        toast({ title: "Vendor deleted" });
        setLocation("/vendors");
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error;
        toast({ title: msg ?? "Failed to delete vendor", variant: "destructive" });
      },
    },
  });

  // Add Expense dialog state
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [addMode, setAddMode] = useState<"existing" | "new">("existing");
  const [addAmount, setAddAmount] = useState("");
  const [addNote, setAddNote] = useState("");
  const [addLink, setAddLink] = useState("");

  const { data: vendor, isLoading: vendorLoading } = useGetVendor(id!, {
    query: { enabled: !!id, queryKey: getGetVendorQueryKey(id!) },
  });
  const { data: liabilities, isLoading: liabLoading } = useGetVendorLiabilities(id!, {
    query: { enabled: !!id, queryKey: getGetVendorLiabilitiesQueryKey(id!) },
  });

  const updateBill = useUpdateBill({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetVendorQueryKey(id!) });
        queryClient.invalidateQueries({ queryKey: getGetVendorLiabilitiesQueryKey(id!) });
        setShowAddExpense(false);
        setAddAmount("");
        setAddNote("");
        setAddLink("");
        toast({ title: "Expense added to existing bill" });
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error;
        toast({ title: msg ?? "Failed to update bill", variant: "destructive" });
      },
    },
  });

  if (vendorLoading) {
    return (
      <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="p-10 text-center">
        <p className="text-muted-foreground">Vendor not found.</p>
        <Button variant="outline" onClick={() => setLocation("/vendors")} className="mt-4">Back</Button>
      </div>
    );
  }

  const canAddJob = user?.role === "payment_assistant" || user?.role === "md";

  const sortedBills = vendor.bills ? [...vendor.bills].sort((a, b) => {
    const aActive = ACTIVE_STATUSES.has(a.status ?? "");
    const bActive = ACTIVE_STATUSES.has(b.status ?? "");
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return 0;
  }) : [];

  // Any active bill is a candidate to add an expense to (prefer pending, then on_hold/overdue)
  const targetActiveBill = sortedBills.find(b => b.status === "pending")
    ?? sortedBills.find(b => b.status === "on_hold" || b.status === "overdue")
    ?? sortedBills.find(b => ACTIVE_STATUSES.has(b.status ?? ""));

  const openAddExpense = () => {
    setAddMode(targetActiveBill ? "existing" : "new");
    setAddAmount("");
    setAddNote("");
    setAddLink("");
    setShowAddExpense(true);
  };

  const handleAddExpenseConfirm = () => {
    if (addMode === "new" || !targetActiveBill) {
      setShowAddExpense(false);
      setLocation(`/bills?create=1&vendorId=${id}`);
      return;
    }
    const extra = Number(addAmount);
    if (!extra || extra <= 0) return;
    const newTotal = Number(targetActiveBill.amount ?? 0) + extra;
    updateBill.mutate({
      id: targetActiveBill.id!,
      data: {
        amount: newTotal,
        ...(addNote ? { notes: addNote } : {}),
        ...(addLink ? { link: addLink } : {}),
      },
    });
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => setLocation("/vendors")} className="text-muted-foreground" data-testid="button-back-vendors">
        <ChevronLeft className="w-4 h-4 mr-1" /> Vendors
      </Button>

      <div className="flex items-start gap-4 flex-wrap">
        <div className="w-14 h-14 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Building2 className="w-7 h-7 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{vendor.name}</h1>
          <div className="flex flex-wrap items-center gap-4 mt-1.5">
            {vendor.email && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="w-3.5 h-3.5" /> {vendor.email}
              </span>
            )}
            {vendor.phone && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="w-3.5 h-3.5" /> {vendor.phone}
              </span>
            )}
            {(vendor as any).containers && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Package className="w-3.5 h-3.5" /> {(vendor as any).containers}
              </span>
            )}
            {(vendor as any).requestPurpose && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileText className="w-3.5 h-3.5" /> {(vendor as any).requestPurpose}
              </span>
            )}
            {(vendor as any).relatedLink && (
              <a
                href={(vendor as any).relatedLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink className="w-3.5 h-3.5" /> Related Doc
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {canAddJob && (
            <Link href={`/bills?create=1&vendorId=${id}`}>
              <Button size="sm" className="font-semibold" data-testid="button-add-job">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Job
              </Button>
            </Link>
          )}
          <Button
            size="sm"
            variant="outline"
            data-testid="button-edit-vendor"
            onClick={() => {
              setEditVendorForm({
                name: vendor.name ?? "",
                phone: vendor.phone ?? "",
                email: vendor.email ?? "",
                bankName: vendor.bankName ?? "",
                accountNumber: vendor.accountNumber ?? "",
                containers: (vendor as any).containers ?? "",
                requestPurpose: (vendor as any).requestPurpose ?? "",
                relatedLink: (vendor as any).relatedLink ?? "",
              });
              setShowEditVendor(true);
            }}
          >
            <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
          </Button>
          {user?.role === "md" && (
            <Button
              size="sm"
              variant="destructive"
              disabled={deleteVendor.isPending}
              data-testid="button-delete-vendor"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
            </Button>
          )}
          <a href={`/api/export/vendors/${id}/statement?format=excel`} download data-testid="button-export-vendor-excel">
            <Button size="sm" variant="outline" className="text-xs">
              <Download className="w-3.5 h-3.5 mr-1.5" /> Excel
            </Button>
          </a>
          <a href={`/api/export/vendors/${id}/statement?format=pdf`} download data-testid="button-export-vendor-pdf">
            <Button size="sm" variant="outline" className="text-xs">
              <Download className="w-3.5 h-3.5 mr-1.5" /> PDF
            </Button>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Total Billed</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(vendor.totalBilled ?? 0)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Total Paid</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(vendor.totalPaid ?? 0)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Outstanding</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(vendor.outstandingBalance ?? 0)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Bank Details</p>
            {vendor.bankName ? (
              <>
                <p className="text-sm font-semibold">{vendor.bankName}</p>
                <p className="text-xs text-muted-foreground font-mono">{vendor.accountNumber}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not provided</p>
            )}
          </CardContent>
        </Card>
      </div>

      {!liabLoading && liabilities && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wider font-semibold">Liability Aging</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "0–7 Days", value: liabilities.aging0to7 },
                { label: "8–14 Days", value: liabilities.aging8to14 },
                { label: "15–30 Days", value: liabilities.aging15to30 },
                { label: "30+ Days", value: liabilities.aging30plus },
              ].map(({ label, value }) => (
                <div key={label} className="text-center p-3 bg-muted/40 rounded-md">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-sm font-bold font-mono">{formatCurrency(value ?? 0)}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t text-right">
              <span className="text-xs font-semibold uppercase text-muted-foreground mr-2">Total Outstanding</span>
              <span className="text-lg font-bold font-mono">{formatCurrency(liabilities.totalOutstanding ?? 0)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {sortedBills.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm uppercase tracking-wider font-semibold">Expense Ledger</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Every expense added for this vendor accumulates here. Outstanding balance reflects what remains unpaid across all jobs.</p>
              </div>
              {canAddJob && (
                <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={openAddExpense} data-testid="button-add-job-ledger">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Expense
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {sortedBills.map((bill) => {
                const outstanding = Number(bill.outstandingBalance ?? 0);
                const paid = Number(bill.paidAmount ?? 0);
                return (
                  <Link key={bill.id} href={`/bills/${bill.id}`}>
                    <div className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer group" data-testid={`row-vendor-bill-${bill.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold group-hover:text-primary transition-colors">{bill.description || "Expense"}</p>
                        {(bill as any).notes && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 flex items-start gap-1">
                            <FileText className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground/60" />
                            {(bill as any).notes}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 mt-0.5 text-xs text-muted-foreground font-mono">
                          <span>Sched: {formatDate(bill.scheduledDate)}</span>
                          <span>Due: {formatDate(bill.dueDate)}</span>
                          {(bill as any).link && (
                            <span className="flex items-center gap-0.5 text-primary/70">
                              <Link2 className="w-3 h-3" /> Link
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="font-bold font-mono">{formatCurrency(bill.amount ?? 0)}</span>
                          {paid > 0 && paid < Number(bill.amount ?? 0) && (
                            <p className="text-xs text-teal-600 font-mono">Paid: {formatCurrency(paid)}</p>
                          )}
                          {outstanding > 0 && bill.status !== "paid" && (
                            <p className="text-xs text-amber-600 font-semibold font-mono">Owing: {formatCurrency(outstanding)}</p>
                          )}
                          {bill.status === "paid" && (
                            <p className="text-xs text-teal-600 font-mono">Cleared</p>
                          )}
                        </div>
                        <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_COLORS[bill.status ?? "pending"]}`}>{bill.status?.replace("_", " ")}</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
            <div className="border-t bg-muted/30 px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{sortedBills.length} expense{sortedBills.length !== 1 ? "s" : ""} · Running Total</span>
              <div className="flex items-center gap-6 text-sm">
                <span className="text-muted-foreground font-mono">Billed: <span className="font-bold text-foreground">{formatCurrency(vendor.totalBilled ?? 0)}</span></span>
                <span className="text-teal-700 font-mono">Paid: <span className="font-bold">{formatCurrency(vendor.totalPaid ?? 0)}</span></span>
                <span className="text-amber-700 font-mono font-semibold">Outstanding: <span className="font-bold">{formatCurrency(vendor.outstandingBalance ?? 0)}</span></span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Expense Dialog */}
      <Dialog open={showAddExpense} onOpenChange={setShowAddExpense}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Expense — {vendor.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-1">
            {/* Mode selection — shown whenever an active bill exists */}
            {targetActiveBill && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Where should this expense go?</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAddMode("existing")}
                    className={`rounded-lg border p-3 text-left transition-colors ${addMode === "existing" ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/40"}`}
                  >
                    <p className="text-sm font-semibold">Add to existing bill</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono capitalize">{formatCurrency(targetActiveBill.amount ?? 0)} · {(targetActiveBill.status ?? "").replace("_", " ")}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddMode("new")}
                    className={`rounded-lg border p-3 text-left transition-colors ${addMode === "new" ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/40"}`}
                  >
                    <p className="text-sm font-semibold">Create new bill</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Separate payment request</p>
                  </button>
                </div>
              </div>
            )}

            {/* Existing bill summary */}
            {addMode === "existing" && targetActiveBill && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm space-y-1">
                <p className="font-semibold text-amber-900">{targetActiveBill.description || "Existing bill"}</p>
                <p className="text-xs text-amber-700 font-mono">Current amount: {formatCurrency(targetActiveBill.amount ?? 0)}</p>
                {addAmount && Number(addAmount) > 0 && (
                  <p className="text-xs font-semibold text-amber-800 font-mono border-t border-amber-200 pt-1 mt-1">
                    New total: {formatCurrency(Number(targetActiveBill.amount ?? 0) + Number(addAmount))}
                  </p>
                )}
              </div>
            )}

            {/* Amount + Notes + Link — shown for "add to existing" mode */}
            {addMode === "existing" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Additional Amount (NGN) *</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 4563"
                    value={addAmount}
                    onChange={e => setAddAmount(e.target.value)}
                    className="font-mono"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Notes / Job Description (optional)</Label>
                  <Textarea
                    placeholder="What is this charge for? Job reference, container details, remarks…"
                    value={addNote}
                    onChange={e => setAddNote(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Invoice / Document Link (optional)</Label>
                  <Input
                    type="url"
                    placeholder="https://drive.google.com/… or invoice URL"
                    value={addLink}
                    onChange={e => setAddLink(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* CTA */}
            <div className="flex gap-2 pt-1">
              {addMode === "existing" ? (
                <Button
                  className="flex-1"
                  disabled={!addAmount || Number(addAmount) <= 0 || updateBill.isPending}
                  onClick={handleAddExpenseConfirm}
                >
                  {updateBill.isPending ? "Saving…" : `Add ${addAmount ? formatCurrency(Number(addAmount)) : "amount"} to bill`}
                </Button>
              ) : (
                <Button className="flex-1" onClick={handleAddExpenseConfirm}>
                  Continue to new bill
                </Button>
              )}
              <Button variant="outline" onClick={() => setShowAddExpense(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Vendor Dialog */}
      <Dialog open={showEditVendor} onOpenChange={setShowEditVendor}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Vendor — {vendor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Vendor Name *</Label>
                <Input value={editVendorForm.name} onChange={e => setEditVendorForm(f => ({ ...f, name: e.target.value }))} placeholder="Vendor or company name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Phone</Label>
                <Input value={editVendorForm.phone} onChange={e => setEditVendorForm(f => ({ ...f, phone: e.target.value }))} placeholder="+234 …" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Email</Label>
                <Input type="email" value={editVendorForm.email} onChange={e => setEditVendorForm(f => ({ ...f, email: e.target.value }))} placeholder="vendor@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Bank Name</Label>
                <Input value={editVendorForm.bankName} onChange={e => setEditVendorForm(f => ({ ...f, bankName: e.target.value }))} placeholder="GTBank, Access, etc." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Account Number</Label>
                <Input value={editVendorForm.accountNumber} onChange={e => setEditVendorForm(f => ({ ...f, accountNumber: e.target.value }))} placeholder="0123456789" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Containers</Label>
                <Input value={editVendorForm.containers} onChange={e => setEditVendorForm(f => ({ ...f, containers: e.target.value }))} placeholder="e.g. 3×40ft" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Request Purpose</Label>
                <Input value={editVendorForm.requestPurpose} onChange={e => setEditVendorForm(f => ({ ...f, requestPurpose: e.target.value }))} placeholder="e.g. Port clearance" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Related Link</Label>
                <Input type="url" value={editVendorForm.relatedLink} onChange={e => setEditVendorForm(f => ({ ...f, relatedLink: e.target.value }))} placeholder="https://…" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowEditVendor(false)} disabled={updateVendor.isPending}>Cancel</Button>
            <Button
              disabled={!editVendorForm.name || updateVendor.isPending}
              data-testid="button-confirm-edit-vendor"
              onClick={() => updateVendor.mutate({ id: id!, data: {
                name: editVendorForm.name,
                phone: editVendorForm.phone || undefined,
                email: editVendorForm.email || undefined,
                bankName: editVendorForm.bankName || undefined,
                accountNumber: editVendorForm.accountNumber || undefined,
                containers: editVendorForm.containers || undefined,
                requestPurpose: editVendorForm.requestPurpose || undefined,
                relatedLink: editVendorForm.relatedLink || undefined,
              }})}
            >
              {updateVendor.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Vendor Confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Vendor?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete <strong>{vendor?.name}</strong>. Vendors with active bills (pending, approved, partial, on hold, or overdue) cannot be deleted — resolve those bills first.
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleteVendor.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteVendor.isPending}
              data-testid="button-confirm-delete-vendor"
              onClick={() => deleteVendor.mutate({ id: id! })}
            >
              {deleteVendor.isPending ? "Deleting…" : "Yes, Delete Vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
