import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProposalProvider } from "@/context/ProposalContext";
import ClientLayout from "@/components/layout/ClientLayout";
import Home from "@/pages/Home";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Proposals from "@/pages/Proposals";
import UploadProposal from "@/pages/UploadProposal";
import NewProposal from "@/pages/NewProposal";
import CreateProposal from "@/pages/CreateProposal";
import ProposalReview from "@/pages/ProposalReview";
import Compliance from "@/pages/Compliance";
import Integrations from "@/pages/Integrations";
import Audit from "@/pages/Audit";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ProposalProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ClientLayout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/login" element={<Auth />} />
              <Route path="/signup" element={<Auth />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/proposals" element={<Proposals />} />
              <Route path="/proposals/upload" element={<UploadProposal />} />
              <Route path="/proposals/new" element={<NewProposal />} />
              <Route path="/proposals/create" element={<CreateProposal />} />
              <Route path="/proposals/:id/review" element={<ProposalReview />} />
              <Route path="/proposals/:id" element={<ProposalReview />} />
              <Route path="/compliance" element={<Compliance />} />
              <Route path="/integrations" element={<Integrations />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ClientLayout>
        </BrowserRouter>
      </TooltipProvider>
    </ProposalProvider>
  </QueryClientProvider>
);

export default App;