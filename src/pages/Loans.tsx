import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBankData } from "@/hooks/useBankData";
import { LoansPanel } from "@/components/bank/LoansPanel";
import { LoanRequestDialog } from "@/components/bank/LoanRequestDialog";
import { formatNumber, convertToPDH } from "@/lib/currencyUtils";
import { Loader2, Plus, CreditCard, TrendingUp, Clock, CheckCircle } from "lucide-react";

export default function Loans() {
  const { accounts, loans, loanPayments, loading, requestLoan, payLoanInstallment, payLoanInFull, makeLoanExtraPayment } = useBankData();
  const [isLoanDialogOpen, setIsLoanDialogOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-muted-foreground">Cargando préstamos...</p>
        </div>
      </div>
    );
  }

  const activeLoans = loans.filter(l => l.status === 'active');
  const completedLoans = loans.filter(l => l.status === 'completed');
  const pendingLoans = loans.filter(l => l.status === 'pending');
  // Convert each loan amount to PDH since loans can be in different currencies
  const totalOutstanding = activeLoans.reduce((sum, l) => sum + convertToPDH(l.outstandingBalance, l.currency || 'PDH'), 0);
  const totalLent = loans.reduce((sum, l) => sum + convertToPDH(l.amount, l.currency || 'PDH'), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Préstamos</h1>
          <p className="text-muted-foreground">Gestiona los préstamos del banco</p>
        </div>
        <Button onClick={() => setIsLoanDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Préstamo
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Prestado</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totalLent)} PDH</div>
            <p className="text-xs text-muted-foreground">{loans.length} préstamos totales</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Saldo Pendiente</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totalOutstanding)} PDH</div>
            <p className="text-xs text-muted-foreground">{activeLoans.length} préstamos activos</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingLoans.length}</div>
            <p className="text-xs text-muted-foreground">Por aprobar</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completados</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedLoans.length}</div>
            <p className="text-xs text-muted-foreground">Pagados en su totalidad</p>
          </CardContent>
        </Card>
      </div>

      {/* Loans Panel */}
      <LoansPanel
        loans={loans}
        payments={loanPayments}
        onPayment={payLoanInstallment}
        onPayInFull={payLoanInFull}
        onExtraPayment={makeLoanExtraPayment}
      />

      <LoanRequestDialog
        open={isLoanDialogOpen}
        onOpenChange={setIsLoanDialogOpen}
        accounts={accounts}
        onSubmit={requestLoan}
      />
    </div>
  );
}
