import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowRight, 
  Sparkles, 
  FileCheck, 
  Shield, 
  Settings,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { authApi } from "@/lib/api-client";
import { setAuthData } from "@/lib/auth-utils";
import { toast } from "sonner";

type AuthMode = "login" | "signup";

export default function Auth() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Determine initial mode based on route
  const getInitialMode = (pathname: string): AuthMode => {
    if (pathname === "/signup") return "signup";
    return "login";
  };
  
  const [mode, setMode] = useState<AuthMode>(() => getInitialMode(location.pathname));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Update mode when route changes
  useEffect(() => {
    setMode(getInitialMode(location.pathname));
  }, [location.pathname]);

  const validatePassword = (pwd: string) => {
    const minLength = pwd.length >= 8;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);
    
    return {
      minLength,
      hasUpper,
      hasLower,
      hasNumber,
      hasSpecial,
      isValid: minLength && hasUpper && hasLower && hasNumber,
    };
  };

  const passwordValidation = mode === "signup" ? validatePassword(password) : null;
  const passwordsMatch = mode === "signup" ? password === confirmPassword : true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (mode === "signup") {
      if (!acceptedTerms) {
        toast.error("Please accept the terms and conditions");
        return;
      }
      
      if (!passwordValidation?.isValid) {
        toast.error("Password does not meet requirements");
        return;
      }
      
      if (!passwordsMatch) {
        toast.error("Passwords do not match");
        return;
      }
    }

    setIsLoading(true);

    try {
      let response;
      if (mode === "login") {
        response = await authApi.login(email, password);
      } else {
        response = await authApi.register(email, password, name || undefined);
      }
      
      // Use the new auth utility to store auth data
      setAuthData(response.token, response.user);
      
      toast.success(mode === "login" ? "Welcome back!" : "Account created successfully!");
      
      // Redirect to the page user was trying to access, or dashboard
      const from = (location.state as any)?.from?.pathname || "/dashboard";
      navigate(from, { replace: true });
    } catch (error: any) {
      const message = error?.message || `${mode === "login" ? "Login" : "Registration"} failed`;
      if (message.includes("Cannot reach the server")) {
        toast.error("Network error. Start the API server (npm run server) or run start.bat to start both frontend and API.");
      } else {
        toast.error(message);
      }
    } finally {
      setIsLoading(false);
    }
  };


  const switchMode = () => {
    const newMode = mode === "login" ? "signup" : "login";
    setMode(newMode);
    setPassword("");
    setConfirmPassword("");
    setName("");
    setAcceptedTerms(false);
    // Update URL without navigation
    navigate(newMode === "login" ? "/auth" : "/signup", { replace: true });
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
              {mode === "login" ? "Welcome to Reviewer" : "Create Your Account"}
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="text-muted-foreground text-[15px]"
            >
              {mode === "login" ? "Sign in to continue" : "Get started with your free account"}
            </motion.p>
          </div>

          {/* Mode Toggle */}
          <div className="flex gap-2 mb-6 p-1 bg-muted/50 rounded-lg">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                mode === "login"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                mode === "signup"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {mode === "signup" && (
                <motion.div
                  key="name"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Label htmlFor="name" className="block text-sm font-medium mb-1.5">
                    Full Name
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <Label htmlFor="email" className="block text-sm font-medium mb-1.5">
                Email
              </Label>
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
              <Label htmlFor="password" className="block text-sm font-medium mb-1.5">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              
              {/* Password Validation */}
              {mode === "signup" && password && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-2 space-y-1.5 text-xs"
                >
                  <div className={`flex items-center gap-2 ${passwordValidation?.minLength ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {passwordValidation?.minLength ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    <span>At least 8 characters</span>
                  </div>
                  <div className={`flex items-center gap-2 ${passwordValidation?.hasUpper ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {passwordValidation?.hasUpper ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    <span>One uppercase letter</span>
                  </div>
                  <div className={`flex items-center gap-2 ${passwordValidation?.hasLower ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {passwordValidation?.hasLower ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    <span>One lowercase letter</span>
                  </div>
                  <div className={`flex items-center gap-2 ${passwordValidation?.hasNumber ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {passwordValidation?.hasNumber ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    <span>One number</span>
                  </div>
                </motion.div>
              )}
            </div>

            <AnimatePresence mode="wait">
              {mode === "signup" && (
                <motion.div
                  key="confirm-password"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Label htmlFor="confirmPassword" className="block text-sm font-medium mb-1.5">
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className={`pr-10 ${confirmPassword && !passwordsMatch ? "border-destructive" : ""}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {confirmPassword && !passwordsMatch && (
                    <p className="mt-1.5 text-xs text-destructive">Passwords do not match</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {mode === "signup" && (
              <div className="flex items-start gap-2">
                <Checkbox
                  id="terms"
                  checked={acceptedTerms}
                  onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="terms" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                  I agree to the{" "}
                  <Link to="/terms" className="text-primary hover:underline">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link to="/privacy" className="text-primary hover:underline">
                    Privacy Policy
                  </Link>
                </Label>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || (mode === "signup" && (!passwordValidation?.isValid || !passwordsMatch || !acceptedTerms))}
            >
              {isLoading 
                ? (mode === "login" ? "Signing in..." : "Creating account...") 
                : (mode === "login" ? "Sign In" : "Create Account")
              }
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </form>

          {mode === "login" && (
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
          )}

          {mode === "signup" && (
            <div className="mt-6 pt-6 border-t text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={switchMode}
                  className="text-primary hover:underline font-medium"
                >
                  Sign in
                </button>
              </p>
            </div>
          )}
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
