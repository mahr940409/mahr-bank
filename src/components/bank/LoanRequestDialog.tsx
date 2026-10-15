import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Account } from '@/types/bank';
import { calculateWeeklyPayment, getInterestRateByAccountType, checkLoanEligibility } from '@/lib/loanOperations';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatNumber } from '@/lib/currencyUtils';

interface LoanRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  onSubmit: (accountId: string, amount: number, termWeeks: number) => void;
}

export function LoanRequestDialog({ open, onOpenChange, accounts, onSubmit }: LoanRequestDialogProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [termWeeks, setTermWeeks] = useState<string>('12');
  const [eligibilityCheck, setEligibilityCheck] = useState<{
    eligible: boolean;
    reason?: string;
    maxAmount?: number;
  } | null>(null);

  const selectedAccount = accounts.find(acc => acc.id === selectedAccountId);
  const currency = selectedAccount?.currency || 'PDH';
  const interestRate = selectedAccount ? getInterestRateByAccountType(selectedAccount.type) : 0;
  const weeklyPayment = amount && termWeeks 
    ? calculateWeeklyPayment(parseFloat(amount) || 0, interestRate, parseInt(termWeeks) || 1)
    : 0;

  const handleCheckEligibility = () => {
    if (!selectedAccount || !amount || !termWeeks) {
      return;
    }

    const result = checkLoanEligibility(
      selectedAccount,
      parseFloat(amount),
      parseInt(termWeeks)
    );
    setEligibilityCheck(result);
  };

  const handleSubmit = () => {
    if (!selectedAccountId || !amount || !termWeeks) {
      return;
    }

    if (eligibilityCheck && !eligibilityCheck.eligible) {
      return;
    }

    onSubmit(selectedAccountId, parseFloat(amount), parseInt(termWeeks));
    setSelectedAccountId('');
    setAmount('');
    setTermWeeks('12');
    setEligibilityCheck(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Solicitar Préstamo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Cuenta</Label>
            <Select value={selectedAccountId} onValueChange={(value) => {
              setSelectedAccountId(value);
              setEligibilityCheck(null);
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cuenta" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {accounts.filter(acc => acc.accountNumber !== 'MAHR-BANK-000001').map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.accountNumber} - {account.userName} ({account.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedAccount && (
            <Alert>
              <AlertDescription>
                Saldo actual: {formatNumber(selectedAccount.balance)} {currency}
                <br />
                Tasa de interés: {interestRate}% anual
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Monto a solicitar ({currency})</Label>
            <NumberInput
              value={amount}
              onChange={(val) => {
                setAmount(val);
                setEligibilityCheck(null);
              }}
              placeholder="Ej: 5.000"
            />
          </div>

          <div className="space-y-2">
            <Label>Plazo (semanas)</Label>
            <Select value={termWeeks} onValueChange={(value) => {
              setTermWeeks(value);
              setEligibilityCheck(null);
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                <SelectItem value="4">4 semanas</SelectItem>
                <SelectItem value="8">8 semanas</SelectItem>
                <SelectItem value="12">12 semanas</SelectItem>
                <SelectItem value="16">16 semanas</SelectItem>
                <SelectItem value="24">24 semanas</SelectItem>
                <SelectItem value="36">36 semanas</SelectItem>
                <SelectItem value="48">48 semanas</SelectItem>
                <SelectItem value="52">52 semanas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {weeklyPayment > 0 && (
            <Alert>
              <AlertDescription>
                <strong>Cuota semanal estimada:</strong> {formatNumber(weeklyPayment)} {currency}
                <br />
                <strong>Total a pagar:</strong> {formatNumber(weeklyPayment * parseInt(termWeeks))} {currency}
              </AlertDescription>
            </Alert>
          )}

          {eligibilityCheck && (
            <Alert variant={eligibilityCheck.eligible ? "default" : "destructive"}>
              {eligibilityCheck.eligible ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                {eligibilityCheck.eligible 
                  ? '¡Préstamo elegible para aprobación automática!' 
                  : eligibilityCheck.reason}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleCheckEligibility}
              disabled={!selectedAccountId || !amount || !termWeeks}
            >
              Verificar Elegibilidad
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!selectedAccountId || !amount || !termWeeks || (eligibilityCheck && !eligibilityCheck.eligible)}
              className="flex-1"
            >
              Solicitar Préstamo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
