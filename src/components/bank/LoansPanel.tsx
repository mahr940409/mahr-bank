import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loan, LoanPayment } from '@/types/bank';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { CreditCard, Calendar, DollarSign, AlertCircle, CheckCheck, Coins } from 'lucide-react';
import { formatNumber } from '@/lib/currencyUtils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface LoansPanelProps {
  loans: Loan[];
  payments: LoanPayment[];
  onPayment: (loanId: string, paymentId: string) => void;
  onPayInFull?: (loanId: string) => void;
  onExtraPayment?: (loanId: string, amount: number) => void;
}

export function LoansPanel({ loans, payments, onPayment, onPayInFull, onExtraPayment }: LoansPanelProps) {
  const [abonoLoanId, setAbonoLoanId] = useState<string | null>(null);
  const [abonoAmount, setAbonoAmount] = useState('');
  const [confirmLoanId, setConfirmLoanId] = useState<string | null>(null);
  const confirmLoan = loans.find(l => l.id === confirmLoanId);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'completed': return 'bg-blue-500';
      case 'defaulted': return 'bg-red-500';
      case 'approved': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const activeAbonoLoan = loans.find(l => l.id === abonoLoanId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Préstamos</h2>
      </div>

      {loans.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay préstamos registrados
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {loans.map((loan) => {
            const loanPayments = payments
              .filter(p => p.loanId === loan.id)
              .sort((a, b) => a.paymentNumber - b.paymentNumber);
            const nextPayment = loanPayments.find(p => p.status !== 'paid');
            const overduePayments = loanPayments.filter(p => p.status === 'overdue');
            const isActive = loan.status === 'active' || loan.status === 'approved';

            return (
              <Card key={loan.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Préstamo #{loan.id.slice(0, 8)}
                      </CardTitle>
                      <CardDescription>
                        {loan.termMonths} semanas al {loan.interestRate}% anual
                      </CardDescription>
                    </div>
                    <Badge className={getStatusColor(loan.status)}>
                      {loan.status === 'active' && 'Activo'}
                      {loan.status === 'completed' && 'Completado'}
                      {loan.status === 'defaulted' && 'Moroso'}
                      {loan.status === 'approved' && 'Aprobado'}
                      {loan.status === 'pending' && 'Pendiente'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Monto original</p>
                      <p className="text-lg font-semibold">{formatNumber(loan.amount)} {loan.currency}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Saldo pendiente</p>
                      <p className="text-lg font-semibold">{formatNumber(loan.outstandingBalance)} {loan.currency}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Cuota semanal</p>
                      <p className="text-lg font-semibold">{formatNumber(loan.monthlyPayment)} {loan.currency}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Pagos realizados</p>
                      <p className="text-lg font-semibold">
                        {loanPayments.filter(p => p.status === 'paid').length} / {loan.termMonths}
                      </p>
                    </div>
                  </div>

                  {overduePayments.length > 0 && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-md">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <span className="text-sm text-destructive font-medium">
                        {overduePayments.length} pago(s) vencido(s)
                      </span>
                    </div>
                  )}

                  {nextPayment && (
                    <div className="border-t pt-4">
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Próximo pago #{nextPayment.paymentNumber} — Vence: {formatDistanceToNow(new Date(nextPayment.dueDate), { addSuffix: true, locale: es })}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Capital: {formatNumber(nextPayment.principal)} + Interés: {formatNumber(nextPayment.interest)} {loan.currency}
                        {nextPayment.penalty > 0 && ` + Penalidad: ${formatNumber(nextPayment.penalty)}`}
                      </p>
                      <p className="text-base font-semibold mt-1 flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        {formatNumber(nextPayment.amount + nextPayment.penalty)} {loan.currency}
                      </p>
                    </div>
                  )}

                  {isActive && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      <Button
                        size="sm"
                        onClick={() => nextPayment && onPayment(loan.id, nextPayment.id)}
                      >
                        <DollarSign className="h-4 w-4 mr-1" /> Pagar Cuota
                      </Button>
                      {onExtraPayment && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => { setAbonoLoanId(loan.id); setAbonoAmount(''); }}
                        >
                          <Coins className="h-4 w-4 mr-1" /> Abonar
                        </Button>
                      )}
                      {onPayInFull && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmLoanId(loan.id)}
                        >
                          <CheckCheck className="h-4 w-4 mr-1" /> Liquidar Total
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!abonoLoanId} onOpenChange={(o) => !o && setAbonoLoanId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abonar a capital</DialogTitle>
            <DialogDescription>
              {activeAbonoLoan && (
                <>Saldo pendiente: {formatNumber(activeAbonoLoan.outstandingBalance)} {activeAbonoLoan.currency}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Monto a abonar ({activeAbonoLoan?.currency})</Label>
            <Input
              type="number"
              step="0.01"
              value={abonoAmount}
              onChange={(e) => setAbonoAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbonoLoanId(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                const amt = parseFloat(abonoAmount);
                if (!isNaN(amt) && amt > 0 && abonoLoanId && onExtraPayment) {
                  onExtraPayment(abonoLoanId, amt);
                  setAbonoLoanId(null);
                }
              }}
            >
              Abonar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!confirmLoanId} onOpenChange={(open) => !open && setConfirmLoanId(null)} title="Liquidar préstamo" description={confirmLoan ? `¿Liquidar préstamo por ${formatNumber(confirmLoan.outstandingBalance)} ${confirmLoan.currency}?` : 'Confirma la liquidación del préstamo.'} confirmLabel="Liquidar" onConfirm={async () => { if (confirmLoanId) onPayInFull?.(confirmLoanId); setConfirmLoanId(null); }} />
    </div>
  );
}
