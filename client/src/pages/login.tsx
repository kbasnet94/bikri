import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard } from "lucide-react";

export default function Login() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Left Panel: Branding */}
      <div className="hidden lg:flex w-1/2 bg-slate-950 relative flex-col justify-between p-12 text-white overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-transparent to-transparent" />
        
        <div className="relative z-10 flex items-center gap-3">
          <div className="bg-white/10 p-2 rounded-xl backdrop-blur-md">
            <CreditCard className="w-6 h-6" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">Bikri</span>
        </div>

        <div className="relative z-10 max-w-lg">
          <h1 className="font-display font-bold text-5xl leading-tight mb-6">
            Master your inventory, <br/>
            <span className="text-primary-foreground/60">elevate your sales.</span>
          </h1>
          <p className="text-lg text-white/60 font-light leading-relaxed">
            The complete solution for modern wholesale businesses. Track inventory, manage customer credit, and process orders with lightning speed.
          </p>
        </div>

        <div className="relative z-10 text-sm text-white/40">
          © 2024 Bikri. All rights reserved.
        </div>
      </div>

      {/* Right Panel: Login */}
      <div className="flex-1 flex items-center justify-center p-6 bg-muted/10">
        <Card className="w-full max-w-md shadow-xl border-border/50">
          <CardHeader className="space-y-1 text-center pb-8">
            <div className="mx-auto bg-primary/10 w-12 h-12 rounded-xl flex items-center justify-center mb-4 lg:hidden">
              <CreditCard className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold font-display">Welcome back</CardTitle>
            <CardDescription>
              Sign in to your enterprise dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              size="lg" 
              className="w-full font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
              onClick={handleLogin}
            >
              Sign in with Replit
            </Button>
            
            <div className="mt-6 text-center text-xs text-muted-foreground">
              By signing in, you agree to our Terms of Service and Privacy Policy.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
