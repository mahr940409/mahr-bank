import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Account } from '@/types/bank';
import { toast } from 'sonner';

interface CreatePayrollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  onSubmit: (
    employerAccountId: string,
    name: string,
    frequency: 'weekly' | 'biweekly' | 'monthly',
    payDay: number,
    currency: string
  ) => Promise<void>;
}

export const CreatePayrollDialog = ({
  open,
  onOpenChange,
  accounts,
  onSubmit,
}: CreatePayrollDialogProps) => {
  const [name, setName] = useState('');
  const [employerAccountId, setEmployerAccountId] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('monthly');
  const [payDay, setPayDay] = useState('1');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Ingresa un nombre para la nómina');
      return;
    }
    if (!employerAccountId) {
      toast.error('Selecciona la cuenta empleadora');
      return;
    }

    const payDayNum = parseInt(payDay);
    if (isNaN(payDayNum) || payDayNum < 1 || (frequency === 'monthly' && payDayNum > 31)) {
      toast.error('Día de pago inválido');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(employerAccountId, name.trim(), frequency, payDayNum, 'PDH');
      resetForm();
      onOpenChange(false);
    } catch (error) {
      // Error handled in hook
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setEmployerAccountId('');
    setFrequency('monthly');
    setPayDay('1');
  };

  const getPayDayLabel = () => {
    if (frequency === 'monthly') return 'Día del mes (1-31)';
    return 'Día de la semana (0=Dom, 1=Lun, ..., 6=Sáb)';
  };

  const getPayDayMax = () => {
    return frequency === 'monthly' ? 31 : 6;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Nueva Nómina</DialogTitle>
          <DialogDescription>
            Configura una nueva nómina para pagos programados
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre de la nómina</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Nómina Mensual Empleados"
            />
          </div>

          <div className="space-y-2">
            <Label>Cuenta empleadora</Label>
            <Select value={employerAccountId} onValueChange={setEmployerAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cuenta empresarial" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {accounts
                  .sort((a, b) => a.userName.localeCompare(b.userName))
                  .map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <span className="truncate block max-w-[300px]">
                        {account.userName}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {accounts.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No hay cuentas empresariales disponibles
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Frecuencia de pago</Label>
            <Select 
              value={frequency} 
              onValueChange={(v) => setFrequency(v as 'weekly' | 'biweekly' | 'monthly')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="biweekly">Quincenal</SelectItem>
                <SelectItem value="monthly">Mensual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payDay">{getPayDayLabel()}</Label>
            <Input
              id="payDay"
              type="number"
              min={frequency === 'monthly' ? 1 : 0}
              max={getPayDayMax()}
              value={payDay}
              onChange={(e) => setPayDay(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creando...' : 'Crear Nómina'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
