import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
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
  ShieldAlert
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavItemProps {
  href: string;
  icon: ReactNode;
  label: string;
  isActive: boolean;
  badge?: number;
}

function NavItem({ href, icon, label, isActive, badge }: NavItemProps) {
  return (
    <Link href={href} className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}>
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

  const { data: notifData } = useListNotifications(
    { userId: user?.id ?? "" },
    { query: { enabled: !!user?.id, queryKey: getListNotificationsQueryKey({ userId: user?.id ?? "" }) } }
  );
  const unreadCount = notifData?.unreadCount ?? 0;

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-sidebar border-r border-sidebar-border flex flex-col flex-shrink-0">
        <div className="p-4 md:p-6 border-b border-sidebar-border/50">
          <div className="flex items-center gap-2 text-sidebar-primary-foreground">
            <div className="bg-primary w-8 h-8 rounded-md flex items-center justify-center font-bold shadow-sm">
              FC
            </div>
            <span className="font-bold text-lg tracking-tight">FinCommand</span>
          </div>
          {user && (
            <div className="mt-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center text-sidebar-accent-foreground font-bold border border-sidebar-border">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</p>
                <p className="text-xs text-sidebar-foreground/60 flex items-center gap-1 uppercase tracking-wider font-mono">
                  {user.role === 'md' && <ShieldAlert className="w-3 h-3 text-primary" />}
                  {user.role.replace('_', ' ')}
                </p>
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          <NavItem href="/" icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" isActive={location === "/"} />
          <NavItem href="/bills" icon={<Receipt className="w-4 h-4" />} label="Bills & Approvals" isActive={location.startsWith("/bills")} />
          <NavItem href="/vendors" icon={<Users className="w-4 h-4" />} label="Vendors" isActive={location.startsWith("/vendors")} />
          <NavItem href="/wallets" icon={<Wallet className="w-4 h-4" />} label="Wallets" isActive={location.startsWith("/wallets")} />
          <NavItem href="/notifications" icon={<Bell className="w-4 h-4" />} label="Notifications" isActive={location.startsWith("/notifications")} badge={unreadCount} />
          <NavItem href="/reports" icon={<FileBarChart className="w-4 h-4" />} label="Reports" isActive={location.startsWith("/reports")} />
          
          {user?.role === 'md' && (
            <>
              <NavItem href="/users" icon={<Users className="w-4 h-4" />} label="User Management" isActive={location.startsWith("/users")} />
              <NavItem href="/audit" icon={<Activity className="w-4 h-4" />} label="Audit Log" isActive={location.startsWith("/audit")} />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-sidebar-border/50 mt-auto space-y-1">
          <NavItem href="/settings" icon={<Settings className="w-4 h-4" />} label="Settings" isActive={location.startsWith("/settings")} />
          <Button variant="ghost" onClick={handleLogout} className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 px-3 h-auto py-2">
            <LogOut className="w-4 h-4 mr-3" />
            Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 h-[100dvh] overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
