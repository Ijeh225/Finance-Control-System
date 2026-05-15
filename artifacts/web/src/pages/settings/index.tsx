import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ShieldAlert, User, Mail, Shield } from "lucide-react";

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  md: { label: "Chief Executive (MD)", color: "bg-primary/10 text-primary border-primary/20" },
  treasury: { label: "Treasury", color: "bg-sky-500/10 text-sky-700 border-sky-500/20" },
  payment_assistant: { label: "Payment Assistant", color: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
};

export default function Settings() {
  const { user } = useAuth();
  const roleInfo = ROLE_LABELS[user?.role ?? ""] ?? { label: user?.role ?? "", color: "bg-muted text-muted-foreground border-border" };

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm font-medium">Your account and system preferences.</p>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-2">
            <User className="w-4 h-4" /> Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-primary font-bold text-2xl">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-xl font-bold" data-testid="text-user-name">{user?.name}</p>
              <span className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded border inline-block mt-1 ${roleInfo.color}`} data-testid="text-user-role">
                {roleInfo.label}
              </span>
            </div>
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Email</p>
                <p className="text-sm font-medium font-mono" data-testid="text-user-email">{user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Access Role</p>
                <p className="text-sm font-medium">{roleInfo.label}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { label: "View own bills", allowed: true },
              { label: "Submit bills for approval", allowed: user?.role !== "md" },
              { label: "View all users' bills", allowed: user?.role === "md" },
              { label: "Approve / reject bills", allowed: user?.role === "md" },
              { label: "Hold / partial-approve bills", allowed: user?.role === "md" },
              { label: "Manage wallets", allowed: user?.role === "md" },
              { label: "Manage vendors", allowed: user?.role === "md" },
              { label: "View audit log", allowed: user?.role === "md" },
            ].map(({ label, allowed }) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                <span className="text-sm">{label}</span>
                <Badge variant="outline" className={allowed ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" : "bg-muted text-muted-foreground"}>
                  {allowed ? "Allowed" : "Restricted"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-muted/60">
        <CardContent className="pt-5">
          <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">System</p>
          <p className="text-sm text-muted-foreground">FinCommand Executive Treasury · v0.1</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Private system for authorized personnel only.</p>
        </CardContent>
      </Card>
    </div>
  );
}
