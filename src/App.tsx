import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProposalProvider } from "@/context/ProposalProvider";
import { useApiConnection } from "@/hooks/use-api-connection";
import { useSession } from "@/hooks/use-session";
import ClientLayout from "@/components/layout/ClientLayout";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Proposals from "@/pages/Proposals";
import UploadProposal from "@/pages/UploadProposal";
import NewProposal from "@/pages/NewProposal";
import CreateProposal from "@/pages/CreateProposal";
import ProposalReview from "@/pages/ProposalReview";
import Compliance from "@/pages/Compliance";
import Integrations from "@/pages/Integrations";
import Settings from "@/pages/Settings";
import Audit from "@/pages/Audit";
import Analytics from "@/pages/Analytics";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function AppContent() {
  // Monitor API connection status
  useApiConnection();

  // No login screen: resolve the acting user once, up front.
  useSession();

  return (
    <ClientLayout>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* Sign-in was removed — old auth links land on the dashboard. */}
        <Route path="/auth" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route path="/signup" element={<Navigate to="/dashboard" replace />} />
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