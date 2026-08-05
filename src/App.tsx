import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { useServiceWorker } from "@/hooks/useServiceWorker";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import LegalPage from "./pages/LegalPage";
import PrivacyPage from "./pages/PrivacyPage";
import GlobalLibraryPage from "./pages/GlobalLibraryPage";
import IdentityWarningBanner from "./components/IdentityWarningBanner";
import UpdateAvailableDialog from "./components/UpdateAvailableDialog";

const queryClient = new QueryClient();

// Active la détection des mises à jour PWA dès le chargement
const ServiceWorkerWatcher = () => {
  useServiceWorker();
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <SettingsProvider>
          <Sonner position="top-center" />
          <BrowserRouter>
            <ServiceWorkerWatcher />
            <IdentityWarningBanner />
            <UpdateAvailableDialog />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/legal" element={<LegalPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/library" element={<GlobalLibraryPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </SettingsProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
