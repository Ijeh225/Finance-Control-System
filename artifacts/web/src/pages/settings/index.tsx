import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShieldAlert, User, Mail, Shield, KeyRound, Eye, EyeOff, Phone, Pencil, X, Check } from "lucide-react";
import { useChangePassword, useUpdateMyProfile } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  md: { label: "Chief Executive (MD)", color: "bg-primary/10 text-primary border-primary/20" },
  treasury: { label: "Treasury", color: "bg-sky-500/10 text-sky-700 border-sky-500/20" },
  payment_assistant: { label: "Payment Assistant", color: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
};

export default function Settings() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const roleInfo = ROLE_LABELS[user?.role ?? ""] ?? { label: user?.role ?? "", color: "bg-muted text-muted-foreground border-border" };

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePhone, setProfilePhone] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const { mutate: updateProfile, isPending: isProfilePending } = useUpdateMyProfile({
    mutation: {
      onSuccess: (result) => {
        updateUser({ name: result.name, email: result.email ?? undefined, phone: result.phone ?? undefined });
        toast({ title: "Profile updated" });
        setEditingProfile(false);
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error;
        toast({ title: msg ?? "Failed to update profile", variant: "destructive" });
      },
    },
  });

  const { mutate: changePassword, isPending: isPasswordPending } = useChangePassword({
    mutation: {
      onSuccess: () => {
        toast({ title: "Password changed successfully" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setConfirmError("");
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error;
        toast({ title: msg ?? "Failed to change password", variant: "destructive" });
      },
    },
  });

  function startEditProfile() {
    setProfileName(user?.name ?? "");
    setProfileEmail(user?.email ?? "");
    setProfilePhone(user?.phone ?? "");
    setEditingProfile(true);
  }

  function cancelEditProfile() {
    setEditingProfile(false);
  }

  function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: { name?: string; email?: string; phone?: string } = {};
    if (profileName.trim() !== (user?.name ?? "")) data.name = profileName.trim();
    if (profileEmail.trim() !== (user?.email ?? "")) data.email = profileEmail.trim();
    if (profilePhone.trim() !== (user?.phone ?? "")) data.phone = profilePhone.trim();
    if (Object.keys(data).length === 0) { setEditingProfile(false); return; }
    updateProfile({ data });
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setConfirmError("Passwords do not match");
      return;
    }
    setConfirmError("");
    changePassword({ data: { currentPassword, newPassword } });
  }

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm font-medium">Your account and system preferences.</p>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-2">
            <User className="w-4 h-4" /> Profile
          </CardTitle>
          {!editingProfile && (
            <Button variant="ghost" size="sm" onClick={startEditProfile} className="h-8 gap-1.5 text-xs">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-primary font-bold text-2xl shrink-0">
              {(editingProfile ? profileName : user?.name)?.charAt(0).toUpperCase()}
            </div>
            <div>
              {editingProfile ? (
                <p className="text-xl font-bold">{profileName || <span className="text-muted-foreground">Name</span>}</p>
              ) : (
                <p className="text-xl font-bold" data-testid="text-user-name">{user?.name}</p>
              )}
              <span className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded border inline-block mt-1 ${roleInfo.color}`} data-testid="text-user-role">
                {roleInfo.label}
              </span>
            </div>
          </div>
          <Separator />

          {editingProfile ? (
            <form onSubmit={handleProfileSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="profile-name">Full Name</Label>
                <Input
                  id="profile-name"
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  placeholder="Your full name"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-email">Email</Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={profileEmail}
                  onChange={e => setProfileEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-phone">Phone <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="profile-phone"
                  type="tel"
                  value={profilePhone}
                  onChange={e => setProfilePhone(e.target.value)}
                  placeholder="+234 800 000 0000"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={isProfilePending} className="gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  {isProfilePending ? "Saving…" : "Save Changes"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={cancelEditProfile} disabled={isProfilePending} className="gap-1.5">
                  <X className="w-3.5 h-3.5" /> Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Email</p>
                  <p className="text-sm font-medium font-mono" data-testid="text-user-email">{user?.email}</p>
                </div>
              </div>
              {user?.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Phone</p>
                    <p className="text-sm font-medium font-mono">{user.phone}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Access Role</p>
                  <p className="text-sm font-medium">{roleInfo.label}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-password">Current Password</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setConfirmError(""); }}
                  placeholder="At least 8 characters"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setConfirmError(""); }}
                  placeholder="Repeat new password"
                  required
                  className={`pr-10 ${confirmError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmError && <p className="text-xs text-destructive">{confirmError}</p>}
            </div>

            <Button type="submit" disabled={isPasswordPending} className="w-full">
              {isPasswordPending ? "Updating…" : "Update Password"}
            </Button>
          </form>
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
