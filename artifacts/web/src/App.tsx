import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/layout/Layout";
import { useEffect } from "react";

// Pages
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import BillsList from "@/pages/bills/index";
import BillDetail from "@/pages/bills/[id]";
import Vendors from "@/pages/vendors/index";
import VendorDetail from "@/pages/vendors/[id]";
import Wallets from "@/pages/wallets/index";
import WalletDetail from "@/pages/wallets/[id]";
import Notifications from "@/pages/notifications/index";
import Reports from "@/pages/reports/index";
import Audit from "@/pages/audit/index";
import Settings from "@/pages/settings/index";
import UsersList from "@/pages/users/index";
import UserProfile from "@/pages/users/[id]";
import PendingApprovals from "@/pages/pending-approvals/index";
import ScheduledToday from "@/pages/scheduled-today/index";
import ScheduledTomorrow from "@/pages/scheduled-tomorrow/index";
import OverdueBills from "@/pages/overdue/index";
import OutstandingLiabilities from "@/pages/outstanding/index";
import PaymentHistory from "@/pages/payment-history/index";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return <div className="h-screen w-full flex items-center justify-center bg-background"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  if (!user) {
    return null;
  }

  return (
    <Layout>
      <Component {...rest} />
    </Layout>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/bills" component={() => <ProtectedRoute component={BillsList} />} />
      <Route path="/bills/:id" component={() => <ProtectedRoute component={BillDetail} />} />
      <Route path="/vendors" component={() => <ProtectedRoute component={Vendors} />} />
      <Route path="/vendors/:id" component={() => <ProtectedRoute component={VendorDetail} />} />
      <Route path="/wallets" component={() => <ProtectedRoute component={Wallets} />} />
      <Route path="/wallets/:id" component={() => <ProtectedRoute component={WalletDetail} />} />
      <Route path="/notifications" component={() => <ProtectedRoute component={Notifications} />} />
      <Route path="/reports" component={() => <ProtectedRoute component={Reports} />} />
      <Route path="/users" component={() => <ProtectedRoute component={UsersList} />} />
      <Route path="/users/:id" component={() => <ProtectedRoute component={UserProfile} />} />
      <Route path="/audit" component={() => <ProtectedRoute component={Audit} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/pending-approvals" component={() => <ProtectedRoute component={PendingApprovals} />} />
      <Route path="/scheduled-today" component={() => <ProtectedRoute component={ScheduledToday} />} />
      <Route path="/scheduled-tomorrow" component={() => <ProtectedRoute component={ScheduledTomorrow} />} />
      <Route path="/overdue" component={() => <ProtectedRoute component={OverdueBills} />} />
      <Route path="/outstanding" component={() => <ProtectedRoute component={OutstandingLiabilities} />} />
      <Route path="/payment-history" component={() => <ProtectedRoute component={PaymentHistory} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRoutes />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
