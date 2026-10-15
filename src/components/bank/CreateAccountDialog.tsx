import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Account, AccountType } from '@/types/bank';
import { supabase } from '@/integrations/supabase/client';

interface CountryOption {
  id: string;
  name: string;
  currencySymbol: string;
  currencyName: string;
}

interface CreateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateAccount: (account: Omit<Account, 'id' | 'createdAt'>) => void;
}

export function CreateAccountDialog({ open, onOpenChange, onCreateAccount }: CreateAccountDialogProps) {
  const [userName, setUserName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('personal');
  const [selectedCountryId, setSelectedCountryId] = useState('');
  const [countries, setCountries] = useState<CountryOption[]>([]);

  useEffect(() => {
    if (open) {
      loadCountries();
    }
  }, [open]);

  const loadCountries = async () => {
    const { data: countriesData } = await supabase.from('countries').select('*').order('name');
    const { data: currenciesData } = await supabase.from('currencies').select('*');
    
    if (countriesData && currenciesData) {
      const currMap: Record<string, any> = {};
      (currenciesData as any[]).forEach(c => { currMap[c.id] = c; });
      
      const options: CountryOption[] = (countriesData as any[]).map(c => ({
        id: c.id,
        name: c.name,
        currencySymbol: currMap[c.currency_id]?.iso_symbol || 'PDH',
        currencyName: currMap[c.currency_id]?.name || 'Desconocida',
      }));
      setCountries(options);
    }
  };

  const selectedCountry = countries.find(c => c.id === selectedCountryId);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userName.trim() || !selectedCountryId) return;
    const isMahrAccount = selectedCountryId === 'mahr-bank';
    
    const accountNumber = `ACC-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const monthlyFee = accountType === 'business' ? 50 : 20;
    
    onCreateAccount({
      userId: `USER-${Date.now()}`,
      userName: userName.trim(),
      accountNumber,
      type: accountType,
      balance: 0,
      currency: isMahrAccount ? 'PDH' : (selectedCountry?.currencySymbol || 'PDH'),
      countryId: isMahrAccount ? undefined : selectedCountryId,
      countryName: isMahrAccount ? 'MAHR Bank' : selectedCountry?.name,
      monthlyFee,
    });
    
    setUserName('');
    setAccountType('personal');
    setSelectedCountryId('');
    onOpenChange(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Crear Nueva Cuenta</DialogTitle>
          <DialogDescription>
            Ingresa los datos para crear una nueva cuenta bancaria.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="userName">Nombre del titular</Label>
              <Input
                id="userName"
                placeholder="Ej: Juan Pérez o Empresa S.A."
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>País o banco</Label>
              <Select value={selectedCountryId} onValueChange={setSelectedCountryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar país o MAHR Bank" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  <SelectItem value="mahr-bank">MAHR Bank (Pepita de Hierro · PDH)</SelectItem>
                  {countries.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.currencySymbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCountry && (
                <p className="text-xs text-muted-foreground">
                  Moneda: {selectedCountry.currencyName} ({selectedCountry.currencySymbol})
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Tipo de cuenta</Label>
              <RadioGroup value={accountType} onValueChange={(value) => setAccountType(value as AccountType)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="personal" id="personal" />
                  <Label htmlFor="personal" className="font-normal cursor-pointer">
                    Personal (Cuota: 20 PDH/mes, sin comisión en transferencias)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="business" id="business" />
                  <Label htmlFor="business" className="font-normal cursor-pointer">
                    Empresarial (Cuota: 50 PDH/mes, comisión 5% en transferencias)
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!userName.trim() || !selectedCountryId}>Crear Cuenta</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
