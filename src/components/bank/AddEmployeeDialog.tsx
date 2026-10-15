import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Account } from '@/types/bank';
import { PayrollWithEmployees } from '@/types/payroll';
import { toast } from 'sonner';

interface AddEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  payroll: PayrollWithEmployees | null;
  onSubmit: (payrollId: string, employeeAccountId: string, salary: number) => Promise<void>;
}

export const AddEmployeeDialog = ({
  open,
  onOpenChange,
  accounts,
  payroll,
  onSubmit,
}: AddEmployeeDialogProps) => {
  const [employeeAccountId, setEmployeeAccountId] = useState('');
  const [salary, setSalary] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setEmployeeAccountId('');
      setSalary('');
    }
  }, [open]);

  const existingEmployeeIds = payroll?.employees.map(e => e.employeeAccountId) || [];
  const availableAccounts = accounts.filter(
    a => a.id !== payroll?.employerAccountId && !existingEmployeeIds.includes(a.id)
  );

  const handleSubmit = async () => {
    if (!employeeAccountId) {
      toast.error('Selecciona un empleado');
      return;
    }

    const salaryNum = parseFloat(salary);
    if (isNaN(salaryNum) || salaryNum <= 0) {
      toast.error('Ingresa un salario válido');
      return;
    }

    if (!payroll) return;

    setLoading(true);
    try {
      await onSubmit(payroll.id, employeeAccountId, salaryNum);
      onOpenChange(false);
    } catch (error) {
      // Error handled in hook
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Agregar Empleado</DialogTitle>
          <DialogDescription>
            {payroll ? `Agregar empleado a: ${payroll.name}` : 'Selecciona un empleado'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Empleado (cuenta)</Label>
            <Select value={employeeAccountId} onValueChange={setEmployeeAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cuenta del empleado" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {availableAccounts
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
            {availableAccounts.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No hay cuentas disponibles para agregar
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="salary">Salario (PDH)</Label>
            <NumberInput
              id="salary"
              value={salary}
              onChange={setSalary}
              placeholder="0"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || availableAccounts.length === 0}>
            {loading ? 'Agregando...' : 'Agregar Empleado'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
