import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  useGetBill, getGetBillQueryKey,
  useGetBillComments, getGetBillCommentsQueryKey,
  useGetBillAudit, getGetBillAuditQueryKey,
  useApproveBill, useRejectBill, useHoldBill, usePartialApproveBill, useEscalateBill, useWithdrawBill, useDeleteBill,
  useAddBillComment,
  getListBillsQueryKey,
  getListNotificationsQueryKey,
  useListBillAttachments, getListBillAttachmentsQueryKey,
  useRequestBillAttachmentUpload,
  useConfirmBillAttachment,
  useDeleteBillAttachment,
  useUpdateBill,
  useListWallets, getListWalletsQueryKey,
  useListVendors, getListVendorsQueryKey,
  useProcessBillPayment,
  useRescheduleBill,
  getGetScheduledTodayQueryKey,
  getGetScheduledTomorrowQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDateTime, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, ArrowUpCircle,
  ChevronLeft, MessageSquare, Activity, User, Send,
  Paperclip, Upload, Download, Trash2, FileText, Pencil,
  Wallet, CreditCard, BadgeCheck, Hash, CalendarClock, ExternalLink,
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

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BillDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [comment, setComment] = useState("");
  const [approveComment, setApproveComment] = useState("");
  const [rejectComment, setRejectComment] = useState("");
  const [holdComment, setHoldComment] = useState("");
  const [partialAmount, setPartialAmount] = useState("");
  const [partialComment, setPartialComment] = useState("");
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [showPayDialog, setShowPayDialog] = useState(false);
  const [payWalletId, setPayWalletId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payReference, setPayReference] = useState("");
  const [payNarration, setPayNarration] = useState("");

  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    vendorId: "",
    description: "",
    amount: "",
    scheduledDate: "",
    dueDate: "",
    walletId: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
    notes: "",
    link: "",
  });

  const { data: bill, isLoading: billLoading } = useGetBill(id!, {
    query: { enabled: !!id, queryKey: getGetBillQueryKey(id!) },
  });
  const { data: commentsData, isLoading: commentsLoading } = useGetBillComments(id!, {
    query: { enabled: !!id, queryKey: getGetBillCommentsQueryKey(id!) },
  });
  const { data: auditData, isLoading: auditLoading } = useGetBillAudit(id!, {
    query: { enabled: !!id, queryKey: getGetBillAuditQueryKey(id!) },
  });
  const { data: attachmentsData, isLoading: attachmentsLoading } = useListBillAttachments(id!, {
    query: { enabled: !!id, queryKey: getListBillAttachmentsQueryKey(id!) },
  });
  const { data: walletsData } = useListWallets(undefined, {
    query: { queryKey: getListWalletsQueryKey() },
  });
  const { data: vendorsData } = useListVendors(undefined, {
    query: { queryKey: getListVendorsQueryKey() },
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
  const withdraw = useWithdrawBill({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListBillsQueryKey() }); toast({ title: "Bill withdrawn" }); setLocation("/bills"); },
      onError: () => toast({ title: "Failed to withdraw bill", variant: "destructive" }),
    },
  });
  const deleteBill = useDeleteBill({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListBillsQueryKey() }); toast({ title: "Bill permanently deleted" }); setLocation("/bills"); },
      onError: () => toast({ title: "Failed to delete bill", variant: "destructive" }),
    },
  });
  const updateBill = useUpdateBill({
    mutation: {
      onSuccess: () => {
        invalidate();
        setShowEdit(false);
        toast({ title: "Bill updated" });
      },
      onError: () => toast({ title: "Failed to update bill", variant: "destructive" }),
    },
  });

  const reschedule = useRescheduleBill({
    mutation: {
      onSuccess: () => {
        invalidate();
        qc.invalidateQueries({ queryKey: getGetScheduledTodayQueryKey() });
        qc.invalidateQueries({ queryKey: getGetScheduledTomorrowQueryKey() });
        setShowReschedule(false);
        setRescheduleDate("");
        toast({ title: "Bill rescheduled" });
      },
      onError: () => toast({ title: "Failed to reschedule bill", variant: "destructive" }),
    },
  });

  const processPayment = useProcessBillPayment({
    mutation: {
      onSuccess: () => {
        invalidate();
        qc.invalidateQueries({ queryKey: getListWalletsQueryKey() });
        setShowPayDialog(false);
        setPayWalletId(""); setPayAmount(""); setPayReference(""); setPayNarration("");
        toast({ title: "Payment processed successfully", description: "The bill has been marked paid and the transaction recorded." });
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error;
        toast({ title: "Payment failed", description: msg ?? "Please check wallet balance and try again.", variant: "destructive" });
      },
    },
  });

  const addComment = useAddBillComment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetBillCommentsQueryKey(id!) });
        qc.invalidateQueries({ queryKey: getGetBillAuditQueryKey(id!) });
        qc.invalidateQueries({ queryKey: getListNotificationsQueryKey({ userId: user?.id ?? "" }) });
        setComment("");
      },
      onError: () => toast({ title: "Failed to add comment", variant: "destructive" }),
    },
  });
  const requestUpload = useRequestBillAttachmentUpload();
  const confirmUpload = useConfirmBillAttachment();
  const deleteAttachment = useDeleteBillAttachment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListBillAttachmentsQueryKey(id!) });
        qc.invalidateQueries({ queryKey: getGetBillQueryKey(id!) });
        toast({ title: "Attachment deleted" });
      },
      onError: () => toast({ title: "Failed to delete attachment", variant: "destructive" }),
    },
  });

  const handleFileUpload = async (file: File) => {
    if (!id) return;

    const ALLOWED_TYPES = new Set([
      "application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv", "application/octet-stream",
    ]);
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      toast({ title: "File type not allowed. Permitted: PDF, images, Word, Excel, CSV.", variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File exceeds the 20 MB limit.", variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsUploading(true);
    try {
      const uploadData = await requestUpload.mutateAsync({
        id,
        data: { fileName: file.name, fileSize: file.size, mimeType: file.type || "application/octet-stream" },
      });

      const putRes = await fetch(uploadData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Storage upload failed: ${putRes.status}`);
      }

      await confirmUpload.mutateAsync({ id, attachmentId: uploadData.attachmentId });
      qc.invalidateQueries({ queryKey: getListBillAttachmentsQueryKey(id) });
      qc.invalidateQueries({ queryKey: getGetBillQueryKey(id) });
      toast({ title: "Attachment uploaded" });
    } catch {
      toast({ title: "Upload failed — please try again", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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

  // Derived amounts — must be computed before permission flags
  const approvedAmt = bill.approvedAmount ?? bill.amount ?? 0;
  const alreadyPaid = bill.paidAmount ?? 0;
  const remainingApproved = Math.max(0, Number(approvedAmt) - Number(alreadyPaid));
  const totalOutstanding = Number(bill.outstandingBalance ?? 0);
  // True when partial payment was processed but no more approved funds remain — waiting for MD to approve next tranche
  const awaitingNextApproval = bill.status === "partial" && remainingApproved <= 0.01 && totalOutstanding > 0.01;

  const canAct = isMd && ["pending", "on_hold", "partial", "overdue"].includes(bill.status ?? "");
  const canEdit = isMd
    ? !["approved", "paid"].includes(bill.status ?? "")
    : bill.status === "pending" && bill.createdBy === user?.id;
  const canWithdraw = !isMd && bill.status === "pending" && bill.createdBy === user?.id;
  const canPay = (user?.role === "payment_assistant" || isMd) &&
    ["approved", "partial"].includes(bill.status ?? "") &&
    (isMd || bill.createdBy === user?.id) &&
    remainingApproved > 0.01;
  const canReschedule = ["partial", "approved"].includes(bill.status ?? "") &&
    (isMd || (user?.role === "payment_assistant" && bill.createdBy === user?.id));
  const attachments = attachmentsData?.attachments ?? [];

  const selectedPayWallet = walletsData?.wallets?.find(w => w.id === payWalletId);

  const openEditDialog = () => {
    setEditForm({
      vendorId: bill.vendorId ?? "",
      description: bill.description ?? "",
      amount: String(bill.amount ?? ""),
      scheduledDate: bill.scheduledDate ?? "",
      dueDate: bill.dueDate ?? "",
      walletId: bill.walletId ?? "",
      priority: (bill.priority as "low" | "medium" | "high" | "urgent") ?? "medium",
      notes: (bill as any).notes ?? "",
      link: (bill as any).link ?? "",
    });
    setShowEdit(true);
  };

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
          {(bill as any).notes && (
            <div className="mt-2 flex items-start gap-2 text-sm text-foreground/80 bg-muted/40 rounded-md px-3 py-2 border border-border/50 max-w-xl">
              <FileText className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
              <span className="whitespace-pre-wrap">{(bill as any).notes}</span>
            </div>
          )}
          {(bill as any).link && (
            <div className="mt-1.5">
              <a
                href={(bill as any).link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {(bill as any).link.length > 60 ? (bill as any).link.slice(0, 60) + "…" : (bill as any).link}
              </a>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded border ${PRIORITY_COLORS[bill.priority ?? "low"]}`}>{bill.priority}</span>
          <span className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded border ${STATUS_COLORS[bill.status ?? "pending"]}`} data-testid="status-bill">{bill.status?.replace("_", " ")}</span>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={openEditDialog} data-testid="button-edit-bill">
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
            </Button>
          )}
          {canWithdraw && (
            <Button
              size="sm"
              variant="destructive"
              disabled={withdraw.isPending}
              data-testid="button-withdraw-bill"
              onClick={() => {
                if (window.confirm("This will permanently delete the bill and cannot be undone. Withdraw?")) {
                  withdraw.mutate({ id: id! });
                }
              }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              {withdraw.isPending ? "Withdrawing…" : "Withdraw"}
            </Button>
          )}
          {isMd && (
            <Button
              size="sm"
              variant="destructive"
              disabled={deleteBill.isPending}
              data-testid="button-delete-bill"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete
            </Button>
          )}
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
                {Number(bill.paidAmount ?? 0) > 0 && (
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 space-y-0.5">
                    <p>Previously approved: <span className="font-semibold font-mono text-foreground">{formatCurrency(bill.approvedAmount ?? 0)}</span></p>
                    <p>Already paid: <span className="font-semibold font-mono text-teal-700">{formatCurrency(bill.paidAmount ?? 0)}</span></p>
                    <p>Still outstanding: <span className="font-semibold font-mono text-amber-700">{formatCurrency(totalOutstanding)}</span></p>
                    <p className="text-[11px] text-muted-foreground/70 pt-0.5">Enter the <strong>additional</strong> amount you are approving for the next payment.</p>
                  </div>
                )}
                <Input type="number" placeholder={Number(bill.paidAmount ?? 0) > 0 ? "Additional amount to approve (NGN)" : "Amount to approve (NGN)"} value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} className="max-w-xs font-mono" data-testid="input-partial-amount" />
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

      {/* Payment Confirmation — shown once bill is paid */}
      {bill.status === "paid" && bill.paidAt && (
        <Card className="shadow-sm border-teal-500/30 bg-teal-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wider font-semibold text-teal-700 flex items-center gap-2">
              <BadgeCheck className="w-4 h-4" /> Payment Confirmed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Amount Paid</p>
                <p className="font-bold font-mono text-teal-700">{formatCurrency(bill.paidAmount ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Outstanding</p>
                <p className="font-bold font-mono">{formatCurrency(bill.outstandingBalance ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Payment Date</p>
                <p className="font-semibold">{formatDateTime(bill.paidAt)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Processed By</p>
                <p className="font-semibold">{bill.paidByName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Wallet Used</p>
                <p className="font-semibold">{bill.paidWalletName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Reference</p>
                <p className="font-mono text-xs tracking-wide">{bill.paymentReference ?? "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Process Payment — shown to PA/MD when bill is approved or partial */}
      {canPay && (
        <Card className="shadow-sm border-emerald-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wider font-semibold text-emerald-700 flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Process Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm bg-muted/40 rounded p-3 border border-border/50">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Total Bill</p>
                <p className="font-bold font-mono">{formatCurrency(bill.amount ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Approved Amount</p>
                <p className="font-bold font-mono text-emerald-700">{formatCurrency(approvedAmt)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Remaining to Pay</p>
                <p className="font-bold font-mono text-amber-700">{formatCurrency(remainingApproved)}</p>
              </div>
            </div>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              onClick={() => {
                setPayAmount(String(remainingApproved));
                setPayWalletId(bill.walletId ?? "");
                setShowPayDialog(true);
              }}
              data-testid="button-process-payment"
            >
              <Wallet className="w-4 h-4 mr-2" /> Process Payment
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Schedule Actions — visible when bill is approved or partial */}
      {canReschedule && (
        <Card className="shadow-sm border-sky-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wider font-semibold text-sky-700 flex items-center gap-2">
              <CalendarClock className="w-4 h-4" /> Schedule Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm bg-sky-50/50 rounded p-3 border border-sky-200/50">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Current Scheduled Date</p>
                <p className="font-bold font-mono">{bill.scheduledDate ?? "Not set"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Total Outstanding</p>
                <p className="font-bold font-mono text-amber-700">{formatCurrency(totalOutstanding)}</p>
              </div>
            </div>
            {awaitingNextApproval && (
              <div className="text-xs bg-violet-50 border border-violet-200 rounded p-2.5 text-violet-800">
                All approved funds have been disbursed. <span className="font-semibold">{formatCurrency(totalOutstanding)}</span> remains outstanding — reschedule the next payment date below and await further MD approval.
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                size="sm"
                variant="outline"
                className="border-sky-300 text-sky-700 hover:bg-sky-50"
                onClick={() => {
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  const dateStr = tomorrow.toISOString().split("T")[0]!;
                  reschedule.mutate({ id: id!, data: { scheduledDate: dateStr } });
                }}
                disabled={reschedule.isPending}
                data-testid="button-move-to-tomorrow"
              >
                <CalendarClock className="w-3.5 h-3.5 mr-1.5" /> Move to Tomorrow
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-sky-400 text-sky-800 hover:bg-sky-100"
                onClick={() => { setRescheduleDate(bill.scheduledDate ?? ""); setShowReschedule(true); }}
                data-testid="button-reschedule-bill"
              >
                <CalendarClock className="w-3.5 h-3.5 mr-1.5" /> Change Scheduled Date
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attachments */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm uppercase tracking-wider font-semibold flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-primary" /> Attachments
              {attachments.length > 0 && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">({attachments.length})</span>
              )}
            </CardTitle>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv"
                data-testid="input-attachment-file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileUpload(file);
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-upload-attachment"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {isUploading ? "Uploading..." : "Attach File"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {attachmentsLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : attachments.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No attachments yet. Attach an invoice or document above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between p-3 bg-muted/40 rounded border border-border/50 gap-3"
                  data-testid={`attachment-${att.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{att.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {att.uploadedByName} · {formatDateTime(att.uploadedAt)}
                        {att.fileSize ? ` · ${formatFileSize(att.fileSize)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={`/api/attachments/${att.id}/download`}
                      download={att.fileName}
                      data-testid={`button-download-attachment-${att.id}`}
                    >
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Download">
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </a>
                    {(user?.role === "md" || att.uploadedBy === user?.id) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        disabled={deleteAttachment.isPending}
                        onClick={() => deleteAttachment.mutate({ attachmentId: att.id })}
                        data-testid={`button-delete-attachment-${att.id}`}
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wider font-semibold flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" /> Comments
              {!!commentsData?.comments?.length && (
                <span className="ml-1 text-xs font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                  {commentsData.comments.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {commentsLoading ? (
              <div className="space-y-3">
                {[1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : !commentsData?.comments?.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">No comments yet. Be the first to add one.</p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {commentsData.comments.map((c) => {
                  const isOwn = c.authorId === user?.id;
                  const isMdAuthor = c.authorRole === "md";
                  return (
                    <div
                      key={c.id}
                      className={`p-3 rounded border ${isOwn ? "bg-primary/5 border-primary/20" : "bg-muted/40 border-border/50"}`}
                      data-testid={`comment-${c.id}`}
                    >
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-semibold truncate">{c.authorName}</span>
                          <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${isMdAuthor ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"}`}>
                            {isMdAuthor ? "MD" : "PA"}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground font-mono shrink-0">{formatDateTime(c.createdAt)}</span>
                      </div>
                      <p className="text-sm leading-relaxed">{c.text}</p>
                    </div>
                  );
                })}
              </div>
            )}
            <Separator />
            <div className="space-y-2">
              <Textarea
                placeholder="Add a comment or progress update..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                data-testid="input-comment"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && comment.trim() && !addComment.isPending && user) {
                    addComment.mutate({ id: id!, data: { text: comment, authorId: user.id } });
                  }
                }}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Ctrl+Enter to send</p>
                <Button size="sm" disabled={!comment.trim() || addComment.isPending || !user} onClick={() => addComment.mutate({ id: id!, data: { text: comment, authorId: user!.id } })} data-testid="button-submit-comment">
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  {addComment.isPending ? "Sending..." : "Send"}
                </Button>
              </div>
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

      {/* Process Payment Dialog */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" /> Process Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-muted/50 rounded border text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vendor</span>
                <span className="font-semibold">{bill.vendorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approved</span>
                <span className="font-semibold font-mono text-emerald-700">{formatCurrency(approvedAmt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Remaining</span>
                <span className="font-semibold font-mono text-amber-700">{formatCurrency(remainingApproved)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                <Wallet className="w-3 h-3 inline mr-1" /> Wallet / Account *
              </Label>
              <Select value={payWalletId} onValueChange={setPayWalletId}>
                <SelectTrigger data-testid="select-pay-wallet">
                  <SelectValue placeholder="Select wallet to debit..." />
                </SelectTrigger>
                <SelectContent>
                  {walletsData?.wallets?.map(w => (
                    <SelectItem key={w.id} value={w.id}>
                      <span className="font-medium">{w.name}</span>
                      <span className="ml-2 text-muted-foreground font-mono text-xs">{formatCurrency(w.balance ?? 0)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPayWallet && (
                <p className="text-xs text-muted-foreground">
                  Available balance: <span className="font-mono font-semibold">{formatCurrency(selectedPayWallet.balance ?? 0)}</span>
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Amount (NGN) *</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="font-mono"
                max={remainingApproved}
                data-testid="input-pay-amount"
              />
              <p className="text-xs text-muted-foreground">Max payable: <span className="font-mono font-semibold">{formatCurrency(remainingApproved)}</span></p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                <Hash className="w-3 h-3 inline mr-1" /> Payment Reference
              </Label>
              <Input
                placeholder="Auto-generated if left blank"
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                data-testid="input-pay-reference"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Narration / Note</Label>
              <Input
                placeholder={`Payment to ${bill.vendorName}`}
                value={payNarration}
                onChange={(e) => setPayNarration(e.target.value)}
                data-testid="input-pay-narration"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowPayDialog(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={
                processPayment.isPending ||
                !payWalletId ||
                !payAmount ||
                Number(payAmount) <= 0 ||
                Number(payAmount) > remainingApproved + 0.01
              }
              onClick={() => processPayment.mutate({
                id: id!,
                data: {
                  walletId: payWalletId,
                  amount: Number(payAmount),
                  paymentReference: payReference || undefined,
                  narration: payNarration || undefined,
                },
              })}
              data-testid="button-confirm-payment"
            >
              {processPayment.isPending ? "Processing..." : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={showReschedule} onOpenChange={setShowReschedule}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-sky-600" /> Reschedule Bill
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Set a new scheduled date for the outstanding balance of <span className="font-semibold text-foreground">{formatCurrency(totalOutstanding)}</span>.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">New Scheduled Date *</Label>
              <Input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                data-testid="input-reschedule-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowReschedule(false)}>Cancel</Button>
            <Button
              className="bg-sky-600 hover:bg-sky-700 text-white"
              disabled={reschedule.isPending || !rescheduleDate}
              onClick={() => reschedule.mutate({ id: id!, data: { scheduledDate: rescheduleDate } })}
              data-testid="button-confirm-reschedule"
            >
              {reschedule.isPending ? "Rescheduling..." : "Confirm Reschedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Bill</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Vendor *</Label>
              <Select value={editForm.vendorId} onValueChange={(v) => setEditForm(f => ({ ...f, vendorId: v }))}>
                <SelectTrigger data-testid="select-edit-vendor">
                  <SelectValue placeholder="Select vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {vendorsData?.vendors?.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Description *</Label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Invoice #1234 — Q1 supplies"
                data-testid="input-edit-description"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Amount (NGN) *</Label>
              <Input
                type="number"
                value={editForm.amount}
                onChange={(e) => setEditForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="font-mono"
                data-testid="input-edit-amount"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Priority *</Label>
              <Select value={editForm.priority} onValueChange={(v) => setEditForm(f => ({ ...f, priority: v as typeof editForm.priority }))}>
                <SelectTrigger data-testid="select-edit-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["low", "medium", "high", "urgent"] as const).map(p => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Scheduled Date *</Label>
              <Input
                type="date"
                value={editForm.scheduledDate}
                onChange={(e) => setEditForm(f => ({ ...f, scheduledDate: e.target.value }))}
                data-testid="input-edit-scheduled-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Due Date</Label>
              <Input
                type="date"
                value={editForm.dueDate}
                onChange={(e) => setEditForm(f => ({ ...f, dueDate: e.target.value }))}
                data-testid="input-edit-due-date"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Wallet / Account</Label>
              <Select value={editForm.walletId || "_none"} onValueChange={(v) => setEditForm(f => ({ ...f, walletId: v === "_none" ? "" : v }))}>
                <SelectTrigger data-testid="select-edit-wallet">
                  <SelectValue placeholder="Select wallet (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No wallet</SelectItem>
                  {walletsData?.wallets?.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Notes / Job Description</Label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="What is this bill for? Include job reference, container details, or any remarks…"
                rows={3}
                data-testid="textarea-edit-notes"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Invoice / Document Link</Label>
              <Input
                type="url"
                value={editForm.link}
                onChange={(e) => setEditForm(f => ({ ...f, link: e.target.value }))}
                placeholder="https://drive.google.com/… or invoice URL"
                data-testid="input-edit-link"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button
              disabled={updateBill.isPending || !editForm.vendorId || !editForm.description.trim() || !editForm.amount || !editForm.scheduledDate}
              onClick={() => updateBill.mutate({
                id: id!,
                data: {
                  vendorId: editForm.vendorId,
                  description: editForm.description,
                  amount: Number(editForm.amount),
                  scheduledDate: editForm.scheduledDate,
                  dueDate: editForm.dueDate,
                  walletId: editForm.walletId,
                  priority: editForm.priority,
                  notes: editForm.notes || undefined,
                  link: editForm.link || undefined,
                },
              })}
              data-testid="button-confirm-edit"
            >
              {updateBill.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Bill?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the bill for <strong>{bill?.vendorName}</strong> ({formatCurrency(bill?.amount ?? 0)}) and all associated comments, attachments, and audit records. Vendor totals will be reversed. This action cannot be undone.
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleteBill.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteBill.isPending}
              data-testid="button-confirm-delete-bill"
              onClick={() => deleteBill.mutate({ id: id! })}
            >
              {deleteBill.isPending ? "Deleting…" : "Yes, Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
