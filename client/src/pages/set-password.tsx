import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/logo";
import logoDark from "@assets/Bikri_Logo_1_1770108812464.png";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useLocation } from "wouter";

export default function SetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Supabase JS client automatically picks up the token from the URL hash
    // and exchanges it for a session. We listen for auth state changes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          setUserEmail(session.user.email || "");
          setIsReady(true);
        }
        if (event === "PASSWORD_RECOVERY" && session?.user) {
          setUserEmail(session.user.email || "");
          setIsReady(true);
        }
      }
    );

    // Also check if already signed in (in case the event already fired)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserEmail(session.user.email || "");
        setIsReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setIsDone(true);
      toast({ title: "Password set successfully!" });

      setTimeout(() => setLocation("/"), 2000);
    } catch (error: any) {
      toast({
        title: "Failed to set password",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Left Panel: Illustrated Branding (matches login page) */}
      <div className="hidden lg:flex w-1/2 relative flex-col justify-between p-12 text-white overflow-hidden bg-gradient-to-br from-emerald-600 via-green-500 to-teal-600">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-[15%] right-[10%] w-32 h-32 animate-float">
            <div className="w-full h-full bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 shadow-2xl rotate-12 flex items-center justify-center">
              <div className="w-16 h-16 bg-white/20 rounded-xl" />
            </div>
          </div>
          <div className="absolute top-[35%] right-[25%] w-24 h-24 animate-float-delay-1">
            <div className="w-full h-full bg-lime-200/80 rounded-lg shadow-xl -rotate-6 relative">
              <div className="absolute top-1/2 left-0 right-0 h-3 bg-lime-100/60 -translate-y-1/2" />
              <div className="absolute top-0 bottom-0 left-1/2 w-3 bg-lime-100/60 -translate-x-1/2" />
            </div>
          </div>
          <div className="absolute bottom-[30%] right-[15%] w-16 h-16 animate-float-delay-2">
            <div className="w-full h-full bg-white/15 backdrop-blur-sm rounded-xl border border-white/25 shadow-lg rotate-6" />
          </div>
          <div className="absolute bottom-[20%] left-[8%] animate-float-delay-3">
            <div className="relative">
              <div className="w-20 h-16 bg-emerald-300/70 rounded-lg shadow-lg" />
              <div className="absolute -top-12 left-2 w-16 h-14 bg-teal-300/70 rounded-lg shadow-lg rotate-3" />
              <div className="absolute -top-20 left-4 w-14 h-12 bg-green-200/70 rounded-lg shadow-lg -rotate-2" />
            </div>
          </div>
          <div className="absolute top-[60%] left-[20%] w-8 h-8 bg-white/10 rounded-full animate-float-delay-3" />
          <div className="absolute top-[25%] left-[35%] w-6 h-6 bg-white/15 rounded-full animate-float-delay-1" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

        <div className="relative z-10 flex items-center gap-3">
          <img src={logoDark} alt="Bikri" className="h-10 w-auto" />
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="font-display font-bold text-5xl leading-tight mb-6 drop-shadow-lg">
            Welcome to <br />
            <span className="text-white/80">the team.</span>
          </h1>
          <p className="text-lg text-white/70 font-light leading-relaxed drop-shadow">
            You've been invited to join a business on Bikri. Set your password below to get started.
          </p>
        </div>

        <div className="relative z-10 text-sm text-white/50">
          © 2024 Bikri. All rights reserved.
        </div>
      </div>

      {/* Right Panel: Set Password Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-muted/10">
        <Card className="w-full max-w-md shadow-xl border-border/50">
          <CardHeader className="space-y-1 text-center pb-6">
            <div className="mx-auto mb-4 lg:hidden">
              <Logo size="lg" />
            </div>
            {isDone ? (
              <>
                <div className="mx-auto mb-2">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                </div>
                <CardTitle className="text-2xl font-bold font-display">
                  You're all set!
                </CardTitle>
                <CardDescription>
                  Redirecting you to the dashboard...
                </CardDescription>
              </>
            ) : (
              <>
                <CardTitle className="text-2xl font-bold font-display">
                  Set your password
                </CardTitle>
                <CardDescription>
                  {isReady && userEmail
                    ? `Create a password for ${userEmail}`
                    : "Processing your invitation..."}
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {isDone ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !isReady ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  Verifying your invitation link...
                </p>
              </div>
            ) : (
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
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
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Set Password
                </Button>
              </form>
            )}

            <div className="mt-6 text-center text-xs text-muted-foreground">
              By continuing, you agree to our Terms of Service and Privacy
              Policy.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
