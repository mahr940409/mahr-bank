import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainLayout } from "./components/layout/MainLayout";
import { AuthGate } from "./components/auth/AuthGate";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import AccountDetail from "./pages/AccountDetail";
import Loans from "./pages/Loans";
import Payroll from "./pages/Payroll";
import Transactions from "./pages/Transactions";
import Admin from "./pages/Admin";
import CDTs from "./pages/CDTs";
import Countries from "./pages/Countries";
import NationalBanks from "./pages/NationalBanks";
import PrivateBanks from "./pages/PrivateBanks";
import CountryDetail from "./pages/CountryDetail";
import Commodities from "./pages/Commodities";
import Bonds from "./pages/Bonds";
import NotFound from "./pages/NotFound";
import Calculator from "./pages/Calculator";
import CashOut from "./pages/CashOut";
import Negotiables from "./pages/Negotiables";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthGate>
        <BrowserRouter>
          <Routes>
            <Route element={<MainLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/accounts/:id" element={<AccountDetail />} />
              <Route path="/loans" element={<Loans />} />
              <Route path="/payroll" element={<Payroll />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/cdts" element={<CDTs />} />
              <Route path="/countries" element={<Countries />} />
              <Route path="/national-banks" element={<NationalBanks />} />
              <Route path="/private-banks" element={<PrivateBanks />} />
              <Route path="/countries/:country" element={<CountryDetail />} />
              <Route path="/commodities" element={<Commodities />} />
              <Route path="/bonds" element={<Bonds />} />
              <Route path="/calculator" element={<Calculator />} />
              <Route path="/cash-out" element={<CashOut />} />
              <Route path="/negotiables" element={<Negotiables />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthGate>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
