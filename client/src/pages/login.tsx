import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";
import logoDark from "@assets/Bikri_Logo_1_1770108812464.png";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type AuthMode = "login" | "register" | "set-password";

export default function Login() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.needsPasswordSetup) {
          setNeedsPasswordSetup(true);
          setMode("set-password");
          toast({ title: "Please set a password", description: "Your account was created with SSO. Set a password to continue." });
        } else {
          toast({ title: "Login failed", description: data.message, variant: "destructive" });
        }
        return;
      }

      toast({ title: "Welcome back!" });
      window.location.href = "/";
    } catch (error: any) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }

    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, firstName, lastName, businessName: businessName || undefined }),
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        toast({ title: "Registration failed", description: data.message, variant: "destructive" });
        return;
      }

      toast({ title: "Account created!" });
      window.location.href = "/";
    } catch (error: any) {
      toast({ title: "Registration failed", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }

    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        toast({ title: "Failed to set password", description: data.message, variant: "destructive" });
        return;
      }

      toast({ title: "Password set successfully!" });
      window.location.href = "/";
    } catch (error: any) {
      toast({ title: "Failed to set password", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Left Panel: Illustrated Branding */}
      <div className="hidden lg:flex w-1/2 relative flex-col justify-between p-12 text-white overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500">
        {/* Animated floating boxes */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Large box - back */}
          <div className="absolute top-[15%] right-[10%] w-32 h-32 animate-float">
            <div className="w-full h-full bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 shadow-2xl rotate-12 flex items-center justify-center">
              <div className="w-16 h-16 bg-white/20 rounded-xl" />
            </div>
          </div>
          
          {/* Medium box with tape */}
          <div className="absolute top-[35%] right-[25%] w-24 h-24 animate-float-delay-1">
            <div className="w-full h-full bg-amber-200/80 rounded-lg shadow-xl -rotate-6 relative">
              <div className="absolute top-1/2 left-0 right-0 h-3 bg-amber-100/60 -translate-y-1/2" />
              <div className="absolute top-0 bottom-0 left-1/2 w-3 bg-amber-100/60 -translate-x-1/2" />
            </div>
          </div>
          
          {/* Small floating box */}
          <div className="absolute bottom-[30%] right-[15%] w-16 h-16 animate-float-delay-2">
            <div className="w-full h-full bg-white/15 backdrop-blur-sm rounded-xl border border-white/25 shadow-lg rotate-6" />
          </div>
          
          {/* Stack of boxes - left side */}
          <div className="absolute bottom-[20%] left-[8%] animate-float-delay-3">
            <div className="relative">
              <div className="w-20 h-16 bg-orange-300/70 rounded-lg shadow-lg" />
              <div className="absolute -top-12 left-2 w-16 h-14 bg-teal-300/70 rounded-lg shadow-lg rotate-3" />
              <div className="absolute -top-20 left-4 w-14 h-12 bg-blue-300/70 rounded-lg shadow-lg -rotate-2" />
            </div>
          </div>
          
          {/* Delivery truck silhouette */}
          <div className="absolute bottom-[10%] right-[35%] opacity-20 animate-float-slow">
            <svg width="120" height="60" viewBox="0 0 120 60" fill="currentColor">
              <rect x="0" y="15" width="70" height="35" rx="4" />
              <rect x="70" y="25" width="40" height="25" rx="4" />
              <polygon points="70,25 90,10 110,10 110,25" />
              <circle cx="20" cy="50" r="10" className="fill-white/30" />
              <circle cx="95" cy="50" r="10" className="fill-white/30" />
            </svg>
          </div>
          
          {/* Floating circles for depth */}
          <div className="absolute top-[60%] left-[20%] w-8 h-8 bg-white/10 rounded-full animate-float-delay-3" />
          <div className="absolute top-[25%] left-[35%] w-6 h-6 bg-white/15 rounded-full animate-float-delay-1" />
          <div className="absolute top-[70%] right-[40%] w-4 h-4 bg-white/20 rounded-full animate-float-fast" />
        </div>
        
        {/* Subtle overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        
        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <img src={logoDark} alt="Bikri" className="h-10 w-auto" />
        </div>

        {/* Main content */}
        <div className="relative z-10 max-w-md">
          <h1 className="font-display font-bold text-5xl leading-tight mb-6 drop-shadow-lg">
            Master your inventory, <br/>
            <span className="text-white/80">elevate your sales.</span>
          </h1>
          <p className="text-lg text-white/70 font-light leading-relaxed drop-shadow">
            The complete solution for modern wholesale businesses. Track inventory, manage customer credit, and process orders with ease.
          </p>
          
          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 mt-8">
            <span className="px-3 py-1.5 bg-white/15 backdrop-blur-sm rounded-full text-sm font-medium border border-white/20">
              Inventory Tracking
            </span>
            <span className="px-3 py-1.5 bg-white/15 backdrop-blur-sm rounded-full text-sm font-medium border border-white/20">
              Credit Management
            </span>
            <span className="px-3 py-1.5 bg-white/15 backdrop-blur-sm rounded-full text-sm font-medium border border-white/20">
              Order Processing
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-sm text-white/50">
          © 2024 Bikri. All rights reserved.
        </div>
      </div>

      {/* Right Panel: Auth Forms */}
      <div className="flex-1 flex items-center justify-center p-6 bg-muted/10">
        <Card className="w-full max-w-md shadow-xl border-border/50">
          <CardHeader className="space-y-1 text-center pb-6">
            <div className="mx-auto mb-4 lg:hidden">
              <Logo size="lg" />
            </div>
            <CardTitle className="text-2xl font-bold font-display">
              {mode === "login" && "Welcome back"}
              {mode === "register" && "Create an account"}
              {mode === "set-password" && "Set your password"}
            </CardTitle>
            <CardDescription>
              {mode === "login" && "Sign in to your account"}
              {mode === "register" && "Get started with Bikri"}
              {mode === "set-password" && "Create a password for your account"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mode === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="input-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-login">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Sign In
                </Button>
                <div className="text-center text-sm text-muted-foreground">
                  Don't have an account?{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={() => setMode("register")}
                    data-testid="link-register"
                  >
                    Sign up
                  </button>
                </div>
                <div className="text-center text-sm text-muted-foreground">
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={() => setMode("set-password")}
                    data-testid="link-set-password"
                  >
                    Set password for existing account
                  </button>
                </div>
              </form>
            )}

            {mode === "register" && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      placeholder="John"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      data-testid="input-firstname"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      data-testid="input-lastname"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name (optional)</Label>
                  <Input
                    id="businessName"
                    placeholder="Your Company Name"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    data-testid="input-business-name"
                  />
                  <p className="text-xs text-muted-foreground">Create a business account to add team members later</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="input-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    data-testid="input-confirm-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-register">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Create Account
                </Button>
                <div className="text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={() => setMode("login")}
                    data-testid="link-login"
                  >
                    Sign in
                  </button>
                </div>
              </form>
            )}

            {mode === "set-password" && (
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="input-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    data-testid="input-confirm-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-set-password">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Set Password
                </Button>
                <div className="text-center text-sm text-muted-foreground">
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={() => setMode("login")}
                    data-testid="link-back-to-login"
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            )}
            
            <div className="mt-6 text-center text-xs text-muted-foreground">
              By signing in, you agree to our Terms of Service and Privacy Policy.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
