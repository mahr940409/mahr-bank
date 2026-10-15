import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { PayrollWithEmployees, PayrollPayment } from '@/types/payroll';
import { Account } from '@/types/bank';
import { CreatePayrollDialog } from './CreatePayrollDialog';
import { AddEmployeeDialog } from './AddEmployeeDialog';
import { 
  PlusCircle, 
  Play, 
  Pause, 
  Trash2, 
  Users, 
  Calendar,
  DollarSign,
  UserPlus,
  UserMinus
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface PayrollPanelProps {
  payrolls: PayrollWithEmployees[];
  payments: PayrollPayment[];
  accounts: Account[];
  bankMainAccount: { id: string; balance: number } | null;
  onCreatePayroll: (
    employerAccountId: string,
    name: string,
    frequency: 'weekly' | 'biweekly' | 'monthly',
    payDay: number,
    currency: string
  ) => Promise<void>;
  onAddEmployee: (payrollId: string, employeeAccountId: string, salary: number) => Promise<void>;
  onRemoveEmployee: (employeeId: string) => Promise<void>;
  onProcessPayroll: (payrollId: string) => Promise<void>;
  onTogglePayroll: (payrollId: string, isActive: boolean) => Promise<void>;
  onDeletePayroll: (payrollId: string) => Promise<void>;
}

const frequencyLabels: Record<string, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
};

export const PayrollPanel = ({
  payrolls,
  payments,
  accounts,
  bankMainAccount,
  onCreatePayroll,
  onAddEmployee,
  onRemoveEmployee,
  onProcessPayroll,
  onTogglePayroll,
  onDeletePayroll,
}: PayrollPanelProps) => {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [addEmployeeDialogOpen, setAddEmployeeDialogOpen] = useState(false);
  const [selectedPayrollId, setSelectedPayrollId] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  // Include bank main account as an employer option
  const businessAccounts = accounts.filter(a => a.type === 'business');
  const employerAccounts: Account[] = bankMainAccount 
    ? [
        {
          id: 'bank-main',
          userId: 'bank-main',
          userName: 'MAHR Bank - Cuenta Principal',
          accountNumber: 'MAHR-BANK-000001',
          type: 'business',
          balance: bankMainAccount.balance,
          currency: 'PDH',
          createdAt: new Date(),
          monthlyFee: 0,
        },
        ...businessAccounts
      ]
    : businessAccounts;
  const accountsMap = new Map(accounts.map(a => [a.id, a]));

  const handleProcess = async (payrollId: string) => {
    setProcessing(payrollId);
    try {
      await onProcessPayroll(payrollId);
    } finally {
      setProcessing(null);
    }
  };

  const openAddEmployee = (payrollId: string) => {
    setSelectedPayrollId(payrollId);
    setAddEmployeeDialogOpen(true);
  };

  const getEmployeeName = (accountId: string) => {
    return accountsMap.get(accountId)?.userName || 'Desconocido';
  };

  const getTotalSalary = (payroll: PayrollWithEmployees) => {
    return payroll.employees
      .filter(e => e.isActive)
      .reduce((sum, e) => sum + e.salary, 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Sistema de Nóminas</h2>
          <p className="text-sm text-muted-foreground">
            Gestiona pagos automáticos a empleados
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
          <PlusCircle className="h-4 w-4" />
          Nueva Nómina
        </Button>
      </div>

      {payrolls.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No hay nóminas configuradas</p>
            <Button onClick={() => setCreateDialogOpen(true)} variant="outline">
              Crear primera nómina
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="single" collapsible className="space-y-4">
          {payrolls.map((payroll) => (
            <AccordionItem 
              key={payroll.id} 
              value={payroll.id}
              className="border rounded-lg px-4"
            >
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-4 w-full pr-4">
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{payroll.name}</span>
                      <Badge variant={payroll.isActive ? 'default' : 'secondary'}>
                        {payroll.isActive ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {payroll.employerName} • {frequencyLabels[payroll.frequency]}
                    </p>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{payroll.employees.filter(e => e.isActive).length}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span>{getTotalSalary(payroll).toFixed(2)} PDH</span>
                    </div>
                    {payroll.nextPaymentDate && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{format(payroll.nextPaymentDate, 'dd MMM', { locale: es })}</span>
                      </div>
                    )}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-4">
                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    <Button 
                      size="sm" 
                      onClick={() => handleProcess(payroll.id)}
                      disabled={!payroll.isActive || processing === payroll.id}
                      className="gap-2"
                    >
                      <Play className="h-4 w-4" />
                      {processing === payroll.id ? 'Procesando...' : 'Procesar Ahora'}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => openAddEmployee(payroll.id)}
                      className="gap-2"
                    >
                      <UserPlus className="h-4 w-4" />
                      Agregar Empleado
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => onTogglePayroll(payroll.id, !payroll.isActive)}
                      className="gap-2"
                    >
                      {payroll.isActive ? (
                        <>
                          <Pause className="h-4 w-4" />
                          Pausar
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" />
                          Activar
                        </>
                      )}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive"
                      onClick={() => onDeletePayroll(payroll.id)}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Eliminar
                    </Button>
                  </div>

                  {/* Employees Table */}
                  {payroll.employees.length > 0 ? (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Empleados</CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Empleado</TableHead>
                              <TableHead className="text-right">Salario</TableHead>
                              <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {payroll.employees
                              .sort((a, b) => getEmployeeName(a.employeeAccountId).localeCompare(getEmployeeName(b.employeeAccountId)))
                              .map((employee) => (
                                <TableRow key={employee.id}>
                                  <TableCell>
                                    <span className="truncate block max-w-[200px]">
                                      {getEmployeeName(employee.employeeAccountId)}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {employee.salary.toFixed(2)} PDH
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => onRemoveEmployee(employee.id)}
                                    >
                                      <UserMinus className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No hay empleados en esta nómina
                    </p>
                  )}

                  {/* Recent Payments */}
                  {payments.filter(p => p.payrollId === payroll.id).length > 0 && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Pagos Recientes</CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Fecha</TableHead>
                              <TableHead>Empleado</TableHead>
                              <TableHead className="text-right">Monto</TableHead>
                              <TableHead>Estado</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {payments
                              .filter(p => p.payrollId === payroll.id)
                              .slice(0, 5)
                              .map((payment) => (
                                <TableRow key={payment.id}>
                                  <TableCell>
                                    {format(payment.paymentDate, 'dd/MM/yyyy HH:mm')}
                                  </TableCell>
                                  <TableCell>
                                    <span className="truncate block max-w-[150px]">
                                      {getEmployeeName(payment.employeeAccountId)}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {payment.amount.toFixed(2)} PDH
                                  </TableCell>
                                  <TableCell>
                                    <Badge 
                                      variant={
                                        payment.status === 'completed' ? 'default' : 
                                        payment.status === 'failed' ? 'destructive' : 
                                        'secondary'
                                      }
                                    >
                                      {payment.status === 'completed' ? 'Completado' :
                                       payment.status === 'failed' ? 'Fallido' : 'Pendiente'}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <CreatePayrollDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        accounts={employerAccounts}
        onSubmit={onCreatePayroll}
      />

      <AddEmployeeDialog
        open={addEmployeeDialogOpen}
        onOpenChange={setAddEmployeeDialogOpen}
        accounts={accounts}
        payroll={payrolls.find(p => p.id === selectedPayrollId) || null}
        onSubmit={onAddEmployee}
      />
    </div>
  );
};
