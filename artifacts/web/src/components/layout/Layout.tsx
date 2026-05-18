import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useViewingAs } from "@/context/ViewingAsContext";
import { useListNotifications, getListNotificationsQueryKey } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  Receipt,
  Users,
  Wallet,
  Bell,
  FileBarChart,
  Activity,
  Settings,
  LogOut,
  ShieldAlert,
  History,
  Menu,
  X,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavItemProps {
  href: string;
  icon: ReactNode;
  label: string;
  isActive: boolean;
  badge?: number;
  onClick?: () => void;
}

function NavItem({ href, icon, label, isActive, badge, onClick }: NavItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}
    >
      <div className="w-5 h-5 flex items-center justify-center relative">
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      <span>{label}</span>
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { selectedUserName, clearSelectedUser } = useViewingAs();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isViewingAs = user?.role === "md" && !!selectedUserName;

  const { data: notifData } = useListNotifications(
    { userId: user?.id ?? "" },
    { query: { enabled: !!user?.id, queryKey: getListNotificationsQueryKey({ userId: user?.id ?? "" }) } }
  );
  const unreadCount = notifData?.unreadCount ?? 0;

  // Close sidebar on route change (mobile nav selection)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  const closeSidebar = () => setSidebarOpen(false);

  const sidebarContent = (
    <>
      <div className="p-4 md:p-6 border-b border-sidebar-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sidebar-primary-foreground">
            <div className="bg-primary w-8 h-8 rounded-md flex items-center justify-center font-bold shadow-sm">
              FC
            </div>
            <span className="font-bold text-lg tracking-tight">FinCommand</span>
          </div>
          {/* Close button — mobile only */}
          <button
            className="md:hidden p-1.5 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
            onClick={closeSidebar}
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {user && (
          <div className="mt-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center text-sidebar-accent-foreground font-bold border border-sidebar-border">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</p>
              <p className="text-xs text-sidebar-foreground/60 flex items-center gap-1 uppercase tracking-wider font-mono">
                {user.role === "md" && <ShieldAlert className="w-3 h-3 text-primary" />}
                {user.role.replace("_", " ")}
              </p>
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        <NavItem href="/" icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" isActive={location === "/"} onClick={closeSidebar} />
        <NavItem href="/bills" icon={<Receipt className="w-4 h-4" />} label="Bills & Approvals" isActive={location.startsWith("/bills")} onClick={closeSidebar} />
        <NavItem href="/vendors" icon={<Users className="w-4 h-4" />} label="Vendors" isActive={location.startsWith("/vendors")} onClick={closeSidebar} />
        <NavItem href="/wallets" icon={<Wallet className="w-4 h-4" />} label="Wallets" isActive={location.startsWith("/wallets")} onClick={closeSidebar} />
        <NavItem href="/notifications" icon={<Bell className="w-4 h-4" />} label="Notifications" isActive={location.startsWith("/notifications")} badge={unreadCount} onClick={closeSidebar} />
        <NavItem href="/payment-history" icon={<History className="w-4 h-4" />} label="Payment History" isActive={location.startsWith("/payment-history")} onClick={closeSidebar} />
        <NavItem href="/reports" icon={<FileBarChart className="w-4 h-4" />} label="Reports" isActive={location.startsWith("/reports")} onClick={closeSidebar} />

        {user?.role === "md" && (
          <>
            <NavItem href="/users" icon={<Users className="w-4 h-4" />} label="User Management" isActive={location.startsWith("/users")} onClick={closeSidebar} />
            <NavItem href="/audit" icon={<Activity className="w-4 h-4" />} label="Audit Log" isActive={location.startsWith("/audit")} onClick={closeSidebar} />
          </>
        )}
      </nav>

      <div className="p-4 border-t border-sidebar-border/50 mt-auto space-y-1">
        <NavItem href="/settings" icon={<Settings className="w-4 h-4" />} label="Settings" isActive={location.startsWith("/settings")} onClick={closeSidebar} />
        <Button
          variant="ghost"
          onClick={logout}
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 px-3 h-auto py-2"
        >
          <LogOut className="w-4 h-4 mr-3" />
          Sign out
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">

      {/* ── Mobile top bar ─────────────────────────────────────────── */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-sidebar border-b border-sidebar-border sticky top-0 z-30">
        <div className="flex items-center gap-2 text-sidebar-primary-foreground">
          <div className="bg-primary w-7 h-7 rounded-md flex items-center justify-center font-bold text-sm shadow-sm">
            FC
          </div>
          <span className="font-bold text-base tracking-tight">FinCommand</span>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Link href="/notifications">
              <span className="relative">
                <Bell className="w-5 h-5 text-sidebar-foreground/70" />
                <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 bg-destructive text-destructive-foreground text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              </span>
            </Link>
          )}
          <button
            className="p-1.5 rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ── Backdrop overlay (mobile) ───────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden backdrop-blur-sm"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ────────────────────────────────────────────────── */}
      {/* Mobile: fixed drawer that slides in/out */}
      {/* Desktop: static sidebar in the flex row */}
      <aside
        className={[
          // shared
          "bg-sidebar border-r border-sidebar-border flex flex-col flex-shrink-0",
          // mobile: fixed full-height drawer
          "fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-300 ease-in-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          // desktop: static, not fixed
          "md:static md:translate-x-0 md:w-64 md:transition-none md:z-auto",
        ].join(" ")}
      >
        {sidebarContent}
      </aside>

      {/* ── Main content ───────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto md:h-[100dvh]">
        {isViewingAs && (
          <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-800 dark:text-amber-300 text-sm font-medium">
            <span className="flex items-center gap-2">
              <Eye className="w-4 h-4 shrink-0" />
              Viewing as <strong>{selectedUserName}</strong>
            </span>
            <button
              onClick={clearSelectedUser}
              className="text-xs underline underline-offset-2 hover:no-underline shrink-0"
            >
              Back to overview
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
