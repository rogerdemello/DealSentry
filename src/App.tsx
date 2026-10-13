import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ProposalProvider } from "@/context/ProposalProvider";
import { useApiConnection } from "@/hooks/use-api-connection";
import { useAuth, useSession } from "@/hooks/use-session";
import ClientLayout from "@/components/layout/ClientLayout";

// Every page is its own chunk, fetched when first visited, so the initial load
// carries only the shell. (Charts and animation libraries are split out in
// vite.config.ts and only load with the pages that use them.)
const Home = lazy(() => import("@/pages/Home"));
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Proposals = lazy(() => import("@/pages/Proposals"));
const UploadProposal = lazy(() => import("@/pages/UploadProposal"));
const NewProposal = lazy(() => import("@/pages/NewProposal"));
const CreateProposal = lazy(() => import("@/pages/CreateProposal"));
const ProposalReview = lazy(() => import("@/pages/ProposalReview"));
const Compliance = lazy(() => import("@/pages/Compliance"));
const Integrations = lazy(() => import("@/pages/Integrations"));
const Settings = lazy(() => import("@/pages/Settings"));
const Audit = lazy(() => import("@/pages/Audit"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient();

function PageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground" role="status" aria-label="Loading">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

/**
 * Old sign-in URLs (/login, /auth, /signup) lead to the dashboard — but only once the
 * session check has finished. Redirecting while it is still in flight would rewrite
 * /login to /dashboard before we know a sign-in page is needed (in login mode the
 * gate in AppContent shows it instead, and the URL should stay /login).
 */
function SignInRedirect() {
  const { status } = useAuth();
  return status === "loading" ? <PageFallback /> : <Navigate to="/dashboard" replace />;
}

function AppContent() {
  // Monitor API connection status
  useApiConnection();

  // Resolve the acting user once, up front (also learns whether sign-in is required).
  useSession();
  const { status, mode } = useAuth();

  // Login mode and no valid session: nothing but the sign-in page is reachable.
  if (mode === "login" && status === "login-required") {
    return (
      <Suspense fallback={<PageFallback />}>
        <Login />
      </Suspense>
    );
  }

  return (
    <ClientLayout>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          {/* Demo mode has no sign-in: old auth links land on the dashboard.
              In login mode a signed-in user is sent on, too (the Login page itself
              is rendered above whenever a session is missing). */}
          <Route path="/auth" element={<SignInRedirect />} />
          <Route path="/login" element={<SignInRedirect />} />
          <Route path="/signup" element={<SignInRedirect />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/proposals" element={<Proposals />} />
          <Route path="/proposals/upload" element={<UploadProposal />} />
          <Route path="/proposals/new" element={<NewProposal />} />
          <Route path="/proposals/create" element={<CreateProposal />} />
          <Route path="/proposals/:id/review" element={<ProposalReview />} />
          <Route path="/proposals/:id" element={<ProposalReview />} />
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ClientLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <ProposalProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AppContent />
        </TooltipProvider>
      </ProposalProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
