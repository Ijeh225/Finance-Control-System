import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ShieldAlert } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(email, password);
      setLocation("/");
    } catch (err) {
      setError("Invalid email or password. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1616422285623-138997384a51?q=80&w=2938&auto=format&fit=crop')] bg-cover bg-center opacity-5 mix-blend-overlay"></div>
      
      <div className="w-full max-w-md z-10">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3 text-sidebar-primary-foreground">
            <div className="bg-primary w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl shadow-lg border border-primary/20">
              <ShieldAlert className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-bold text-3xl tracking-tight text-white">FinCommand</span>
          </div>
        </div>

        <Card className="border-sidebar-border/20 bg-background/95 backdrop-blur shadow-2xl">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-2xl font-bold tracking-tight">Access Control</CardTitle>
            <CardDescription className="text-muted-foreground">
              Enter your credentials to access the treasury.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Corporate Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="md@practice.com" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="font-mono bg-card"
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Passcode</Label>
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="font-mono bg-card"
                  data-testid="input-password"
                />
              </div>
              
              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive font-medium flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full font-semibold" disabled={isSubmitting} data-testid="button-login">
                {isSubmitting ? "Authenticating..." : "Authorize"}
              </Button>
            </form>
            
            <div className="mt-6 pt-6 border-t border-border flex flex-col gap-1.5 text-xs text-muted-foreground font-mono">
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-1">Demo Credentials</p>
              <p>MD: md@fincommand.ng / FinCommand2026!</p>
              <p>Asst A: mra@fincommand.ng / MrA@2026</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
