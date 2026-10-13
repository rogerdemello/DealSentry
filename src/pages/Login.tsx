import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, LogIn, Sparkles, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, signIn, signUp } from "@/hooks/use-session";

/**
 * Sign-in page, shown only when the server runs in login mode
 * (GET /api/auth/config → mode "login") and there is no valid session.
 */
export default function Login() {
  const { allowRegistration } = useAuth();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (creating && password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setSubmitting(true);
    try {
      if (creating) {
        await signUp({ email, password, name: name.trim() || undefined });
      } else {
        await signIn(email, password);
      }
      // signIn/signUp reload into the app on success.
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Could not sign in. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="glass-panel w-full max-w-sm"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-heading font-semibold text-lg text-foreground tracking-tight">DealSentry</h1>
            <p className="text-xs text-muted-foreground">{creating ? "Create your account" : "Sign in to continue"}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {creating && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={creating ? "new-password" : "current-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting || !email || !password}>
            {submitting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : creating ? (
              <UserPlus className="w-4 h-4 mr-2" />
            ) : (
              <LogIn className="w-4 h-4 mr-2" />
            )}
            {creating ? "Create account" : "Sign in"}
          </Button>
        </form>

        {allowRegistration && (
          <p className="mt-5 text-center text-sm text-muted-foreground">
            {creating ? "Already have an account?" : "New here?"}{" "}
            <button
              type="button"
              className="text-primary font-medium hover:underline"
              onClick={() => {
                setCreating(!creating);
                setError(null);
              }}
            >
              {creating ? "Sign in" : "Create an account"}
            </button>
          </p>
        )}
      </motion.div>
    </div>
  );
}
