import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetScheduledToday, getGetScheduledTodayQueryKey,
  useGetScheduledTomorrow, getGetScheduledTomorrowQueryKey,
  useGetOverdueBills, getGetOverdueBillsQueryKey,
  useGetRecentActivity, getGetRecentActivityQueryKey,
  useGetWalletBalances, getGetWalletBalancesQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency, formatDateTime, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, AlertCircle, Clock, Wallet, CheckCircle2, CalendarClock, ArrowRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export default function Dashboard() {
  const { user } = useAuth();
  const userId = user?.role !== "md" ? user?.id : undefined;
  const params = userId ? { userId } : undefined;

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary(params, {
    query: { queryKey: getGetDashboardSummaryQueryKey(params) },
  });
  const { data: scheduledToday, isLoading: todayLoading } = useGetScheduledToday(params, {
    query: { queryKey: getGetScheduledTodayQueryKey(params) },
  });
  const { data: scheduledTomorrow, isLoading: tomorrowLoading } = useGetScheduledTomorrow(params, {
    query: { queryKey: getGetScheduledTomorrowQueryKey(params) },
  });
  const { data: overdueData, isLoading: overdueLoading } = useGetOverdueBills(params, {
    query: { queryKey: getGetOverdueBillsQueryKey(params) },
  });
  const { data: activityData, isLoading: activityLoading } = useGetRecentActivity(
    { limit: 15, ...(params ?? {}) },
    { query: { queryKey: getGetRecentActivityQueryKey({ limit: 15, ...(params ?? {}) }) } }
  );
  const { data: walletsData, isLoading: walletsLoading } = useGetWalletBalances({
    query: { queryKey: getGetWalletBalancesQueryKey() },
  });

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Command Center</h1>
        <p className="text-muted-foreground text-sm font-medium">
          Good day, <span className="text-foreground font-semibold">{user?.name}</span>. Real-time treasury overview.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryLoading || !summary ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mb-1" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card className="shadow-sm border-primary/20 bg-primary/5" data-testid="card-pending-approval">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-primary">Pending Approval</CardTitle>
                <Clock className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">{formatCurrency(summary.pendingApprovalAmount)}</div>
                <p className="text-xs text-muted-foreground font-medium mt-1">{summary.pendingApprovalCount} bill{summary.pendingApprovalCount !== 1 ? "s" : ""} await action</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm" data-testid="card-scheduled-today">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scheduled Today</CardTitle>
                <CalendarClock className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">{formatCurrency(summary.scheduledTodayAmount)}</div>
                <p className="text-xs text-muted-foreground font-medium mt-1">{summary.scheduledTodayCount} payment{summary.scheduledTodayCount !== 1 ? "s" : ""} due</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm" data-testid="card-wallet-balance">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Wallet Funds</CardTitle>
                <Wallet className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">{formatCurrency(summary.totalWalletBalance ?? 0)}</div>
                <p className="text-xs text-muted-foreground font-medium mt-1">Across all accounts</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-destructive/20 bg-destructive/5" data-testid="card-overdue">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-destructive">Overdue</CardTitle>
                <AlertCircle className="w-4 h-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">{formatCurrency(summary.overdueAmount)}</div>
                <p className="text-xs text-muted-foreground font-medium mt-1">{summary.overdueCount} liabilit{summary.overdueCount !== 1 ? "ies" : "y"} past due</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — 2/3 width */}
        <div className="lg:col-span-2 space-y-6">

          {/* Today's Payments */}
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm uppercase tracking-wider font-semibold flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-primary" /> Due Today
              </CardTitle>
              <Link href="/bills?status=pending">
                <Button variant="ghost" size="sm" className="text-xs text-primary h-7">
                  View all <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {todayLoading ? (
                <div className="divide-y">
                  {[1,2,3].map(i => <div key={i} className="p-4 flex justify-between"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-20" /></div>)}
                </div>
              ) : !scheduledToday?.bills?.length ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No payments scheduled for today.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {scheduledToday.bills.slice(0, 5).map(bill => (
                    <Link key={bill.id} href={`/bills/${bill.id}`}>
                      <div className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer group" data-testid={`row-today-bill-${bill.id}`}>
                        <div>
                          <p className="font-semibold text-sm group-hover:text-primary transition-colors">{bill.vendorName}</p>
                          <p className="text-xs text-muted-foreground">{bill.description}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-bold font-mono text-sm">{formatCurrency(bill.amount ?? 0)}</span>
                          <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${PRIORITY_COLORS[bill.priority ?? "low"]}`}>{bill.priority}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                  {scheduledToday.bills.length > 5 && (
                    <div className="p-3 text-center">
                      <Link href="/bills"><span className="text-xs text-primary font-semibold hover:underline">+{scheduledToday.bills.length - 5} more</span></Link>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm uppercase tracking-wider font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {activityLoading ? (
                <div className="divide-y">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="p-4 flex gap-3">
                      <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                      <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
                    </div>
                  ))}
                </div>
              ) : !activityData?.activities?.length ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">No recent activity.</p>
                </div>
              ) : (
                <div className="divide-y max-h-80 overflow-y-auto">
                  {activityData.activities.map(entry => (
                    <div key={entry.id} className="p-4 flex gap-3" data-testid={`activity-${entry.id}`}>
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs">
                          <span className="font-semibold">{entry.userName}</span>{" "}
                          <span className="text-muted-foreground">{entry.action?.replace(/_/g, " ")}</span>
                        </p>
                        <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">{formatDateTime(entry.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column — 1/3 width */}
        <div className="space-y-6">
          {/* Overdue Bills */}
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm uppercase tracking-wider font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" /> Overdue
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {overdueLoading ? (
                <div className="space-y-2 p-4">
                  {[1,2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !overdueData?.bills?.length ? (
                <div className="p-6 text-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-500/40 mx-auto mb-1.5" />
                  <p className="text-xs text-muted-foreground">No overdue bills.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {overdueData.bills.slice(0, 4).map(bill => (
                    <Link key={bill.id} href={`/bills/${bill.id}`}>
                      <div className="p-3 hover:bg-muted/30 transition-colors cursor-pointer" data-testid={`row-overdue-bill-${bill.id}`}>
                        <p className="text-sm font-semibold truncate">{bill.vendorName}</p>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-xs text-muted-foreground">Due {formatDate(bill.dueDate)}</p>
                          <p className="text-xs font-bold font-mono text-destructive">{formatCurrency(bill.amount ?? 0)}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                  {overdueData.bills.length > 4 && (
                    <div className="p-3 text-center">
                      <Link href="/bills"><span className="text-xs text-primary font-semibold hover:underline">+{overdueData.bills.length - 4} more</span></Link>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Wallet Balances */}
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm uppercase tracking-wider font-semibold flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" /> Wallets
              </CardTitle>
              <Link href="/wallets">
                <Button variant="ghost" size="sm" className="text-xs text-primary h-7">
                  Manage <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {walletsLoading ? (
                <div className="space-y-2 p-4">
                  {[1,2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !walletsData?.wallets?.length ? (
                <div className="p-6 text-center">
                  <p className="text-xs text-muted-foreground">No wallets configured.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {walletsData.wallets.map(wallet => (
                    <div key={wallet.id} className="p-3 flex items-center justify-between" data-testid={`row-wallet-${wallet.id}`}>
                      <div>
                        <p className="text-sm font-semibold">{wallet.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{wallet.bankName}</p>
                      </div>
                      <p className="font-bold font-mono text-sm">{formatCurrency(wallet.balance ?? 0, wallet.currency ?? "NGN")}</p>
                    </div>
                  ))}
                  <div className="p-3 flex items-center justify-between bg-muted/30">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
                    <p className="font-bold font-mono">{formatCurrency(walletsData.totalBalance ?? 0)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tomorrow's Schedule */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-wider font-semibold flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-muted-foreground" /> Tomorrow
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {tomorrowLoading ? (
                <div className="p-4"><Skeleton className="h-8 w-full" /></div>
              ) : !scheduledTomorrow?.bills?.length ? (
                <div className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">Nothing scheduled tomorrow.</p>
                </div>
              ) : (
                <div className="p-4">
                  <p className="text-xl font-bold font-mono">{formatCurrency(scheduledTomorrow.total ?? 0)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{scheduledTomorrow.bills.length} payment{scheduledTomorrow.bills.length !== 1 ? "s" : ""} scheduled</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
