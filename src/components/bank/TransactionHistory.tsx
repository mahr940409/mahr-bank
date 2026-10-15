import { useState, useMemo } from 'react';
import { formatNumber } from '@/lib/currencyUtils';
import { Transaction } from '@/types/bank';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ArrowDownToLine, ArrowUpFromLine, ArrowRightLeft, Receipt, DollarSign, Search, X, Landmark, TrendingUp, Banknote } from 'lucide-react';

interface TransactionHistoryProps {
  transactions: Transaction[];
}

export function TransactionHistory({ transactions }: TransactionHistoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  const filteredTransactions = useMemo(() => {
    return transactions.filter((txn) => {
      // Búsqueda por descripción
      if (searchTerm && !txn.description.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      
      // Filtro por tipo
      if (typeFilter !== 'all' && txn.type !== typeFilter) {
        return false;
      }
      
      // Filtro por moneda
      if (currencyFilter !== 'all' && txn.currency !== currencyFilter) {
        return false;
      }
      
      // Filtro por fecha desde
      if (dateFrom && new Date(txn.timestamp) < new Date(dateFrom)) {
        return false;
      }
      
      // Filtro por fecha hasta
      if (dateTo && new Date(txn.timestamp) > new Date(dateTo + 'T23:59:59')) {
        return false;
      }
      
      return true;
    });
  }, [transactions, searchTerm, typeFilter, currencyFilter, dateFrom, dateTo]);
  
  const clearFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setCurrencyFilter('all');
    setDateFrom('');
    setDateTo('');
  };
  
  const hasActiveFilters = searchTerm || typeFilter !== 'all' || currencyFilter !== 'all' || dateFrom || dateTo;
  const getTransactionIcon = (type: Transaction['type']) => {
    switch (type) {
      case 'deposit':
        return <ArrowDownToLine className="h-4 w-4 text-success" />;
      case 'withdrawal':
        return <ArrowUpFromLine className="h-4 w-4 text-destructive" />;
      case 'transfer':
        return <ArrowRightLeft className="h-4 w-4 text-primary" />;
      case 'fee':
        return <Receipt className="h-4 w-4 text-warning" />;
      case 'commission':
        return <DollarSign className="h-4 w-4 text-accent" />;
      case 'cdt_interest_payout':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'cdt_creation':
        return <Landmark className="h-4 w-4 text-blue-600" />;
      case 'cdt_liquidation':
        return <Banknote className="h-4 w-4 text-orange-600" />;
      case 'savings_interest':
        return <TrendingUp className="h-4 w-4 text-emerald-600" />;
      default:
        return null;
    }
  };
  
  const getTransactionTypeLabel = (type: Transaction['type']) => {
    const labels = {
      deposit: 'Depósito',
      withdrawal: 'Retiro',
      transfer: 'Transferencia',
      fee: 'Cuota',
      commission: 'Comisión',
      cdt_interest_payout: 'Interés CDT',
      cdt_creation: 'Creación CDT',
      cdt_liquidation: 'Liquidación CDT',
      cdt_maturity: 'Vencimiento CDT',
      loan_disbursement: 'Desembolso Préstamo',
      loan_payment: 'Pago Préstamo',
      savings_interest: 'Interés de Ahorro',
    };
    return labels[type];
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de Transacciones</CardTitle>
        <CardDescription>
          {filteredTransactions.length} de {transactions.length} transacciones
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtros */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Búsqueda */}
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por descripción..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            
            {/* Filtro de tipo */}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="deposit">Depósitos</SelectItem>
                <SelectItem value="withdrawal">Retiros</SelectItem>
                <SelectItem value="transfer">Transferencias</SelectItem>
                <SelectItem value="fee">Cuotas</SelectItem>
                <SelectItem value="commission">Comisiones</SelectItem>
                <SelectItem value="cdt_interest_payout">Interés CDT</SelectItem>
                <SelectItem value="cdt_creation">Creación CDT</SelectItem>
                <SelectItem value="cdt_liquidation">Liquidación CDT</SelectItem>
                <SelectItem value="savings_interest">Interés de Ahorro</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Filtro de moneda */}
            <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Moneda" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las monedas</SelectItem>
                <SelectItem value="KYD">KYD</SelectItem>
                <SelectItem value="PDH">PDH</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Botón limpiar */}
            {hasActiveFilters && (
              <Button
                variant="outline"
                onClick={clearFilters}
                className="gap-2"
              >
                <X className="h-4 w-4" />
                Limpiar
              </Button>
            )}
          </div>
          
          {/* Filtros de fecha */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Desde</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Hasta</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
        </div>
        <ScrollArea className="h-[400px]">
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
              {filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {transactions.length === 0 
                      ? 'No hay transacciones registradas'
                      : 'No se encontraron transacciones con los filtros aplicados'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.slice().reverse().map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getTransactionIcon(transaction.type)}
                        <Badge variant="outline">
                          {getTransactionTypeLabel(transaction.type)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-sm">{transaction.description}</p>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-semibold">
                          {formatNumber(transaction.amount)} {transaction.currency}
                        </p>
                        {transaction.commission && (
                          <p className="text-xs text-muted-foreground">
                            Comisión: {formatNumber(transaction.commission)} {transaction.commissionCurrency}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(transaction.timestamp).toLocaleString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
