import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useGetPaymentHistory, getGetPaymentHistoryQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, CheckCircle2, Wallet, User, Hash } from "lucide-react";

export default function PaymentHistory() {
  const { user } = useAuth();
  const userId = user?.role !== "md" ? user?.id : undefined;
  const params = userId ? { userId } : undefined;

  const { data, isLoading } = useGetPaymentHistory(params, {
    query: { queryKey: getGetPaymentHistoryQueryKey(params) },
  });

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="w-4 h-4" /> Dashboard
      </Link>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5 text-teal-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment History</h1>
          {!isLoading && data && (
            <p className="text-sm text-muted-foreground">
              {data.bills?.length ?? 0} payment{(data.bills?.length ?? 0) !== 1 ? "s" : ""} · {formatCurrency(data.total ?? 0)} total disbursed
            </p>
          )}
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="p-4 flex items-center justify-between">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-6 w-28" />
                </div>
              ))}
            </div>
          ) : !data?.bills?.length ? (
            <div className="p-16 text-center">
              <CheckCircle2 className="w-10 h-10 text-teal-500/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">No payments recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y">
              {data.bills.map(bill => (
                <Link key={bill.id} href={`/bills/${bill.id}`}>
                  <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-muted/30 transition-colors cursor-pointer group" data-testid={`row-history-${bill.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold group-hover:text-primary transition-colors">{bill.vendorName}</span>
                        <span className="text-xs text-muted-foreground truncate">{bill.description}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                        {bill.paidAt && (
                          <span className="font-mono">{formatDateTime(bill.paidAt as string)}</span>
                        )}
                        {bill.paidByName && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" /> {bill.paidByName}
                          </span>
                        )}
                        {bill.paidWalletName && (
                          <span className="flex items-center gap-1">
                            <Wallet className="w-3 h-3" /> {bill.paidWalletName}
                          </span>
                        )}
                        {bill.paymentReference && (
                          <span className="flex items-center gap-1 font-mono">
                            <Hash className="w-3 h-3" /> {bill.paymentReference}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="font-bold font-mono text-teal-700">{formatCurrency(bill.paidAmount ?? 0)}</p>
                        {bill.paidAmount !== bill.amount && (
                          <p className="text-xs text-muted-foreground font-mono">of {formatCurrency(bill.amount ?? 0)}</p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
