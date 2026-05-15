import { useParams, useLocation } from "wouter";
import {
  useGetVendor, getGetVendorQueryKey,
  useGetVendorLiabilities, getGetVendorLiabilitiesQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Building2, Phone, Mail } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-600 border-red-500/20",
  on_hold: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  partial: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  paid: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  overdue: "bg-rose-500/10 text-rose-600 border-rose-500/20",
};

export default function VendorDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

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

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => setLocation("/vendors")} className="text-muted-foreground" data-testid="button-back-vendors">
        <ChevronLeft className="w-4 h-4 mr-1" /> Vendors
      </Button>

      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Building2 className="w-7 h-7 text-primary" />
        </div>
        <div className="flex-1">
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Total Paid</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(vendor.totalPaid ?? 0)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Outstanding Balance</p>
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

      {vendor.bills && vendor.bills.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wider font-semibold">Payment History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {vendor.bills.map((bill) => (
                <div key={bill.id} className="p-4 flex items-center justify-between" data-testid={`row-vendor-bill-${bill.id}`}>
                  <div>
                    <p className="text-sm font-semibold">{bill.description || "Bill"}</p>
                    <p className="text-xs text-muted-foreground font-mono">Due: {formatDate(bill.dueDate)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold font-mono">{formatCurrency(bill.amount ?? 0)}</span>
                    <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_COLORS[bill.status ?? "pending"]}`}>{bill.status?.replace("_", " ")}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
