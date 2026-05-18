import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useEffectiveUserId } from "@/context/ViewingAsContext";
import { useGetOverdueBills, getGetOverdueBillsQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";

export default function OverdueBills() {
  const { user } = useAuth();
  const userId = useEffectiveUserId(user?.role, user?.id);
  const params = userId ? { userId } : undefined;

  const { data, isLoading } = useGetOverdueBills(params, {
    query: { queryKey: getGetOverdueBillsQueryKey(params) },
  });

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="w-4 h-4" /> Dashboard
      </Link>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="w-5 h-5 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overdue Bills</h1>
          {!isLoading && data && (
            <p className="text-sm text-muted-foreground">
              {data.bills?.length ?? 0} overdue bill{(data.bills?.length ?? 0) !== 1 ? "s" : ""} · {formatCurrency(data.total ?? 0)} outstanding
            </p>
          )}
        </div>
      </div>

      <Card className="shadow-sm border-destructive/20">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {[1,2,3].map(i => (
                <div key={i} className="p-4 flex items-center justify-between">
                  <div className="space-y-1.5"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-32" /></div>
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </div>
          ) : !data?.bills?.length ? (
            <div className="p-16 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">No overdue bills. Great work!</p>
            </div>
          ) : (
            <div className="divide-y">
              {data.bills.map(bill => (
                <Link key={bill.id} href={`/bills/${bill.id}`}>
                  <div className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer group" data-testid={`row-overdue-${bill.id}`}>
                    <div>
                      <span className="font-semibold group-hover:text-primary transition-colors">{bill.vendorName}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{bill.description}</p>
                      <p className="text-xs text-destructive font-medium mt-0.5">Due {formatDate(bill.dueDate)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <p className="font-bold font-mono text-destructive">{formatCurrency(bill.amount ?? 0)}</p>
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
