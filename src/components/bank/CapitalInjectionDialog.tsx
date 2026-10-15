import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Banknote } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface CapitalInjectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInject: (amount: number, currency: string, description: string) => void;
}

export function CapitalInjectionDialog({ open, onOpenChange, onInject }: CapitalInjectionDialogProps) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('PDH');
  const [description, setDescription] = useState('');
  const [currencies, setCurrencies] = useState<{ iso_symbol: string; name: string }[]>([]);

  useEffect(() => {
    if (open) {
      supabase.from('currencies').select('iso_symbol, name').order('name').then(({ data }) => {
        if (data) setCurrencies(data as any[]);
      });
    }
  }, [open]);

  const handleSubmit = () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    
    onInject(parsedAmount, currency, description || 'Inyección de capital');
    setAmount('');
    setCurrency('PDH');
    setDescription('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            Inyección de Capital
          </DialogTitle>
          <DialogDescription>
            Añadir fondos directamente a la cuenta principal del banco
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Monto</Label>
            <NumberInput id="amount" placeholder="0" value={amount} onChange={setAmount} />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="currency">Moneda</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {currencies.map(c => (
                  <SelectItem key={c.iso_symbol} value={c.iso_symbol}>{c.iso_symbol} - {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Descripción (opcional)</Label>
            <Input id="description" placeholder="Ej: Capital inicial, Inversión externa..." value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
          </div>
        </div>
        
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!amount || parseFloat(amount) <= 0}>Inyectar Capital</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
