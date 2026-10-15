import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBankData } from "@/hooks/useBankData";
import { formatNumber, formatCurrency, convertFromPDH } from "@/lib/currencyUtils";
import { Loader2, Building2, Users, CreditCard, TrendingUp, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { bankMainAccount, accounts, loans, transactions, loading } = useBankData();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-muted-foreground">Cargando datos...</p>
        </div>
      </div>
    );
  }

  const bankBalancePDH = bankMainAccount?.balance ?? 0;

  const activeLoans = loans.filter(l => l.status === 'active');
  const totalOutstanding = activeLoans.reduce((sum, l) => sum + l.outstandingBalance, 0);

  const recentTransactions = transactions.slice(0, 10);
  const deposits = recentTransactions.filter(t => t.type === 'deposit').reduce((sum, t) => sum + t.amount, 0);
  const withdrawals = recentTransactions.filter(t => t.type === 'withdrawal').reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Resumen general del sistema bancario MAHR</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Balance Principal</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(bankBalancePDH)} PDH</div>
            <p className="text-xs text-muted-foreground mt-1">
              Cuenta: {bankMainAccount?.accountNumber}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Cuentas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accounts.length}</div>
            <Link to="/accounts" className="text-xs text-primary hover:underline">
              Ver todas las cuentas →
            </Link>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Préstamos Activos</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeLoans.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Saldo pendiente: {formatCurrency(totalOutstanding, 'PDH')}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Transacciones</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{transactions.length}</div>
            <Link to="/transactions" className="text-xs text-primary hover:underline">
              Ver historial →
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Balance Principal (Equivalencias)
            </CardTitle>
            <CardDescription>Balance de la cuenta principal del banco</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="font-medium">KYD</span>
              <span className="text-lg font-semibold">{formatNumber(convertFromPDH(bankBalancePDH, 'KYD'))}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="font-medium">PDH</span>
              <span className="text-lg font-semibold">{formatNumber(bankBalancePDH)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Actividad Reciente
            </CardTitle>
            <CardDescription>Resumen de las últimas transacciones</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-green-600" />
                <span className="font-medium">Depósitos recientes</span>
              </div>
              <span className="text-lg font-semibold text-green-600">+{formatNumber(deposits)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/10">
              <div className="flex items-center gap-2">
                <ArrowDownRight className="h-4 w-4 text-red-600" />
                <span className="font-medium">Retiros recientes</span>
              </div>
              <span className="text-lg font-semibold text-red-600">-{formatNumber(withdrawals)}</span>
            </div>
            <div className="pt-2">
              <Link to="/transactions">
                <Button variant="outline" className="w-full">
                  Ver todas las transacciones
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Acciones Rápidas</CardTitle>
          <CardDescription>Accede rápidamente a las funciones más usadas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link to="/accounts"><Button variant="outline"><Users className="h-4 w-4 mr-2" />Nueva Cuenta</Button></Link>
            <Link to="/loans"><Button variant="outline"><CreditCard className="h-4 w-4 mr-2" />Solicitar Préstamo</Button></Link>
            <Link to="/payroll"><Button variant="outline"><Building2 className="h-4 w-4 mr-2" />Gestionar Nóminas</Button></Link>
            <Link to="/admin"><Button variant="outline"><TrendingUp className="h-4 w-4 mr-2" />Inyectar Capital</Button></Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
