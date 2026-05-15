import { useAuth } from "@/context/AuthContext";
import { useGetOutstandingLiabilities, getGetOutstandingLiabilitiesQueryKey } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { AlertCircle, ChevronLeft, FileBarChart } from "lucide-react";

export default function OutstandingLiabilities() {
  const { user } = useAuth();
  const userId = user?.role !== "md" ? user?.id : undefined;
  const params = userId ? { userId } : undefined;

  const { data, isLoading } = useGetOutstandingLiabilities(params, {
    query: { queryKey: getGetOutstandingLiabilitiesQueryKey(params) },
  });

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="w-4 h-4" /> Dashboard
      </Link>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
          <AlertCircle className="w-5 h-5 text-rose-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Outstanding Liabilities</h1>
          {!isLoading && data && (
            <p className="text-sm text-muted-foreground">
              {formatCurrency(data.totalOutstanding ?? 0)} total across {data.byVendor?.length ?? 0} vendor{(data.byVendor?.length ?? 0) !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider font-semibold text-muted-foreground">Aging by Vendor</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {[1,2,3,4].map(i => (
                <div key={i} className="p-4 flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ))}
            </div>
          ) : !data?.byVendor?.length ? (
            <div className="p-16 text-center">
              <FileBarChart className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">No outstanding liabilities.</p>
            </div>
          ) : (
            <>
              <div className="hidden md:grid grid-cols-[1fr_100px_100px_100px_100px_120px] gap-4 px-6 py-2 text-xs uppercase tracking-wider font-semibold text-muted-foreground border-b bg-muted/30">
                <span>Vendor</span>
                <span className="text-right">0–7d</span>
                <span className="text-right">8–14d</span>
                <span className="text-right">15–30d</span>
                <span className="text-right">30d+</span>
                <span className="text-right">Total</span>
              </div>
              <div className="divide-y">
                {data.byVendor.map(aging => (
                  <div key={aging.vendorId} className="px-6 py-3 grid grid-cols-1 md:grid-cols-[1fr_100px_100px_100px_100px_120px] gap-1 md:gap-4 items-center hover:bg-muted/20 transition-colors" data-testid={`row-outstanding-${aging.vendorId}`}>
                    <span className="font-semibold text-sm">{aging.vendorName}</span>
                    <span className="text-right text-xs font-mono text-muted-foreground">{formatCurrency(aging.aging0to7 ?? 0)}</span>
                    <span className="text-right text-xs font-mono text-muted-foreground">{formatCurrency(aging.aging8to14 ?? 0)}</span>
                    <span className="text-right text-xs font-mono text-amber-600">{formatCurrency(aging.aging15to30 ?? 0)}</span>
                    <span className="text-right text-xs font-mono text-rose-600">{formatCurrency(aging.aging30plus ?? 0)}</span>
                    <span className="text-right text-sm font-bold font-mono">{formatCurrency(aging.totalOutstanding ?? 0)}</span>
                  </div>
                ))}
              </div>
              <div className="px-6 py-4 border-t flex items-center justify-between bg-muted/30">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Outstanding</span>
                <span className="text-lg font-bold font-mono">{formatCurrency(data.totalOutstanding ?? 0)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
