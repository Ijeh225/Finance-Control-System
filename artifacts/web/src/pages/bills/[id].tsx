import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  useGetBill, getGetBillQueryKey,
  useGetBillComments, getGetBillCommentsQueryKey,
  useGetBillAudit, getGetBillAuditQueryKey,
  useApproveBill, useRejectBill, useHoldBill, usePartialApproveBill, useEscalateBill,
  useAddBillComment, useUpdateBill,
  getListBillsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDateTime, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, ArrowUpCircle,
  ChevronLeft, MessageSquare, Activity, User, Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  low: "bg-slate-100 text-slate-600 border-slate-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  urgent: "bg-red-50 text-red-700 border-red-200",
};

export default function BillDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [comment, setComment] = useState("");
  const [approveComment, setApproveComment] = useState("");
  const [rejectComment, setRejectComment] = useState("");
  const [holdComment, setHoldComment] = useState("");
  const [partialAmount, setPartialAmount] = useState("");
  const [partialComment, setPartialComment] = useState("");
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const { data: bill, isLoading: billLoading } = useGetBill(id!, {
    query: { enabled: !!id, queryKey: getGetBillQueryKey(id!) },
  });
  const { data: commentsData, isLoading: commentsLoading } = useGetBillComments(id!, {
    query: { enabled: !!id, queryKey: getGetBillCommentsQueryKey(id!) },
  });
  const { data: auditData, isLoading: auditLoading } = useGetBillAudit(id!, {
    query: { enabled: !!id, queryKey: getGetBillAuditQueryKey(id!) },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetBillQueryKey(id!) });
    qc.invalidateQueries({ queryKey: getGetBillCommentsQueryKey(id!) });
    qc.invalidateQueries({ queryKey: getGetBillAuditQueryKey(id!) });
    qc.invalidateQueries({ queryKey: getListBillsQueryKey() });
  };

  const approve = useApproveBill({
    mutation: {
      onSuccess: () => { invalidate(); setActiveAction(null); setApproveComment(""); toast({ title: "Bill approved" }); },
      onError: () => toast({ title: "Failed to approve bill", variant: "destructive" }),
    },
  });
  const reject = useRejectBill({
    mutation: {
      onSuccess: () => { invalidate(); setActiveAction(null); setRejectComment(""); toast({ title: "Bill rejected" }); },
      onError: () => toast({ title: "Failed to reject bill", variant: "destructive" }),
    },
  });
  const hold = useHoldBill({
    mutation: {
      onSuccess: () => { invalidate(); setActiveAction(null); setHoldComment(""); toast({ title: "Bill put on hold" }); },
      onError: () => toast({ title: "Failed to hold bill", variant: "destructive" }),
    },
  });
  const partialApprove = usePartialApproveBill({
    mutation: {
      onSuccess: () => { invalidate(); setActiveAction(null); setPartialAmount(""); setPartialComment(""); toast({ title: "Partial approval submitted" }); },
      onError: () => toast({ title: "Failed to partially approve", variant: "destructive" }),
    },
  });
  const escalate = useEscalateBill({
    mutation: {
      onSuccess: () => { invalidate(); setActiveAction(null); toast({ title: "Bill escalated" }); },
      onError: () => toast({ title: "Failed to escalate bill", variant: "destructive" }),
    },
  });
  const addComment = useAddBillComment({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetBillCommentsQueryKey(id!) }); setComment(""); },
      onError: () => toast({ title: "Failed to add comment", variant: "destructive" }),
    },
  });

  if (billLoading) {
    return (
      <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="p-10 text-center">
        <p className="text-muted-foreground">Bill not found.</p>
        <Button variant="outline" onClick={() => setLocation("/bills")} className="mt-4">Back to Bills</Button>
      </div>
    );
  }

  const isMd = user?.role === "md";
  const canAct = isMd && ["pending", "on_hold", "partial", "overdue"].includes(bill.status ?? "");

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/bills")} className="text-muted-foreground" data-testid="button-back-bills">
          <ChevronLeft className="w-4 h-4 mr-1" /> Bills
        </Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-bill-vendor">{bill.vendorName}</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">{bill.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded border ${PRIORITY_COLORS[bill.priority ?? "low"]}`}>{bill.priority}</span>
          <span className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded border ${STATUS_COLORS[bill.status ?? "pending"]}`} data-testid="status-bill">{bill.status?.replace("_", " ")}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Amount</p>
            <p className="text-2xl font-bold font-mono" data-testid="text-bill-amount">{formatCurrency(bill.amount ?? 0)}</p>
            {bill.approvedAmount != null && bill.approvedAmount !== bill.amount && (
              <p className="text-xs text-muted-foreground mt-1">Approved: {formatCurrency(bill.approvedAmount)}</p>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Due Date</p>
            <p className="text-lg font-bold">{formatDate(bill.dueDate)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Submitted By</p>
            <p className="text-lg font-bold">{bill.createdByName}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(bill.createdAt)}</p>
          </CardContent>
        </Card>
      </div>


      {canAct && (
        <Card className="shadow-sm border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wider font-semibold text-primary">MD Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setActiveAction(activeAction === "approve" ? null : "approve")} data-testid="button-approve-bill">
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setActiveAction(activeAction === "reject" ? null : "reject")} data-testid="button-reject-bill">
                <XCircle className="w-4 h-4 mr-1.5" /> Reject
              </Button>
              <Button size="sm" variant="outline" onClick={() => setActiveAction(activeAction === "hold" ? null : "hold")} data-testid="button-hold-bill">
                <Clock className="w-4 h-4 mr-1.5" /> Hold
              </Button>
              <Button size="sm" variant="outline" className="border-violet-300 text-violet-700 hover:bg-violet-50" onClick={() => setActiveAction(activeAction === "partial" ? null : "partial")} data-testid="button-partial-approve-bill">
                <ArrowUpCircle className="w-4 h-4 mr-1.5" /> Partial Approve
              </Button>
              {bill.status === "overdue" && (
                <Button size="sm" variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-50" onClick={() => setActiveAction(activeAction === "escalate" ? null : "escalate")} data-testid="button-escalate-bill">
                  <AlertTriangle className="w-4 h-4 mr-1.5" /> Escalate
                </Button>
              )}
            </div>

            {activeAction === "approve" && (
              <div className="space-y-3 pt-2 border-t">
                <Textarea placeholder="Optional approval comment..." value={approveComment} onChange={(e) => setApproveComment(e.target.value)} rows={2} />
                <div className="flex gap-2">
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={approve.isPending} onClick={() => approve.mutate({ id: id!, data: { comment: approveComment || undefined } })} data-testid="button-confirm-approve">
                    {approve.isPending ? "Approving..." : "Confirm Approve"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setActiveAction(null)}>Cancel</Button>
                </div>
              </div>
            )}
            {activeAction === "reject" && (
              <div className="space-y-3 pt-2 border-t">
                <Textarea placeholder="Reason for rejection..." value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} rows={2} />
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" disabled={reject.isPending} onClick={() => reject.mutate({ id: id!, data: { comment: rejectComment || undefined } })} data-testid="button-confirm-reject">
                    {reject.isPending ? "Rejecting..." : "Confirm Reject"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setActiveAction(null)}>Cancel</Button>
                </div>
              </div>
            )}
            {activeAction === "hold" && (
              <div className="space-y-3 pt-2 border-t">
                <Textarea placeholder="Reason for hold..." value={holdComment} onChange={(e) => setHoldComment(e.target.value)} rows={2} />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={hold.isPending} onClick={() => hold.mutate({ id: id!, data: { comment: holdComment || undefined } })} data-testid="button-confirm-hold">
                    {hold.isPending ? "Holding..." : "Confirm Hold"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setActiveAction(null)}>Cancel</Button>
                </div>
              </div>
            )}
            {activeAction === "partial" && (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex gap-3">
                  <Input type="number" placeholder="Approved amount (NGN)" value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} className="max-w-xs font-mono" data-testid="input-partial-amount" />
                </div>
                <Textarea placeholder="Optional comment..." value={partialComment} onChange={(e) => setPartialComment(e.target.value)} rows={2} />
                <div className="flex gap-2">
                  <Button size="sm" className="border-violet-300 bg-violet-600 hover:bg-violet-700 text-white" disabled={partialApprove.isPending || !partialAmount} onClick={() => partialApprove.mutate({ id: id!, data: { approvedAmount: Number(partialAmount), comment: partialComment || undefined } })} data-testid="button-confirm-partial">
                    {partialApprove.isPending ? "Submitting..." : "Submit Partial Approval"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setActiveAction(null)}>Cancel</Button>
                </div>
              </div>
            )}
            {activeAction === "escalate" && (
              <div className="space-y-3 pt-2 border-t">
                <Textarea placeholder="Escalation reason..." value={holdComment} onChange={(e) => setHoldComment(e.target.value)} rows={2} />
                <div className="flex gap-2">
                  <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" disabled={escalate.isPending} onClick={() => escalate.mutate({ id: id!, data: { comment: holdComment || undefined } })} data-testid="button-confirm-escalate">
                    {escalate.isPending ? "Escalating..." : "Confirm Escalate"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setActiveAction(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wider font-semibold flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" /> Comments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {commentsLoading ? (
              <div className="space-y-3">
                {[1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : !commentsData?.comments?.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">No comments yet.</p>
            ) : (
              <div className="space-y-3">
                {commentsData.comments.map((c) => (
                  <div key={c.id} className="p-3 bg-muted/40 rounded border border-border/50" data-testid={`comment-${c.id}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold">{c.authorName}</span>
                      <span className="text-xs text-muted-foreground font-mono">{formatDateTime(c.createdAt)}</span>
                    </div>
                    <p className="text-sm">{c.text}</p>
                  </div>
                ))}
              </div>
            )}
            <Separator />
            <div className="space-y-2">
              <Textarea placeholder="Add a comment..." value={comment} onChange={(e) => setComment(e.target.value)} rows={2} data-testid="input-comment" />
              <Button size="sm" disabled={!comment.trim() || addComment.isPending || !user} onClick={() => addComment.mutate({ id: id!, data: { text: comment, authorId: user!.id } })} data-testid="button-submit-comment">
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {addComment.isPending ? "Sending..." : "Send"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wider font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Audit Trail
            </CardTitle>
          </CardHeader>
          <CardContent>
            {auditLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : !auditData?.entries?.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">No audit entries yet.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {auditData.entries.map((entry) => (
                  <div key={entry.id} className="flex gap-3 py-2 border-b border-border/40 last:border-0" data-testid={`audit-${entry.id}`}>
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs"><span className="font-semibold">{entry.userName}</span> <span className="text-muted-foreground">{entry.action.replace(/_/g, " ")}</span></p>
                      <p className="text-xs text-muted-foreground font-mono">{formatDateTime(entry.createdAt)}</p>
                      {entry.details && (
                        <p className="text-xs text-muted-foreground mt-0.5">{entry.details}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
