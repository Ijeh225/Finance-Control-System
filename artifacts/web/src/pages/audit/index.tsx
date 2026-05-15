import { useAuth } from "@/context/AuthContext";
import { useListAuditTrail, getListAuditTrailQueryKey } from "@workspace/api-client-react";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Activity, User, Lock } from "lucide-react";
import { Link } from "wouter";

const ACTION_COLORS: Record<string, string> = {
  approved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-700 border-red-500/20",
  on_hold: "bg-sky-500/10 text-sky-700 border-sky-500/20",
  partial_approved: "bg-violet-500/10 text-violet-700 border-violet-500/20",
  escalated: "bg-orange-500/10 text-orange-700 border-orange-500/20",
  created: "bg-slate-500/10 text-slate-700 border-slate-500/20",
  updated: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  commented: "bg-teal-500/10 text-teal-700 border-teal-500/20",
};

export default function Audit() {
  const { user } = useAuth();

  const { data, isLoading } = useListAuditTrail(undefined, {
    query: { queryKey: getListAuditTrailQueryKey() },
  });

  if (user?.role !== "md") {
    return (
      <div className="p-10 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Lock className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <h3 className="text-xl font-bold">Access Restricted</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">The audit log is only accessible to the MD.</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Activity className="w-7 h-7 text-primary" />
          Audit Log
        </h1>
        <p className="text-muted-foreground text-sm font-medium">Complete record of all treasury actions.</p>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="p-4 flex gap-3">
                  <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-6 w-20 shrink-0" />
                </div>
              ))}
            </div>
          ) : !data?.entries?.length ? (
            <div className="p-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Activity className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-bold">No audit entries</h3>
              <p className="text-sm text-muted-foreground mt-2">Actions will appear here as users work in the system.</p>
            </div>
          ) : (
            <div className="divide-y">
              {data.entries.map((entry) => {
                const actionKey = entry.action?.toLowerCase().replace(/ /g, "_");
                return (
                  <div key={entry.id} className="p-4 flex gap-4 hover:bg-muted/20 transition-colors" data-testid={`audit-entry-${entry.id}`}>
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="font-semibold text-sm">{entry.userName}</span>
                        <span className="text-sm text-muted-foreground">{entry.action?.replace(/_/g, " ")}</span>
                        {entry.billId && (
                          <Link href={`/bills/${entry.billId}`} className="text-xs text-primary font-semibold hover:underline">
                            bill
                          </Link>
                        )}
                      </div>
                      {entry.details && (
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">{entry.details}</p>
                      )}
                      <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">{formatDateTime(entry.createdAt)}</p>
                    </div>
                    <div className="shrink-0">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${ACTION_COLORS[actionKey ?? ""] ?? "bg-muted text-muted-foreground border-border"}`}>
                        {entry.action?.replace(/_/g, " ")}
                      </span>
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
