import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import Layout from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { canAccess, type Resource } from "@/lib/roles";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

// Pages
import Dashboard from "@/pages/dashboard";
import Inventory from "@/pages/inventory";
import Customers from "@/pages/customers";
import Orders from "@/pages/orders";
import Login from "@/pages/login";
import Account from "@/pages/account";
import SetPassword from "@/pages/set-password";

// Tracks whether the signed-in user still needs to set a permanent password.
function useMustChangePassword() {
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setMustChangePassword(session?.user?.user_metadata?.must_change_password === true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setMustChangePassword(session?.user?.user_metadata?.must_change_password === true);
    });

    return () => subscription.unsubscribe();
  }, []);

  return mustChangePassword;
}

// Wrapper for protected routes
function ProtectedRoute({ component: Component, resource }: { component: React.ComponentType; resource?: Resource }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  const mustChangePassword = useMustChangePassword();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (mustChangePassword && location !== "/set-password") {
    return <Redirect to="/set-password" />;
  }

  if (resource && !canAccess(user?.roles ?? [], resource)) {
    return <div className="p-8 text-center text-muted-foreground">You don't have access to this page.</div>;
  }

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login">
        {user ? <Redirect to="/" /> : <Login />}
      </Route>
      <Route path="/set-password">
        <SetPassword />
      </Route>

      <Route path="/">
        <ProtectedRoute component={Dashboard} resource="dashboard" />
      </Route>
      <Route path="/inventory">
        <ProtectedRoute component={Inventory} resource="inventory" />
      </Route>
      <Route path="/customers">
        <ProtectedRoute component={Customers} resource="customers" />
      </Route>
      <Route path="/orders">
        <ProtectedRoute component={Orders} resource="orders" />
      </Route>
      <Route path="/account">
        <ProtectedRoute component={Account} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
