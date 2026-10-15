import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBankData } from "@/hooks/useBankData";
import { TransactionHistory } from "@/components/bank/TransactionHistory";
import { formatNumber } from "@/lib/currencyUtils";
import { Loader2, FileText, ArrowUpRight, ArrowDownRight, ArrowLeftRight } from "lucide-react";

export default function Transactions() {
  const { transactions, loading } = useBankData();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-muted-foreground">Cargando transacciones...</p>
        </div>
      </div>
    );
  }

  const deposits = transactions.filter(t => t.type === 'deposit');
  const withdrawals = transactions.filter(t => t.type === 'withdrawal');
  const transfers = transactions.filter(t => t.type === 'transfer');

  const totalDeposits = deposits.reduce((sum, t) => sum + t.amount, 0);
  const totalWithdrawals = withdrawals.reduce((sum, t) => sum + t.amount, 0);
  const totalTransfers = transfers.reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Transacciones</h1>
        <p className="text-muted-foreground">Historial completo de movimientos bancarios</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{transactions.length}</div>
            <p className="text-xs text-muted-foreground">Transacciones registradas</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Depósitos</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{deposits.length}</div>
            <p className="text-xs text-muted-foreground">Total: {formatNumber(totalDeposits)} PDH</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Retiros</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{withdrawals.length}</div>
            <p className="text-xs text-muted-foreground">Total: {formatNumber(totalWithdrawals)} PDH</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Transferencias</CardTitle>
            <ArrowLeftRight className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{transfers.length}</div>
            <p className="text-xs text-muted-foreground">Total: {formatNumber(totalTransfers)} PDH</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      <TransactionHistory transactions={transactions} />
    </div>
  );
}
