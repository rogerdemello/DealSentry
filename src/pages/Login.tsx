import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Crown, Users, FileCheck, Shield, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authApi } from "@/lib/api-client";
import { toast } from "sonner";

export default function Login() {
  const [email, setEmail] = useState("demo@reviewer.ai");
  const [password, setPassword] = useState("demo");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await authApi.login(email, password);
      
      localStorage.setItem("auth_token", response.token);
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("userRole", response.user.role);
      localStorage.setItem("userName", response.user.name || response.user.email);
      localStorage.setItem("userId", response.user.id);
      if (response.user.companyId != null) {
        localStorage.setItem("companyId", response.user.companyId);
      } else {
        localStorage.removeItem("companyId");
      }
      
      toast.success("Welcome back!");
      navigate("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("demo");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] opacity-[0.03]">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] border border-primary/20 rounded-full" />
          <div className="absolute top-20 right-20 w-[400px] h-[400px] border border-primary/15 rounded-full" />
          <div className="absolute top-40 right-40 w-[200px] h-[200px] border border-primary/10 rounded-full" />
        </div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] opacity-[0.02]">
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] border border-accent/20 rounded-full" />
          <div className="absolute bottom-16 left-16 w-[300px] h-[300px] border border-accent/15 rounded-full" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/50" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="glass-panel shadow-lg p-8">
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="w-14 h-14 mx-auto mb-5 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md"
            >
              <Sparkles className="w-7 h-7 text-white" />
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="font-heading text-2xl font-semibold text-foreground mb-1.5"
            >
              Welcome to Reviewer
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="text-muted-foreground text-[15px]"
            >
              Sign in to continue
            </motion.p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign In"}
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t">
            <p className="text-sm text-muted-foreground text-center mb-3">
              Quick Login (Demo)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickLogin("admin@reviewer.ai")}
                className="text-xs"
              >
                <Crown className="w-3 h-3 mr-1" />
                Admin
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickLogin("demo@reviewer.ai")}
                className="text-xs"
              >
                <Users className="w-3 h-3 mr-1" />
                Sales Rep
              </Button>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t">
            <div className="grid gap-3">
              {[
                { icon: FileCheck, text: "AI-powered compliance" },
                { icon: Shield, text: "Enterprise security" },
                { icon: Settings, text: "Custom workflows" },
              ].map((feature, index) => (
                <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <feature.icon className="w-4 h-4" />
                  <span>{feature.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="text-center text-sm text-muted-foreground mt-6"
        >
          Secure enterprise proposal management
        </motion.p>
      </motion.div>
    </div>
  );
}
