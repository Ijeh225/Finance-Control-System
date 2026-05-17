import { useAuth } from "@/context/AuthContext";
import {
  useListNotifications, getListNotificationsQueryKey,
  useMarkNotificationRead, useMarkAllNotificationsRead,
  useDeleteNotification,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bell, BellOff, CheckCheck, Trash2,
  CheckCircle2, XCircle, CircleDashed, PauseCircle,
  MessageCircle, AlertTriangle, Clock, Copy, ArrowUpCircle, Paperclip, Wallet, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { LucideIcon } from "lucide-react";

interface IconConfig {
  Icon: LucideIcon;
  bg: string;
  color: string;
  bgUnread: string;
  colorUnread: string;
}

const NOTIF_ICON_MAP: Record<string, IconConfig> = {
  bill_approved: {
    Icon: CheckCircle2,
    bg: "bg-emerald-100", color: "text-emerald-400",
    bgUnread: "bg-emerald-100", colorUnread: "text-emerald-600",
  },
  bill_rejected: {
    Icon: XCircle,
    bg: "bg-rose-100", color: "text-rose-400",
    bgUnread: "bg-rose-100", colorUnread: "text-rose-600",
  },
  bill_partial: {
    Icon: CircleDashed,
    bg: "bg-orange-100", color: "text-orange-400",
    bgUnread: "bg-orange-100", colorUnread: "text-orange-600",
  },
  bill_held: {
    Icon: PauseCircle,
    bg: "bg-amber-100", color: "text-amber-400",
    bgUnread: "bg-amber-100", colorUnread: "text-amber-600",
  },
  comment_added: {
    Icon: MessageCircle,
    bg: "bg-blue-100", color: "text-blue-400",
    bgUnread: "bg-blue-100", colorUnread: "text-blue-600",
  },
  wallet_low: {
    Icon: Wallet,
    bg: "bg-yellow-100", color: "text-yellow-500",
    bgUnread: "bg-yellow-100", colorUnread: "text-yellow-600",
  },
  overdue_warning: {
    Icon: Clock,
    bg: "bg-rose-100", color: "text-rose-400",
    bgUnread: "bg-rose-100", colorUnread: "text-rose-600",
  },
  duplicate_detected: {
    Icon: Copy,
    bg: "bg-orange-100", color: "text-orange-400",
    bgUnread: "bg-orange-100", colorUnread: "text-orange-600",
  },
  escalated: {
    Icon: ArrowUpCircle,
    bg: "bg-red-100", color: "text-red-400",
    bgUnread: "bg-red-100", colorUnread: "text-red-600",
  },
  attachment_uploaded: {
    Icon: Paperclip,
    bg: "bg-slate-100", color: "text-slate-400",
    bgUnread: "bg-slate-100", colorUnread: "text-slate-600",
  },
};

const FALLBACK_ICON: IconConfig = {
  Icon: Bell,
  bg: "bg-muted", color: "text-muted-foreground",
  bgUnread: "bg-primary/15", colorUnread: "text-primary",
};

function NotifIcon({ type, unread }: { type: string; unread: boolean }) {
  const cfg = NOTIF_ICON_MAP[type] ?? FALLBACK_ICON;
  const { Icon } = cfg;
  const bg = unread ? cfg.bgUnread : cfg.bg;
  const color = unread ? cfg.colorUnread : cfg.color;
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${bg}`}>
      <Icon className={`w-4 h-4 ${color}`} />
    </div>
  );
}

type Notif = {
  id: string;
  type?: string | null;
  title: string;
  body: string;
  billId?: string | null;
  isRead?: boolean | null;
  createdAt?: string | null;
};

interface NotifRowProps {
  notif: Notif;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

function NotifRow({ notif, onRead, onDelete, isDeleting }: NotifRowProps) {
  const [, setLocation] = useLocation();
  const isUnread = !notif.isRead;
  const isClickable = !!notif.billId;

  function handleClick() {
    if (isUnread) onRead(notif.id);
    if (notif.billId) setLocation(`/bills/${notif.billId}`);
  }

  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      className={`p-4 flex gap-4 transition-colors select-none group
        ${isUnread ? "bg-primary/5" : ""}
        ${isClickable ? "cursor-pointer hover:bg-primary/10 active:bg-primary/15" : "hover:bg-muted/30"}
      `}
      data-testid={`notification-${notif.id}`}
    >
      <NotifIcon type={notif.type ?? ""} unread={isUnread} />

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-snug ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>
          {notif.title}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">{notif.body}</p>
        <p className="text-xs text-muted-foreground/60 font-mono mt-1">{formatDateTime(notif.createdAt ?? undefined)}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isUnread && <div className="w-2 h-2 rounded-full bg-primary mt-0.5" />}
        {isClickable && <ChevronRight className="w-4 h-4 text-muted-foreground/40" />}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          disabled={isDeleting}
          title="Delete notification"
          onClick={(e) => { e.stopPropagation(); onDelete(notif.id); }}
          data-testid={`button-delete-notif-${notif.id}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function Notifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const queryKey = getListNotificationsQueryKey({ userId: user?.id ?? "" });

  const { data, isLoading } = useListNotifications(
    { userId: user?.id ?? "" },
    { query: { enabled: !!user?.id, queryKey } }
  );

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const markRead = useMarkNotificationRead({
    mutation: { onSuccess: invalidate },
  });

  const markAll = useMarkAllNotificationsRead({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "All notifications marked as read" }); },
      onError: () => toast({ title: "Failed to mark all as read", variant: "destructive" }),
    },
  });

  const deleteNotif = useDeleteNotification({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Notification deleted" }); },
      onError: () => toast({ title: "Failed to delete notification", variant: "destructive" }),
    },
  });

  const all = data?.notifications ?? [];
  const unread = all.filter(n => !n.isRead);
  const read = all.filter(n => n.isRead);
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Notifications
            {unreadCount > 0 && (
              <Badge className="bg-primary text-primary-foreground font-bold" data-testid="badge-unread-count">
                {unreadCount}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground text-sm font-medium">Activity alerts and bill status updates.</p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate({ data: { userId: user!.id } })}
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="w-4 h-4 mr-2" />
            {markAll.isPending ? "Marking..." : "Mark all read"}
          </Button>
        )}
      </div>

      {/* ── Loading ── */}
      {isLoading && (
        <Card className="shadow-sm">
          <CardContent className="p-0 divide-y">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="p-4 flex gap-3">
                <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Empty state ── */}
      {!isLoading && all.length === 0 && (
        <Card className="shadow-sm">
          <CardContent className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <BellOff className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-bold">All caught up</h3>
            <p className="text-sm text-muted-foreground mt-2">No notifications to show.</p>
          </CardContent>
        </Card>
      )}

      {/* ── Unread section ── */}
      {!isLoading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Unread
            </h2>
            {unread.length > 0 && (
              <span className="text-xs font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {unread.length}
              </span>
            )}
          </div>

          <Card className="shadow-sm">
            <CardContent className="p-0">
              {unread.length === 0 ? (
                <div className="p-8 flex flex-col items-center text-center gap-2">
                  <CheckCheck className="w-6 h-6 text-emerald-500" />
                  <p className="text-sm text-muted-foreground font-medium">You're all caught up — no unread messages.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {unread.map(notif => (
                    <NotifRow
                      key={notif.id}
                      notif={notif}
                      onRead={(id) => markRead.mutate({ id })}
                      onDelete={(id) => deleteNotif.mutate({ id })}
                      isDeleting={deleteNotif.isPending}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Read section ── */}
      {!isLoading && read.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Read
            </h2>
            <span className="text-xs font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
              {read.length}
            </span>
          </div>

          <Card className="shadow-sm opacity-80">
            <CardContent className="p-0">
              <div className="divide-y">
                {read.map(notif => (
                  <NotifRow
                    key={notif.id}
                    notif={notif}
                    onRead={(id) => markRead.mutate({ id })}
                    onDelete={(id) => deleteNotif.mutate({ id })}
                    isDeleting={deleteNotif.isPending}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
