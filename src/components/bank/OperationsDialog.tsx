import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Account } from '@/types/bank';
import { ArrowDownToLine, ArrowUpFromLine, ArrowRightLeft, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getBankSettings } from '@/hooks/useBankSettings';
import { formatNumber, convertToPDH } from '@/lib/currencyUtils';

interface OperationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  selectedAccountId?: string;
  onDeposit: (accountId: string, amount: number, currency: string) => void;
  onWithdrawal: (accountId: string, amount: number, currency: string) => void;
  onTransfer: (fromAccountId: string, toAccountId: string, amount: number, currency: string) => void;
}

export function OperationsDialog({
  open,
  onOpenChange,
  accounts,
  selectedAccountId,
  onDeposit,
  onWithdrawal,
  onTransfer,
}: OperationsDialogProps) {
  const [currencies, setCurrencies] = useState<{ iso_symbol: string; name: string }[]>([]);
  
  const [depositAccount, setDepositAccount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositCurrency, setDepositCurrency] = useState('PDH');
  
  const [withdrawalAccount, setWithdrawalAccount] = useState('');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalCurrency, setWithdrawalCurrency] = useState('PDH');
  
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferCurrency, setTransferCurrency] = useState('PDH');

  useEffect(() => {
    if (open && selectedAccountId) {
      const selectedAccountCurrency = accounts.find(a => a.id === selectedAccountId)?.currency || 'PDH';
      setDepositAccount(selectedAccountId);
      setWithdrawalAccount(selectedAccountId);
      setTransferFrom(selectedAccountId);
      setDepositCurrency(selectedAccountCurrency);
      setWithdrawalCurrency(selectedAccountCurrency);
      setTransferCurrency(selectedAccountCurrency);
    }
  }, [open, selectedAccountId, accounts]);

  useEffect(() => {
    if (open) {
      supabase.from('currencies').select('iso_symbol, name').order('name').then(({ data }) => {
        if (data) setCurrencies(data as any[]);
      });
    }
  }, [open]);

  // Auto-set currency when selecting accounts
  const selectedDepositAccount = accounts.find(a => a.id === depositAccount);
  const selectedWithdrawalAccount = accounts.find(a => a.id === withdrawalAccount);
  const selectedTransferFromAccount = accounts.find(a => a.id === transferFrom);
  const selectedTransferToAccount = accounts.find(a => a.id === transferTo);

  useEffect(() => {
    if (selectedDepositAccount?.currency) setDepositCurrency(selectedDepositAccount.currency);
  }, [selectedDepositAccount?.currency]);

  useEffect(() => {
    if (selectedWithdrawalAccount?.currency) setWithdrawalCurrency(selectedWithdrawalAccount.currency);
  }, [selectedWithdrawalAccount?.currency]);

  useEffect(() => {
    if (selectedTransferToAccount?.currency) {
      setTransferCurrency(selectedTransferToAccount.currency);
    } else if (selectedTransferFromAccount?.currency) {
      setTransferCurrency(selectedTransferFromAccount.currency);
    }
  }, [selectedTransferFromAccount?.currency, selectedTransferToAccount?.currency]);
  
  const handleDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(depositAmount);
    if (depositAccount && amount > 0) {
      onDeposit(depositAccount, amount, depositCurrency);
      setDepositAccount(''); setDepositAmount('');
    }
  };
  
  const handleWithdrawal = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(withdrawalAmount);
    if (withdrawalAccount && amount > 0) {
      onWithdrawal(withdrawalAccount, amount, withdrawalCurrency);
      setWithdrawalAccount(''); setWithdrawalAmount('');
    }
  };
  
  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(transferAmount);
    if (transferFrom && transferTo && amount > 0 && transferFrom !== transferTo) {
      onTransfer(transferFrom, transferTo, amount, transferCurrency);
      setTransferFrom(''); setTransferTo(''); setTransferAmount('');
    }
  };

  const renderCurrencySelect = (value: string, onChange: (v: string) => void) => {
    const safeValue = value || 'PDH';
    const list = currencies.length > 0
      ? currencies
      : [{ iso_symbol: safeValue, name: safeValue }];
    const hasValue = list.some(c => c.iso_symbol === safeValue);
    const items = (hasValue ? list : [{ iso_symbol: safeValue, name: safeValue }, ...list]).filter(c => c.iso_symbol);
    return (
      <Select value={safeValue} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={safeValue} />
        </SelectTrigger>
        <SelectContent className="max-h-[200px]">
          {items.map(c => (
            <SelectItem key={c.iso_symbol} value={c.iso_symbol}>{c.iso_symbol}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const renderAccountSelect = (value: string, onChange: (v: string) => void, exclude?: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Seleccionar cuenta" />
      </SelectTrigger>
      <SelectContent className="max-h-[200px]">
        {accounts
          .filter(acc => acc.id !== 'bank-main' && acc.id !== exclude)
          .sort((a, b) => a.userName.localeCompare(b.userName))
          .map((account) => (
            <SelectItem key={account.id} value={account.id} className="truncate">
              <span className="truncate block max-w-[300px]">
                {account.userName} ({account.currency}: {account.balance.toFixed(2)})
              </span>
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );

  const renderAllAccountSelect = (value: string, onChange: (v: string) => void, exclude?: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Seleccionar cuenta" />
      </SelectTrigger>
      <SelectContent className="max-h-[200px]">
        {[...accounts]
          .filter(acc => acc.id !== exclude)
          .sort((a, b) => a.userName.localeCompare(b.userName))
          .map((account) => (
            <SelectItem key={account.id} value={account.id} className="truncate">
              <span className="truncate block max-w-[300px]">
                {account.userName} ({account.currency}: {account.balance.toFixed(2)})
              </span>
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Operaciones Bancarias</DialogTitle>
          <DialogDescription>
            Realiza depósitos, retiros o transferencias entre cuentas. Los montos se convierten automáticamente a la moneda del receptor.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="deposit" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="deposit" className="flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4" />Depósito
            </TabsTrigger>
            <TabsTrigger value="withdrawal" className="flex items-center gap-2">
              <ArrowUpFromLine className="h-4 w-4" />Retiro
            </TabsTrigger>
            <TabsTrigger value="transfer" className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />Transferencia
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="deposit" className="space-y-4 mt-4">
            <form onSubmit={handleDeposit} className="space-y-4">
              <div className="space-y-2">
                <Label>Cuenta destino</Label>
                {renderAllAccountSelect(depositAccount, setDepositAccount)}
                {selectedDepositAccount && (
                  <p className="text-xs text-muted-foreground">
                    Moneda de la cuenta: {selectedDepositAccount.currency}. El depósito se convertirá automáticamente.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Monto</Label>
                  <NumberInput placeholder="0" value={depositAmount} onChange={setDepositAmount} required />
                </div>
                <div className="space-y-2">
                  <Label>Moneda de entrada</Label>
                  {renderCurrencySelect(depositCurrency, setDepositCurrency)}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Nota: Se aplicará una comisión del 8% que irá a la cuenta principal del banco.
              </p>
              <Button type="submit" className="w-full">Realizar Depósito</Button>
            </form>
          </TabsContent>
          
          <TabsContent value="withdrawal" className="space-y-4 mt-4">
            <form onSubmit={handleWithdrawal} className="space-y-4">
              <div className="space-y-2">
                <Label>Cuenta origen</Label>
                {renderAllAccountSelect(withdrawalAccount, setWithdrawalAccount)}
                {selectedWithdrawalAccount && (
                  <p className="text-xs text-muted-foreground">
                    Moneda de la cuenta: {selectedWithdrawalAccount.currency}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Monto</Label>
                  <NumberInput placeholder="0" value={withdrawalAmount} onChange={setWithdrawalAmount} required />
                </div>
                <div className="space-y-2">
                  <Label>Moneda</Label>
                  {renderCurrencySelect(withdrawalCurrency, setWithdrawalCurrency)}
                </div>
              </div>
              {selectedWithdrawalAccount && (() => {
                const settings = getBankSettings();
                const isBusiness = selectedWithdrawalAccount.type === 'business';
                const rate = isBusiness ? settings.businessTransferCommission : 0;
                const maxWithdrawable = selectedWithdrawalAccount.balance / (1 + rate);
                const commission = selectedWithdrawalAccount.balance - maxWithdrawable;
                const sameCurrency = withdrawalCurrency === selectedWithdrawalAccount.currency;
                return (
                  <div className="rounded-md border p-3 space-y-2 text-xs bg-muted/30">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Saldo:</span>
                      <span className="font-medium">{formatNumber(selectedWithdrawalAccount.balance)} {selectedWithdrawalAccount.currency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Comisión ({(rate * 100).toFixed(1)}%):</span>
                      <span className="font-medium">{formatNumber(commission)} {selectedWithdrawalAccount.currency}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="font-semibold">Máx. a retirar:</span>
                      <span className="font-bold text-primary">{formatNumber(maxWithdrawable)} {selectedWithdrawalAccount.currency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Equivalente en PDH:</span>
                      <span className="font-medium">{formatNumber(convertToPDH(maxWithdrawable, selectedWithdrawalAccount.currency))} PDH</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={!sameCurrency}
                      onClick={() => setWithdrawalAmount(maxWithdrawable.toFixed(2))}
                    >
                      <Wallet className="h-3 w-3 mr-1" />
                      {sameCurrency ? 'Usar máximo a retirar' : `Cambia moneda a ${selectedWithdrawalAccount.currency} para usar máximo`}
                    </Button>
                  </div>
                );
              })()}
              <Button type="submit" className="w-full">Realizar Retiro</Button>
            </form>
          </TabsContent>
          
          <TabsContent value="transfer" className="space-y-4 mt-4">
            <form onSubmit={handleTransfer} className="space-y-4">
              <div className="space-y-2">
                <Label>Cuenta origen</Label>
                {renderAllAccountSelect(transferFrom, setTransferFrom)}
              </div>
              <div className="space-y-2">
                <Label>Cuenta destino</Label>
                {renderAllAccountSelect(transferTo, setTransferTo, transferFrom)}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Monto</Label>
                  <NumberInput placeholder="0" value={transferAmount} onChange={setTransferAmount} required />
                </div>
                <div className="space-y-2">
                  <Label>Moneda</Label>
                  {renderCurrencySelect(transferCurrency, setTransferCurrency)}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Nota: Las transferencias desde cuentas empresariales tienen comisión empresarial. Las transferencias entre cuentas de distinto país tienen comisión internacional. El monto se convierte a la moneda del receptor.
              </p>
              <Button type="submit" className="w-full">Realizar Transferencia</Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
