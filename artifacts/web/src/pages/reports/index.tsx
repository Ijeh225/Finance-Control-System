import { useAuth } from "@/context/AuthContext";
import { useEffectiveUserId } from "@/context/ViewingAsContext";
import {
  useGetOutstandingLiabilities, getGetOutstandingLiabilitiesQueryKey,
  useGetPendingApprovals, getGetPendingApprovalsQueryKey,
  useGetPaidToday, getGetPaidTodayQueryKey,
  useGetPartialPayments, getGetPartialPaymentsQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileBarChart, AlertCircle, Clock, CheckCircle2, SplitSquareVertical, Download } from "lucide-react";
import { Link } from "wouter";
import type { Bill, LiabilityAging } from "@workspace/api-client-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-600 border-red-500/20",
  on_hold: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  partial: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  paid: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  overdue: "bg-rose-500/10 text-rose-600 border-rose-500/20",
};

function BillRow({ bill }: { bill: Bill }) {
  return (
    <Link href={`/bills/${bill.id}`}>
      <div className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer" data-testid={`row-report-bill-${bill.id}`}>
        <div>
          <p className="font-semibold text-sm">{bill.vendorName}</p>
          <p className="text-xs text-muted-foreground">{bill.description} · Due {formatDate(bill.dueDate)}</p>
          {bill.createdByName && <p className="text-xs text-muted-foreground/70">{bill.createdByName}</p>}
        </div>
        <div className="flex items-center gap-3">
          <p className="font-bold font-mono text-sm">{formatCurrency(bill.amount ?? 0)}</p>
          <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_COLORS[bill.status ?? "pending"]}`}>{bill.status?.replace("_", " ")}</span>
        </div>
      </div>
    </Link>
  );
}

function AgingRow({ aging }: { aging: LiabilityAging }) {
  return (
    <div className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors" data-testid={`row-aging-${aging.vendorId}`}>
      <p className="font-semibold text-sm">{aging.vendorName}</p>
      <div className="flex items-center gap-4 text-xs font-mono text-right">
        <span className="text-muted-foreground">{formatCurrency(aging.aging0to7)} <span className="text-muted-foreground/50">0–7d</span></span>
        <span className="text-muted-foreground">{formatCurrency(aging.aging8to14)} <span className="text-muted-foreground/50">8–14d</span></span>
        <span className="text-amber-600">{formatCurrency(aging.aging15to30)} <span className="text-muted-foreground/50">15–30d</span></span>
        <span className="text-rose-600">{formatCurrency(aging.aging30plus)} <span className="text-muted-foreground/50">30d+</span></span>
        <span className="font-bold text-foreground">{formatCurrency(aging.totalOutstanding)}</span>
      </div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="divide-y">
      {[1,2,3,4].map(i => (
        <div key={i} className="p-4 flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}

function ExportButtons({ reportType }: { reportType: string }) {
  return (
    <div className="flex items-center gap-2">
      <a href={`/api/export/reports/${reportType}?format=excel`} download>
        <Button size="sm" variant="outline" className="text-xs" data-testid={`button-export-excel-${reportType}`}>
          <Download className="w-3.5 h-3.5 mr-1.5" /> Excel
        </Button>
      </a>
      <a href={`/api/export/reports/${reportType}?format=pdf`} download>
        <Button size="sm" variant="outline" className="text-xs" data-testid={`button-export-pdf-${reportType}`}>
          <Download className="w-3.5 h-3.5 mr-1.5" /> PDF
        </Button>
      </a>
    </div>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const userId = useEffectiveUserId(user?.role, user?.id);
  const params = userId ? { userId } : undefined;

  const { data: outstanding, isLoading: l1 } = useGetOutstandingLiabilities(params, {
    query: { queryKey: getGetOutstandingLiabilitiesQueryKey(params) },
  });
  const { data: pending, isLoading: l2 } = useGetPendingApprovals(params, {
    query: { queryKey: getGetPendingApprovalsQueryKey(params) },
  });
  const { data: paidToday, isLoading: l3 } = useGetPaidToday(params, {
    query: { queryKey: getGetPaidTodayQueryKey(params) },
  });
  const { data: partial, isLoading: l4 } = useGetPartialPayments(params, {
    query: { queryKey: getGetPartialPaymentsQueryKey(params) },
  });

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Reports</h1>
        <p className="text-muted-foreground text-sm font-medium">Financial position and liability overview.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-rose-500" />
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Outstanding</p>
            </div>
            {l1 ? <Skeleton className="h-7 w-24" /> : <p className="text-xl font-bold font-mono" data-testid="text-outstanding-total">{formatCurrency(outstanding?.totalOutstanding ?? 0)}</p>}
            {!l1 && <p className="text-xs text-muted-foreground mt-0.5">{outstanding?.byVendor?.length ?? 0} vendors</p>}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Pending</p>
            </div>
            {l2 ? <Skeleton className="h-7 w-24" /> : <p className="text-xl font-bold font-mono">{formatCurrency(pending?.total ?? 0)}</p>}
            {!l2 && <p className="text-xs text-muted-foreground mt-0.5">{pending?.count ?? 0} bills</p>}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Paid Today</p>
            </div>
            {l3 ? <Skeleton className="h-7 w-24" /> : <p className="text-xl font-bold font-mono">{formatCurrency(paidToday?.total ?? 0)}</p>}
            {!l3 && <p className="text-xs text-muted-foreground mt-0.5">{paidToday?.bills?.length ?? 0} bills</p>}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-2">
              <SplitSquareVertical className="w-4 h-4 text-violet-500" />
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Partial</p>
            </div>
            {l4 ? <Skeleton className="h-7 w-24" /> : <p className="text-xl font-bold font-mono">{formatCurrency(partial?.total ?? 0)}</p>}
            {!l4 && <p className="text-xs text-muted-foreground mt-0.5">{partial?.bills?.length ?? 0} bills</p>}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="outstanding">
        <TabsList className="mb-4">
          <TabsTrigger value="outstanding" data-testid="tab-outstanding">Outstanding Liabilities</TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending">Pending Approvals</TabsTrigger>
          <TabsTrigger value="paid" data-testid="tab-paid">Paid Today</TabsTrigger>
          <TabsTrigger value="partial" data-testid="tab-partial">Partial Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="outstanding">
          <Card className="shadow-sm">
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500" /> Outstanding Liabilities by Vendor
                </CardTitle>
                <ExportButtons reportType="outstanding-liabilities" />
              </div>
            </CardHeader>
            <CardContent className="p-0 mt-3">
              {l1 ? <LoadingRows /> : !outstanding?.byVendor?.length ? (
                <div className="p-12 text-center">
                  <FileBarChart className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No outstanding liabilities.</p>
                </div>
              ) : (
                <div className="divide-y">{outstanding.byVendor.map(a => <AgingRow key={a.vendorId} aging={a} />)}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card className="shadow-sm">
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" /> Pending Approvals
                </CardTitle>
                <ExportButtons reportType="pending-approvals" />
              </div>
            </CardHeader>
            <CardContent className="p-0 mt-3">
              {l2 ? <LoadingRows /> : !pending?.bills?.length ? (
                <div className="p-12 text-center">
                  <FileBarChart className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No pending approvals.</p>
                </div>
              ) : (
                <div className="divide-y">{pending.bills.map(b => <BillRow key={b.id} bill={b} />)}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="paid">
          <Card className="shadow-sm">
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Paid Today
                </CardTitle>
                <ExportButtons reportType="paid-today" />
              </div>
            </CardHeader>
            <CardContent className="p-0 mt-3">
              {l3 ? <LoadingRows /> : !paidToday?.bills?.length ? (
                <div className="p-12 text-center">
                  <FileBarChart className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No payments made today.</p>
                </div>
              ) : (
                <div className="divide-y">{paidToday.bills.map(b => <BillRow key={b.id} bill={b} />)}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="partial">
          <Card className="shadow-sm">
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-2">
                  <SplitSquareVertical className="w-4 h-4 text-violet-500" /> Partial Payments
                </CardTitle>
                <ExportButtons reportType="partial-payments" />
              </div>
            </CardHeader>
            <CardContent className="p-0 mt-3">
              {l4 ? <LoadingRows /> : !partial?.bills?.length ? (
                <div className="p-12 text-center">
                  <FileBarChart className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No partial payments.</p>
                </div>
              ) : (
                <div className="divide-y">{partial.bills.map(b => <BillRow key={b.id} bill={b} />)}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
