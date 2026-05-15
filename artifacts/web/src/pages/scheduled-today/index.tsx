import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useGetScheduledToday, getGetScheduledTodayQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-orange-50 text-orange-700",
  urgent: "bg-red-50 text-red-700",
};

export default function ScheduledToday() {
  const { user } = useAuth();
  const userId = user?.role !== "md" ? user?.id : undefined;
  const params = userId ? { userId } : undefined;

  const { data, isLoading } = useGetScheduledToday(params, {
    query: { queryKey: getGetScheduledTodayQueryKey(params) },
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
              {data.bills.map(bill => (
                <Link key={bill.id} href={`/bills/${bill.id}`}>
                  <div className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer group" data-testid={`row-today-${bill.id}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold group-hover:text-primary transition-colors">{bill.vendorName}</span>
                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${PRIORITY_COLORS[bill.priority ?? "low"]}`}>{bill.priority}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{bill.description}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <p className="font-bold font-mono">{formatCurrency(bill.amount ?? 0)}</p>
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
