import { useParams, useLocation } from "wouter";
import {
  useGetVendor, getGetVendorQueryKey,
  useGetVendorLiabilities, getGetVendorLiabilitiesQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Building2, Phone, Mail, Download, Plus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Link } from "wouter";

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

  const { data: vendor, isLoading: vendorLoading } = useGetVendor(id!, {
    query: { enabled: !!id, queryKey: getGetVendorQueryKey(id!) },
  });
  const { data: liabilities, isLoading: liabLoading } = useGetVendorLiabilities(id!, {
    query: { enabled: !!id, queryKey: getGetVendorLiabilitiesQueryKey(id!) },
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
                <Link href={`/bills?create=1&vendorId=${id}`}>
                  <Button size="sm" variant="outline" className="shrink-0 text-xs" data-testid="button-add-job-ledger">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Expense
                  </Button>
                </Link>
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
                        <div className="flex flex-wrap items-center gap-x-3 mt-0.5 text-xs text-muted-foreground font-mono">
                          <span>Sched: {formatDate(bill.scheduledDate)}</span>
                          <span>Due: {formatDate(bill.dueDate)}</span>
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
    </div>
  );
}
