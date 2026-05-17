import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  useGetScheduledToday, getGetScheduledTodayQueryKey,
  useWithdrawBill, getListBillsQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CalendarClock, ChevronLeft, ChevronRight, CheckCircle2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-orange-50 text-orange-700",
  urgent: "bg-red-50 text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  partial: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  on_hold: "bg-sky-500/10 text-sky-600 border-sky-500/20",
};

export default function ScheduledToday() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isPA = user?.role !== "md";
  const userId = isPA ? user?.id : undefined;
  const params = userId ? { userId } : undefined;

  const { data, isLoading } = useGetScheduledToday(params, {
    query: { queryKey: getGetScheduledTodayQueryKey(params) },
  });

  const withdraw = useWithdrawBill({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetScheduledTodayQueryKey(params) });
        qc.invalidateQueries({ queryKey: getListBillsQueryKey() });
        toast({ title: "Bill removed from schedule" });
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error;
        toast({ title: msg ?? "Failed to remove bill", variant: "destructive" });
      },
    },
  });

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="w-4 h-4" /> Dashboard
      </Link>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <CalendarClock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scheduled Today</h1>
          {!isLoading && data && (
            <p className="text-sm text-muted-foreground">
              {data.bills?.length ?? 0} payment{(data.bills?.length ?? 0) !== 1 ? "s" : ""} · {formatCurrency(data.total ?? 0)} due today
            </p>
          )}
        </div>
      </div>

      <Card className="shadow-sm">
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
              <p className="text-sm text-muted-foreground font-medium">No payments scheduled for today.</p>
            </div>
          ) : (
            <div className="divide-y">
              {data.bills.map(bill => {
                const canRemove = isPA && bill.status === "pending" && bill.createdBy === user?.id;
                return (
                  <div
                    key={bill.id}
                    className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer group"
                    data-testid={`row-today-${bill.id}`}
                    onClick={() => navigate(`/bills/${bill.id}`)}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold group-hover:text-primary transition-colors">{bill.vendorName}</span>
                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${PRIORITY_COLORS[bill.priority ?? "low"]}`}>{bill.priority}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{bill.description}</p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">{formatDate(bill.scheduledDate ?? "")}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_COLORS[bill.status ?? "pending"] ?? "bg-muted text-muted-foreground border-border"}`}>{bill.status?.replace("_", " ")}</span>
                      <p className="font-bold font-mono">{formatCurrency(bill.amount ?? 0)}</p>
                      {canRemove && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50 shrink-0"
                          title="Remove from schedule"
                          data-testid={`button-remove-today-${bill.id}`}
                          disabled={withdraw.isPending}
                          onClick={e => { e.stopPropagation(); withdraw.mutate({ id: bill.id }); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
