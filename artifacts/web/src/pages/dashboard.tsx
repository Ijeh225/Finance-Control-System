import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useViewingAs } from "@/context/ViewingAsContext";
import {
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetScheduledToday, getGetScheduledTodayQueryKey,
  useGetScheduledTomorrow, getGetScheduledTomorrowQueryKey,
  useGetRecentActivity, getGetRecentActivityQueryKey,
  useGetWalletBalances, getGetWalletBalancesQueryKey,
  useListUsers, getListUsersQueryKey,
  useGetDashboardCashflow, getGetDashboardCashflowQueryKey,
} from "@workspace/api-client-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { formatCurrency, formatDateTime, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, AlertCircle, Clock, Wallet, CheckCircle2, CalendarClock, ArrowRight, User, DollarSign, SplitSquareHorizontal, BarChart3, Users, History } from "lucide-react";
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
  const isMd = user?.role === "md";
  const { selectedUserId, setSelectedUser, clearSelectedUser } = useViewingAs();

  // For non-MD users, always scope to own data. For MD, use the selected assistant (or undefined = all).
  const scopedUserId = isMd ? selectedUserId : user?.id;
  const params = scopedUserId ? { userId: scopedUserId } : undefined;

  const { data: usersData } = useListUsers({
    query: { queryKey: getListUsersQueryKey(), enabled: isMd },
  });
  const assistants = (usersData?.users ?? []).filter(u => u.isActive && u.role === "payment_assistant");
  const selectedAssistant = assistants.find(a => a.id === selectedUserId);

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary(params, {
    query: { queryKey: getGetDashboardSummaryQueryKey(params) },
  });
  const { data: scheduledToday, isLoading: todayLoading } = useGetScheduledToday(params, {
    query: { queryKey: getGetScheduledTodayQueryKey(params) },
  });
  const { data: scheduledTomorrow, isLoading: tomorrowLoading } = useGetScheduledTomorrow(params, {
    query: { queryKey: getGetScheduledTomorrowQueryKey(params) },
  });
  const { data: activityData, isLoading: activityLoading } = useGetRecentActivity(
    { limit: 15, ...(params ?? {}) },
    { query: { queryKey: getGetRecentActivityQueryKey({ limit: 15, ...(params ?? {}) }) } }
  );
  const { data: walletsData, isLoading: walletsLoading } = useGetWalletBalances({
    query: { queryKey: getGetWalletBalancesQueryKey() },
  });

  const cashflowParams = { days: 30, ...(params ?? {}) };
  const { data: cashflowData, isLoading: cashflowLoading } = useGetDashboardCashflow(cashflowParams, {
    query: { queryKey: getGetDashboardCashflowQueryKey(cashflowParams) },
  });

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Command Center</h1>
          <p className="text-muted-foreground text-sm font-medium">
            Good day, <span className="text-foreground font-semibold">{user?.name}</span>. Real-time treasury overview.
          </p>
        </div>
        {selectedAssistant && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-semibold self-start">
            <User className="w-3.5 h-3.5" />
            Viewing {selectedAssistant.name}&apos;s data
          </div>
        )}
      </div>

      {/* MD Assistant View Switcher */}
      {isMd && assistants.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Users className="w-3.5 h-3.5" /> View As
          </div>
          <div className="flex flex-wrap gap-2" data-testid="assistant-view-switcher">
            <button
              onClick={clearSelectedUser}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                !selectedUserId
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
              }`}
              data-testid="view-all"
            >
              All Assistants
            </button>
            {assistants.map(a => (
              <button
                key={a.id}
                onClick={() => selectedUserId === a.id ? clearSelectedUser() : setSelectedUser(a.id, a.name ?? a.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  selectedUserId === a.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                }`}
                data-testid={`view-assistant-${a.id}`}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>
      )}


      {/* Summary Cards — 9-card KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {summaryLoading || !summary ? (
          Array.from({ length: 9 }).map((_, i) => (
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
            {/* Row 1 */}
            <Link href="/pending-approvals" className="block group" data-testid="card-pending-approval">
              <Card className="shadow-sm border-primary/20 bg-primary/5 group-hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-primary">Pending Approval</CardTitle>
                  <Clock className="w-4 h-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{formatCurrency(summary.pendingApprovalAmount)}</div>
                  <p className="text-xs text-muted-foreground font-medium mt-1">{summary.pendingApprovalCount} bill{summary.pendingApprovalCount !== 1 ? "s" : ""} await action</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/scheduled-today" className="block group" data-testid="card-scheduled-today">
              <Card className="shadow-sm group-hover:border-primary/30 transition-colors cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scheduled Today</CardTitle>
                  <CalendarClock className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{formatCurrency(summary.scheduledTodayAmount)}</div>
                  <p className="text-xs text-muted-foreground font-medium mt-1">{summary.scheduledTodayCount} payment{summary.scheduledTodayCount !== 1 ? "s" : ""} due</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/scheduled-tomorrow" className="block group" data-testid="card-scheduled-tomorrow">
              <Card className="shadow-sm group-hover:border-primary/30 transition-colors cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scheduled Tomorrow</CardTitle>
                  <CalendarClock className="w-4 h-4 text-muted-foreground/60" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{formatCurrency(summary.scheduledTomorrowAmount)}</div>
                  <p className="text-xs text-muted-foreground font-medium mt-1">{summary.scheduledTomorrowCount} payment{summary.scheduledTomorrowCount !== 1 ? "s" : ""} due tomorrow</p>
                </CardContent>
              </Card>
            </Link>

            {/* Row 2 */}
            <Link href="/bills?status=approved" className="block group" data-testid="card-approved-unpaid">
              <Card className="shadow-sm border-emerald-500/20 bg-emerald-500/5 group-hover:border-emerald-500/40 transition-colors cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Approved &amp; Unpaid</CardTitle>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{formatCurrency(summary.approvedUnpaidAmount)}</div>
                  <p className="text-xs text-muted-foreground font-medium mt-1">{summary.approvedUnpaidCount} bill{summary.approvedUnpaidCount !== 1 ? "s" : ""} ready to pay</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/outstanding" className="block group" data-testid="card-outstanding">
              <Card className="shadow-sm border-rose-500/20 bg-rose-500/5 group-hover:border-rose-500/40 transition-colors cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-rose-700">Outstanding Liabilities</CardTitle>
                  <BarChart3 className="w-4 h-4 text-rose-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{formatCurrency(summary.totalOutstandingLiabilities)}</div>
                  <p className="text-xs text-muted-foreground font-medium mt-1">Total unpaid vendor debt</p>
                </CardContent>
              </Card>
            </Link>


            {/* Row 3 */}
            <Link href="/wallets" className="block group" data-testid="card-wallet-balance">
              <Card className="shadow-sm group-hover:border-primary/30 transition-colors cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Wallet Balances</CardTitle>
                  <Wallet className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{formatCurrency(summary.totalWalletBalance ?? 0)}</div>
                  <p className="text-xs text-muted-foreground font-medium mt-1">Across all accounts</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/bills?status=paid" className="block group" data-testid="card-paid-today">
              <Card className="shadow-sm border-teal-500/20 bg-teal-500/5 group-hover:border-teal-500/40 transition-colors cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-teal-700">Paid Today</CardTitle>
                  <DollarSign className="w-4 h-4 text-teal-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{formatCurrency(summary.paidTodayAmount)}</div>
                  <p className="text-xs text-muted-foreground font-medium mt-1">{summary.paidTodayCount} payment{summary.paidTodayCount !== 1 ? "s" : ""} disbursed</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/bills?status=partial" className="block group" data-testid="card-partial-payments">
              <Card className="shadow-sm border-violet-500/20 bg-violet-500/5 group-hover:border-violet-500/40 transition-colors cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-violet-700">Partial Payments</CardTitle>
                  <SplitSquareHorizontal className="w-4 h-4 text-violet-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{formatCurrency(summary.partialPaymentsAmount)}</div>
                  <p className="text-xs text-muted-foreground font-medium mt-1">{summary.partialPaymentsCount} bill{summary.partialPaymentsCount !== 1 ? "s" : ""} partially paid</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/payment-history" className="block group" data-testid="card-payment-history">
              <Card className="shadow-sm border-teal-500/20 group-hover:border-teal-500/40 transition-colors cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">All-Time Payments</CardTitle>
                  <History className="w-4 h-4 text-teal-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{formatCurrency(summary.paidAllTimeAmount ?? 0)}</div>
                  <p className="text-xs text-muted-foreground font-medium mt-1">{summary.paidAllTimeCount ?? 0} payment{(summary.paidAllTimeCount ?? 0) !== 1 ? "s" : ""} disbursed total</p>
                </CardContent>
              </Card>
            </Link>
          </>
        )}
      </div>

      {/* Cash-Flow Chart — 30-day spending trend */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm uppercase tracking-wider font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> 30-Day Cash Flow
          </CardTitle>
          <span className="text-xs text-muted-foreground font-medium">Daily payments disbursed</span>
        </CardHeader>
        <CardContent>
          {cashflowLoading || !cashflowData ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={cashflowData.data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="cashflowGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(d: string) => {
                    const [, m, day] = d.split("-");
                    return `${parseInt(day ?? "0")} ${["", "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m ?? "0")] ?? ""}`;
                  }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    v >= 1_000_000 ? `₦${(v / 1_000_000).toFixed(1)}M`
                    : v >= 1_000 ? `₦${(v / 1_000).toFixed(0)}K`
                    : `₦${v}`
                  }
                  width={64}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(d: string) => {
                    const dt = new Date(d + "T12:00:00");
                    return dt.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });
                  }}
                  formatter={(v: number) => [formatCurrency(v), "Paid"]}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#cashflowGradient)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

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
