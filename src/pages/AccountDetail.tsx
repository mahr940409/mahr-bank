import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBankData } from "@/hooks/useBankData";
import { formatNumber, formatCurrency } from "@/lib/currencyUtils";
import { Loader2, ArrowLeft, User, Building2, Wallet, CreditCard, FileText, ArrowUpRight, ArrowDownRight, ArrowLeftRight, Globe } from "lucide-react";
import { useState } from "react";
import { OperationsDialog } from "@/components/bank/OperationsDialog";
import { LoanRequestDialog } from "@/components/bank/LoanRequestDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const { accounts, bankMainAccount, transactions, loans, loanPayments, loading, handleDeposit, handleWithdrawal, handleTransfer, handleTransferToNational, requestLoan, payLoanInstallment } = useBankData();
  const [isOperationsDialogOpen, setIsOperationsDialogOpen] = useState(false);
  const [isLoanDialogOpen, setIsLoanDialogOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-muted-foreground">Cargando cuenta...</p>
        </div>
      </div>
    );
  }

  const account = id === 'bank-main' && bankMainAccount
    ? {
        ...bankMainAccount,
        userId: 'bank',
        userName: 'MAHR Bank - Cuenta Principal',
        type: 'business' as const,
        monthlyFee: 0,
        createdAt: new Date(),
        currency: 'PDH',
      }
    : accounts.find(a => a.id === id);

  if (!account) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-2">Cuenta no encontrada</h2>
        <p className="text-muted-foreground mb-4">La cuenta que buscas no existe.</p>
        <Link to="/accounts">
          <Button><ArrowLeft className="h-4 w-4 mr-2" />Volver a cuentas</Button>
        </Link>
      </div>
    );
  }

  const accountTransactions = transactions.filter(
    t => t.fromAccountId === account.id || t.toAccountId === account.id
  );
  const accountLoans = loans.filter(l => l.accountId === account.id);
  const activeLoans = accountLoans.filter(l => l.status === 'active');

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deposit': return <ArrowUpRight className="h-4 w-4 text-green-600" />;
      case 'withdrawal': return <ArrowDownRight className="h-4 w-4 text-red-600" />;
      case 'transfer': return <ArrowLeftRight className="h-4 w-4 text-blue-600" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/accounts">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{account.userName}</h1>
          <p className="text-muted-foreground">{account.accountNumber}</p>
        </div>
        <div className="flex items-center gap-2">
          {account.countryName && (
            <Badge variant="outline" className="gap-1">
              <Globe className="h-3 w-3" />
              {account.countryName}
            </Badge>
          )}
          <Badge variant={account.type === 'business' ? 'default' : 'secondary'}>
            {account.type === 'business' ? 'Empresa' : 'Personal'}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {account.type === 'business' ? <Building2 className="h-5 w-5" /> : <User className="h-5 w-5" />}
              Información de la Cuenta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Tipo de cuenta</p>
                <p className="font-medium">{account.type === 'business' ? 'Empresarial' : 'Personal'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Moneda</p>
                <p className="font-medium">{account.currency}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cuota mensual</p>
                <p className="font-medium">{formatNumber(account.monthlyFee)} PDH</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Préstamos activos</p>
                <p className="font-medium">{activeLoans.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Creada</p>
                <p className="font-medium">{format(account.createdAt, 'dd/MM/yyyy', { locale: es })}</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button onClick={() => setIsOperationsDialogOpen(true)} className="flex-1 whitespace-normal h-auto py-2">
                <Wallet className="h-4 w-4 mr-2 shrink-0" />Operaciones
              </Button>
              <Button variant="outline" onClick={() => setIsLoanDialogOpen(true)} className="flex-1 whitespace-normal h-auto py-2">
                <CreditCard className="h-4 w-4 mr-2 shrink-0" />Solicitar Préstamo
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />Balance
            </CardTitle>
            <CardDescription>Moneda: {account.currency}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center p-6 rounded-lg bg-muted/50">
              <div className="text-center">
                <span className="text-4xl font-bold">{formatNumber(account.balance)}</span>
                <span className="text-xl ml-2 text-muted-foreground">{account.currency}</span>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
              <div className="rounded-md bg-muted/40 p-3"><p className="text-muted-foreground">Saldo real</p><p className="font-semibold">{formatNumber(account.balanceReal ?? account.balance)} {account.currency}</p></div>
              <div className="rounded-md bg-muted/40 p-3"><p className="text-muted-foreground">Saldo simbólico</p><p className="font-semibold">{formatNumber(account.balanceSymbolic ?? 0)} {account.currency}</p></div>
              <div className="rounded-md bg-muted/40 p-3"><p className="text-muted-foreground">Saldo congelado</p><p className="font-semibold">{formatNumber(account.balanceFrozen ?? 0)} {account.currency}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {accountLoans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />Préstamos
            </CardTitle>
            <CardDescription>{accountLoans.length} préstamos en esta cuenta</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Monto</TableHead>
                  <TableHead>Tasa</TableHead>
                  <TableHead>Cuota semanal</TableHead>
                  <TableHead>Saldo pendiente</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountLoans.map((loan) => (
                  <TableRow key={loan.id}>
                    <TableCell className="font-medium">{formatCurrency(loan.amount, 'PDH')}</TableCell>
                    <TableCell>{loan.interestRate}%</TableCell>
                    <TableCell>{formatCurrency(loan.monthlyPayment, 'PDH')}</TableCell>
                    <TableCell>{formatCurrency(loan.outstandingBalance, 'PDH')}</TableCell>
                    <TableCell>
                      <Badge variant={loan.status === 'active' ? 'default' : loan.status === 'completed' ? 'secondary' : 'outline'}>
                        {loan.status === 'active' ? 'Activo' : loan.status === 'completed' ? 'Completado' : loan.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />Historial de Transacciones
          </CardTitle>
          <CardDescription>{accountTransactions.length} transacciones</CardDescription>
        </CardHeader>
        <CardContent>
          {accountTransactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay transacciones registradas</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountTransactions.slice(0, 20).map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getTransactionIcon(transaction.type)}
                        <span className="capitalize">{transaction.type}</span>
                      </div>
                    </TableCell>
                    <TableCell>{transaction.description}</TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(transaction.amount, transaction.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(transaction.timestamp, 'dd/MM/yyyy HH:mm', { locale: es })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {bankMainAccount && (
        <OperationsDialog
          open={isOperationsDialogOpen}
          onOpenChange={setIsOperationsDialogOpen}
          accounts={[
            { ...bankMainAccount, userId: 'bank', userName: 'MAHR Bank - Cuenta Principal', type: 'business' as const, monthlyFee: 0, createdAt: new Date(), currency: 'PDH' },
            ...accounts,
          ]}
          selectedAccountId={account.id}
          onDeposit={handleDeposit}
          onWithdrawal={handleWithdrawal}
          onTransfer={handleTransfer}
          onTransferToNational={handleTransferToNational}
        />
      )}

      <LoanRequestDialog
        open={isLoanDialogOpen}
        onOpenChange={setIsLoanDialogOpen}
        accounts={accounts}
        onSubmit={requestLoan}
      />
    </div>
  );
}
