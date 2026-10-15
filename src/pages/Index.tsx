import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AccountCard } from '@/components/bank/AccountCard';
import { CreateAccountDialog } from '@/components/bank/CreateAccountDialog';
import { OperationsDialog } from '@/components/bank/OperationsDialog';
import { TransactionHistory } from '@/components/bank/TransactionHistory';
import { LoansPanel } from '@/components/bank/LoansPanel';
import { LoanRequestDialog } from '@/components/bank/LoanRequestDialog';
import { CapitalInjectionDialog } from '@/components/bank/CapitalInjectionDialog';
import { PayrollPanel } from '@/components/bank/PayrollPanel';
import { PlusCircle, ArrowRightLeft, Building2, TrendingUp, Loader2, CreditCard, Banknote, Users } from 'lucide-react';
import { convertFromPDH, formatNumber } from '@/lib/currencyUtils';
import { useBankData } from '@/hooks/useBankData';
import { usePayrollData } from '@/hooks/usePayrollData';

const Index = () => {
  const {
    bankMainAccount,
    accounts,
    transactions,
    loans,
    loanPayments,
    loading: bankLoading,
    createAccount,
    handleDeposit,
    handleWithdrawal,
    handleTransfer,
    requestLoan,
    payLoanInstallment,
    injectCapital,
  } = useBankData();

  const {
    payrolls,
    payments: payrollPayments,
    loading: payrollLoading,
    createPayroll,
    addEmployee,
    removeEmployee,
    processPayroll,
    togglePayrollActive,
    deletePayroll,
  } = usePayrollData();

  const loading = bankLoading || payrollLoading;
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [operationsDialogOpen, setOperationsDialogOpen] = useState(false);
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [capitalDialogOpen, setCapitalDialogOpen] = useState(false);
  
  const totalBalanceInPDH = 
    bankMainAccount.balance +
    accounts.reduce((sum, acc) => sum + acc.balance, 0);
  
  const bankBalanceInPDH = bankMainAccount.balance;
  const bankBalances = { KYD: convertFromPDH(bankBalanceInPDH, 'KYD'), PDH: bankBalanceInPDH };

  const activeLoans = loans.filter(l => l.status === 'active');
  const totalLoansAmount = activeLoans.reduce((sum, l) => sum + l.outstandingBalance, 0);
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Cargando sistema bancario...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">MAHR Bank</h1>
                <p className="text-sm text-muted-foreground">Panel de Administración</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
                <PlusCircle className="h-4 w-4" />
                Nueva Cuenta
              </Button>
              <Button onClick={() => setLoanDialogOpen(true)} variant="secondary" className="gap-2">
                <CreditCard className="h-4 w-4" />
                Solicitar Préstamo
              </Button>
              <Button onClick={() => setOperationsDialogOpen(true)} variant="outline" className="gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                Operaciones
              </Button>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-accent">
            <CardHeader className="pb-3">
              <CardDescription>Cuenta Principal MAHR Bank</CardDescription>
              <CardTitle className="text-3xl font-bold text-accent">
                {formatNumber(bankBalanceInPDH)} PDH
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">KYD</p>
                  <p className="font-semibold">{formatNumber(bankBalances.KYD)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">PDH</p>
                  <p className="font-semibold">{formatNumber(bankBalances.PDH)}</p>
                </div>
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                className="w-full gap-2"
                onClick={() => setCapitalDialogOpen(true)}
              >
                <Banknote className="h-4 w-4" />
                Inyectar Capital
              </Button>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total de Cuentas</CardDescription>
              <CardTitle className="text-3xl font-bold">{accounts.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Personales</p>
                  <p className="font-semibold">{accounts.filter(a => a.type === 'personal').length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Empresariales</p>
                  <p className="font-semibold">{accounts.filter(a => a.type === 'business').length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Préstamos Activos</CardDescription>
              <CardTitle className="text-3xl font-bold text-orange-500">{activeLoans.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                <p className="text-muted-foreground">Saldo por cobrar</p>
                <p className="font-semibold">{formatNumber(totalLoansAmount)} PDH</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Balance Total del Sistema</CardDescription>
              <CardTitle className="text-3xl font-bold text-success">
                {formatNumber(totalBalanceInPDH)} PDH
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-success">
                <TrendingUp className="h-4 w-4" />
                <span>Todas las cuentas</span>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Tabs for different sections */}
        <Tabs defaultValue="accounts" className="space-y-6">
          <TabsList>
            <TabsTrigger value="accounts">Cuentas</TabsTrigger>
            <TabsTrigger value="payroll">Nóminas</TabsTrigger>
            <TabsTrigger value="loans">Préstamos</TabsTrigger>
            <TabsTrigger value="transactions">Transacciones</TabsTrigger>
          </TabsList>

          <TabsContent value="accounts">
            {/* Accounts Grid */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Cuentas de Clientes</h2>
              {accounts.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground mb-4">No hay cuentas creadas aún</p>
                    <Button onClick={() => setCreateDialogOpen(true)} variant="outline">
                      Crear primera cuenta
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...accounts]
                    .sort((a, b) => a.userName.localeCompare(b.userName))
                    .map((account) => (
                      <AccountCard key={account.id} account={account} />
                    ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="payroll">
            <PayrollPanel
              payrolls={payrolls}
              payments={payrollPayments}
              accounts={accounts}
              bankMainAccount={bankMainAccount}
              onCreatePayroll={createPayroll}
              onAddEmployee={addEmployee}
              onRemoveEmployee={removeEmployee}
              onProcessPayroll={processPayroll}
              onTogglePayroll={togglePayrollActive}
              onDeletePayroll={deletePayroll}
            />
          </TabsContent>

          <TabsContent value="loans">
            <LoansPanel 
              loans={loans} 
              payments={loanPayments} 
              onPayment={payLoanInstallment}
            />
          </TabsContent>

          <TabsContent value="transactions">
            <TransactionHistory transactions={transactions} />
          </TabsContent>
        </Tabs>
      </main>
      
      {/* Dialogs */}
      <CreateAccountDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreateAccount={createAccount}
      />
      
      <OperationsDialog
        open={operationsDialogOpen}
        onOpenChange={setOperationsDialogOpen}
        accounts={[
          { ...bankMainAccount, userId: 'bank', userName: 'MAHR Bank - Cuenta Principal', type: 'business' as const, monthlyFee: 0, createdAt: new Date(), currency: 'PDH' },
          ...accounts,
        ]}
        onDeposit={handleDeposit}
        onWithdrawal={handleWithdrawal}
        onTransfer={handleTransfer}
      />

      <LoanRequestDialog
        open={loanDialogOpen}
        onOpenChange={setLoanDialogOpen}
        accounts={accounts}
        onSubmit={requestLoan}
      />

      <CapitalInjectionDialog
        open={capitalDialogOpen}
        onOpenChange={setCapitalDialogOpen}
        onInject={injectCapital}
      />
    </div>
  );
};

export default Index;
