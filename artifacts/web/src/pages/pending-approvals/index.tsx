import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useEffectiveUserId } from "@/context/ViewingAsContext";
import { useGetPendingApprovals, getGetPendingApprovalsQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, ChevronLeft, ChevronRight } from "lucide-react";

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

export default function PendingApprovals() {
  const { user } = useAuth();
  const userId = useEffectiveUserId(user?.role, user?.id);
  const params = userId ? { userId } : undefined;

  const { data, isLoading } = useGetPendingApprovals(params, {
    query: { queryKey: getGetPendingApprovalsQueryKey(params) },
  });

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="w-4 h-4" /> Dashboard
      </Link>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <Clock className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pending Approvals</h1>
          {!isLoading && data && (
            <p className="text-sm text-muted-foreground">
              {data.count} bill{data.count !== 1 ? "s" : ""} · {formatCurrency(data.total)} total
            </p>
          )}
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {[1,2,3,4].map(i => (
                <div key={i} className="p-4 flex items-center justify-between">
                  <div className="space-y-1.5"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-32" /></div>
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </div>
          ) : !data?.bills?.length ? (
            <div className="p-16 text-center">
              <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">No pending approvals.</p>
            </div>
          ) : (
            <div className="divide-y">
              {data.bills.map(bill => (
                <Link key={bill.id} href={`/bills/${bill.id}`}>
                  <div className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer group" data-testid={`row-pending-${bill.id}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold group-hover:text-primary transition-colors">{bill.vendorName}</span>
                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${PRIORITY_COLORS[bill.priority ?? "low"]}`}>{bill.priority}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{bill.description} · Due {formatDate(bill.dueDate)}</p>
                      {bill.createdByName && <p className="text-xs text-muted-foreground/70">{bill.createdByName}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="font-bold font-mono">{formatCurrency(bill.amount ?? 0)}</p>
                        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${STATUS_COLORS[bill.status ?? "pending"]}`}>{bill.status?.replace("_", " ")}</span>
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
