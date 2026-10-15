import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBankData } from "@/hooks/useBankData";
import { usePayrollData } from "@/hooks/usePayrollData";
import { PayrollPanel } from "@/components/bank/PayrollPanel";
import { CreatePayrollDialog } from "@/components/bank/CreatePayrollDialog";
import { formatNumber } from "@/lib/currencyUtils";
import { Loader2, Plus, FileText, Users, Calendar, DollarSign } from "lucide-react";

export default function Payroll() {
  const { accounts, bankMainAccount, loading: bankLoading } = useBankData();
  const { 
    payrolls, 
    payments, 
    loading: payrollLoading, 
    createPayroll, 
    addEmployee, 
    removeEmployee,
    processPayroll,
    togglePayrollActive,
    deletePayroll
  } = usePayrollData();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const loading = bankLoading || payrollLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-muted-foreground">Cargando nóminas...</p>
        </div>
      </div>
    );
  }

  const activePayrolls = payrolls.filter(p => p.isActive);
  const totalEmployees = payrolls.reduce((sum, p) => sum + p.employees.filter(e => e.isActive).length, 0);
  const totalSalaries = payrolls.reduce((sum, p) => 
    sum + p.employees.filter(e => e.isActive).reduce((s, e) => s + e.salary, 0), 0
  );
  const totalPayments = payments.filter(p => p.status === 'completed').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nóminas</h1>
          <p className="text-muted-foreground">Gestiona las nóminas y pagos de empleados</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Nómina
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Nóminas Activas</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activePayrolls.length}</div>
            <p className="text-xs text-muted-foreground">{payrolls.length} totales</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Empleados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEmployees}</div>
            <p className="text-xs text-muted-foreground">Activos en nóminas</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Salarios</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totalSalaries)} PDH</div>
            <p className="text-xs text-muted-foreground">Por periodo</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pagos Realizados</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPayments}</div>
            <p className="text-xs text-muted-foreground">Este periodo</p>
          </CardContent>
        </Card>
      </div>

      {/* Payroll Panel */}
      <PayrollPanel
        payrolls={payrolls}
        payments={payments}
        accounts={accounts}
        bankMainAccount={bankMainAccount ? { id: bankMainAccount.id, balance: bankMainAccount.balance } : null}
        onCreatePayroll={createPayroll}
        onAddEmployee={addEmployee}
        onRemoveEmployee={removeEmployee}
        onProcessPayroll={processPayroll}
        onTogglePayroll={togglePayrollActive}
        onDeletePayroll={deletePayroll}
      />

      <CreatePayrollDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        accounts={accounts.filter(a => a.type === 'business')}
        onSubmit={createPayroll}
      />
    </div>
  );
}
