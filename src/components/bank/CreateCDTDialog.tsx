import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Account } from "@/types/bank";
import { calculateCDTReturn, calculatePeriodicInterest, InterestPayoutFrequency } from "@/types/cdt";
import { getCDTRates } from "@/hooks/useBankSettings";
import { formatCurrency } from "@/lib/currencyUtils";
import { Calculator, TrendingUp } from "lucide-react";

interface CreateCDTDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  onCreateCDT: (accountId: string, amount: number, currency: string, termWeeks: number, frequency: InterestPayoutFrequency, isIndefinite: boolean) => Promise<void>;
}

export function CreateCDTDialog({ open, onOpenChange, accounts, onCreateCDT }: CreateCDTDialogProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [termWeeks, setTermWeeks] = useState<string>("8");
  const [frequency, setFrequency] = useState<InterestPayoutFrequency>("at_maturity");
  const [isIndefinite, setIsIndefinite] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedAccount = accounts.find(acc => acc.id === selectedAccountId);
  const currency = selectedAccount?.currency || "PDH";

  const rates = getCDTRates();
  const rate = rates[parseInt(termWeeks)] || 0.06;
  const amountNum = parseFloat(amount) || 0;
  const finalAmount = isIndefinite ? amountNum : calculateCDTReturn(amountNum, rate, parseInt(termWeeks));
  const interest = finalAmount - amountNum;

  const dailyInterest = calculatePeriodicInterest(amountNum, rate, 'daily');
  const weeklyInterest = calculatePeriodicInterest(amountNum, rate, 'weekly');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId || !amount || amountNum <= 0) return;

    setLoading(true);
    try {
      await onCreateCDT(selectedAccountId, amountNum, currency, isIndefinite ? 0 : parseInt(termWeeks), frequency, isIndefinite);
      onOpenChange(false);
      setAmount("");
      setSelectedAccountId("");
      setIsIndefinite(false);
      setFrequency("at_maturity");
    } finally {
      setLoading(false);
    }
  };

  // When indefinite is toggled, force frequency to daily or weekly
  const handleIndefiniteChange = (checked: boolean) => {
    setIsIndefinite(checked);
    if (checked && frequency === 'at_maturity') {
      setFrequency('weekly');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Crear CDT
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Cuenta de origen</Label>
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cuenta" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {accounts.map(account => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.userName} — Saldo: {formatCurrency(account.balance, account.currency)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Monto ({currency})</Label>
            <NumberInput
              value={amount}
              onChange={setAmount}
              placeholder="0"
            />
          </div>

          {/* Indefinite toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div>
              <Label className="text-sm font-medium">CDT Indefinido</Label>
              <p className="text-xs text-muted-foreground">Sin fecha de vencimiento, cancela cuando quieras</p>
            </div>
            <Switch checked={isIndefinite} onCheckedChange={handleIndefiniteChange} />
          </div>

          {!isIndefinite && (
            <div className="space-y-2">
              <Label>Plazo</Label>
              <Select value={termWeeks} onValueChange={setTermWeeks}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">4 semanas - {(rates[4] * 100).toFixed(1)}% anual</SelectItem>
                  <SelectItem value="8">8 semanas - {(rates[8] * 100).toFixed(1)}% anual</SelectItem>
                  <SelectItem value="12">12 semanas - {(rates[12] * 100).toFixed(1)}% anual</SelectItem>
                  <SelectItem value="24">24 semanas - {(rates[24] * 100).toFixed(1)}% anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Interest payout frequency */}
          <div className="space-y-2">
            <Label>Pago de intereses</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as InterestPayoutFrequency)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Diario</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                {!isIndefinite && <SelectItem value="at_maturity">Al vencimiento</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {amountNum > 0 && (
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-center gap-2 mb-3">
                <Calculator className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Proyección</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Capital:</span>
                  <span>{formatCurrency(amountNum, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tasa anual:</span>
                  <span>{(rate * 100).toFixed(1)}%</span>
                </div>
                {frequency === 'daily' && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Interés diario:</span>
                    <span className="text-green-600">+{formatCurrency(dailyInterest, currency)}</span>
                  </div>
                )}
                {frequency === 'weekly' && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Interés semanal:</span>
                    <span className="text-green-600">+{formatCurrency(weeklyInterest, currency)}</span>
                  </div>
                )}
                {!isIndefinite && frequency === 'at_maturity' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Interés total:</span>
                      <span className="text-green-600">+{formatCurrency(interest, currency)}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t pt-2">
                      <span>Total al vencimiento:</span>
                      <span>{formatCurrency(finalAmount, currency)}</span>
                    </div>
                  </>
                )}
                {isIndefinite && (
                  <div className="text-xs text-muted-foreground border-t pt-2">
                    Los intereses se pagarán {frequency === 'daily' ? 'diariamente' : 'semanalmente'} a tu cuenta. Cancela cuando quieras.
                  </div>
                )}
              </div>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading || !selectedAccountId || amountNum <= 0}>
            {loading ? "Creando..." : "Crear CDT"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
