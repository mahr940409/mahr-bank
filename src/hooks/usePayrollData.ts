import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PayrollConfig, PayrollEmployee, PayrollPayment, PayrollWithEmployees } from '@/types/payroll';
import { toast } from 'sonner';

const generateId = () => crypto.randomUUID();

export const usePayrollData = () => {
  const [payrolls, setPayrolls] = useState<PayrollWithEmployees[]>([]);
  const [payments, setPayments] = useState<PayrollPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPayrolls = useCallback(async () => {
    try {
      const { data: configsData, error: configsError } = await supabase
        .from('payroll_configs')
        .select('*')
        .order('created_at', { ascending: false });

      if (configsError) throw configsError;

      const { data: employeesData, error: employeesError } = await supabase
        .from('payroll_employees')
        .select('*');

      if (employeesError) throw employeesError;

      const { data: accountsData, error: accountsError } = await supabase
        .from('accounts')
        .select('id, user_name');

      if (accountsError) throw accountsError;

      const accountsMap = new Map(accountsData.map(a => [a.id, a.user_name]));

      const payrollsWithEmployees: PayrollWithEmployees[] = (configsData || []).map(config => ({
        id: config.id,
        employerAccountId: config.employer_account_id,
        name: config.name,
        frequency: config.frequency as 'weekly' | 'biweekly' | 'monthly',
        payDay: config.pay_day,
        currency: config.currency,
        isActive: config.is_active,
        nextPaymentDate: config.next_payment_date ? new Date(config.next_payment_date) : null,
        createdAt: new Date(config.created_at),
        updatedAt: new Date(config.updated_at),
        employerName: accountsMap.get(config.employer_account_id) || 'Desconocido',
        employees: (employeesData || [])
          .filter(e => e.payroll_id === config.id)
          .map(e => ({
            id: e.id,
            payrollId: e.payroll_id,
            employeeAccountId: e.employee_account_id,
            salary: Number(e.salary),
            isActive: e.is_active,
            createdAt: new Date(e.created_at),
            updatedAt: new Date(e.updated_at),
          })),
      }));

      setPayrolls(payrollsWithEmployees);
    } catch (error) {
      console.error('Error fetching payrolls:', error);
      toast.error('Error al cargar las nóminas');
    }
  }, []);

  const fetchPayments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('payroll_payments')
        .select('*')
        .order('payment_date', { ascending: false })
        .limit(100);

      if (error) throw error;

      setPayments((data || []).map(p => ({
        id: p.id,
        payrollId: p.payroll_id,
        employeeAccountId: p.employee_account_id,
        amount: Number(p.amount),
        currency: p.currency,
        status: p.status as 'pending' | 'completed' | 'failed',
        paymentDate: new Date(p.payment_date),
        transactionId: p.transaction_id,
        errorMessage: p.error_message,
        createdAt: new Date(p.created_at),
      })));
    } catch (error) {
      console.error('Error fetching payments:', error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchPayrolls(), fetchPayments()]);
      setLoading(false);
    };
    loadData();
  }, [fetchPayrolls, fetchPayments]);

  const createPayroll = async (
    employerAccountId: string,
    name: string,
    frequency: 'weekly' | 'biweekly' | 'monthly',
    payDay: number,
    currency: string
  ) => {
    try {
      const nextPaymentDate = calculateNextPaymentDate(frequency, payDay);
      
      const { error } = await supabase
        .from('payroll_configs')
        .insert({
          id: generateId(),
          employer_account_id: employerAccountId,
          name,
          frequency,
          pay_day: payDay,
          currency,
          next_payment_date: nextPaymentDate.toISOString(),
        });

      if (error) throw error;

      toast.success('Nómina creada exitosamente');
      await fetchPayrolls();
    } catch (error) {
      console.error('Error creating payroll:', error);
      toast.error('Error al crear la nómina');
      throw error;
    }
  };

  const addEmployee = async (payrollId: string, employeeAccountId: string, salary: number) => {
    try {
      const { error } = await supabase
        .from('payroll_employees')
        .insert({
          id: generateId(),
          payroll_id: payrollId,
          employee_account_id: employeeAccountId,
          salary,
        });

      if (error) throw error;

      toast.success('Empleado agregado a la nómina');
      await fetchPayrolls();
    } catch (error) {
      console.error('Error adding employee:', error);
      toast.error('Error al agregar empleado');
      throw error;
    }
  };

  const removeEmployee = async (employeeId: string) => {
    try {
      const { error } = await supabase
        .from('payroll_employees')
        .delete()
        .eq('id', employeeId);

      if (error) throw error;

      toast.success('Empleado removido de la nómina');
      await fetchPayrolls();
    } catch (error) {
      console.error('Error removing employee:', error);
      toast.error('Error al remover empleado');
      throw error;
    }
  };

  const updateEmployeeSalary = async (employeeId: string, salary: number) => {
    try {
      const { error } = await supabase
        .from('payroll_employees')
        .update({ salary })
        .eq('id', employeeId);

      if (error) throw error;

      toast.success('Salario actualizado');
      await fetchPayrolls();
    } catch (error) {
      console.error('Error updating salary:', error);
      toast.error('Error al actualizar salario');
      throw error;
    }
  };

  const processPayroll = async (payrollId: string) => {
    try {
      const payroll = payrolls.find(p => p.id === payrollId);
      if (!payroll) throw new Error('Nómina no encontrada');

      const activeEmployees = payroll.employees.filter(e => e.isActive);
      if (activeEmployees.length === 0) {
        toast.error('No hay empleados activos en esta nómina');
        return;
      }

      const isBankMainEmployer = payroll.employerAccountId === 'bank-main';
      let employerBalance: number;

      // Get employer account balance - handle bank main account separately
      if (isBankMainEmployer) {
        const { data: bankAccount, error: bankError } = await supabase
          .from('bank_main_account')
          .select('balance_pdh')
          .eq('id', 'bank-main')
          .maybeSingle();

        if (bankError) throw bankError;
        if (!bankAccount) throw new Error('Cuenta principal del banco no encontrada');
        employerBalance = Number(bankAccount.balance_pdh);
      } else {
        const { data: employerAccount, error: accError } = await supabase
          .from('accounts')
          .select('balance_pdh')
          .eq('id', payroll.employerAccountId)
          .maybeSingle();

        if (accError) throw accError;
        if (!employerAccount) throw new Error('Cuenta del empleador no encontrada');
        employerBalance = Number(employerAccount.balance_pdh);
      }

      const totalPayroll = activeEmployees.reduce((sum, e) => sum + e.salary, 0);
      
      if (employerBalance < totalPayroll) {
        toast.error('Saldo insuficiente para procesar la nómina');
        return;
      }

      let currentEmployerBalance = employerBalance;

      // Process each payment
      for (const employee of activeEmployees) {
        const transactionId = generateId();
        
        // Deduct from employer
        if (isBankMainEmployer) {
          const { error: deductError } = await supabase
            .from('bank_main_account')
            .update({ balance_pdh: currentEmployerBalance - employee.salary })
            .eq('id', 'bank-main');

          if (deductError) {
            await recordPayment(payrollId, employee.employeeAccountId, employee.salary, 'failed', null, 'Error al debitar cuenta empleador');
            continue;
          }
        } else {
          const { error: deductError } = await supabase
            .from('accounts')
            .update({ balance_pdh: currentEmployerBalance - employee.salary })
            .eq('id', payroll.employerAccountId);

          if (deductError) {
            await recordPayment(payrollId, employee.employeeAccountId, employee.salary, 'failed', null, 'Error al debitar cuenta empleador');
            continue;
          }
        }

        currentEmployerBalance -= employee.salary;

        // Add to employee
        const { data: empAccount } = await supabase
          .from('accounts')
          .select('balance_pdh')
          .eq('id', employee.employeeAccountId)
          .maybeSingle();

        const { error: addError } = await supabase
          .from('accounts')
          .update({ 
            balance_pdh: Number(empAccount?.balance_pdh || 0) + employee.salary 
          })
          .eq('id', employee.employeeAccountId);

        if (addError) {
          await recordPayment(payrollId, employee.employeeAccountId, employee.salary, 'failed', null, 'Error al acreditar cuenta empleado');
          continue;
        }

        // Record transaction
        await supabase.from('transactions').insert({
          id: transactionId,
          from_account_id: payroll.employerAccountId,
          to_account_id: employee.employeeAccountId,
          amount: employee.salary,
          currency: payroll.currency,
          transaction_type: 'payroll',
          description: `Pago de nómina: ${payroll.name}`,
        });

        await recordPayment(payrollId, employee.employeeAccountId, employee.salary, 'completed', transactionId, null);
      }

      // Update next payment date
      const nextDate = calculateNextPaymentDate(payroll.frequency, payroll.payDay);
      await supabase
        .from('payroll_configs')
        .update({ next_payment_date: nextDate.toISOString() })
        .eq('id', payrollId);

      toast.success('Nómina procesada exitosamente');
      await Promise.all([fetchPayrolls(), fetchPayments()]);
    } catch (error) {
      console.error('Error processing payroll:', error);
      toast.error('Error al procesar la nómina');
      throw error;
    }
  };

  const recordPayment = async (
    payrollId: string,
    employeeAccountId: string,
    amount: number,
    status: 'pending' | 'completed' | 'failed',
    transactionId: string | null,
    errorMessage: string | null
  ) => {
    await supabase.from('payroll_payments').insert({
      id: generateId(),
      payroll_id: payrollId,
      employee_account_id: employeeAccountId,
      amount,
      status,
      transaction_id: transactionId,
      error_message: errorMessage,
    });
  };

  const togglePayrollActive = async (payrollId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('payroll_configs')
        .update({ is_active: isActive })
        .eq('id', payrollId);

      if (error) throw error;

      toast.success(isActive ? 'Nómina activada' : 'Nómina desactivada');
      await fetchPayrolls();
    } catch (error) {
      console.error('Error toggling payroll:', error);
      toast.error('Error al cambiar estado de la nómina');
    }
  };

  const deletePayroll = async (payrollId: string) => {
    try {
      const { error } = await supabase
        .from('payroll_configs')
        .delete()
        .eq('id', payrollId);

      if (error) throw error;

      toast.success('Nómina eliminada');
      await fetchPayrolls();
    } catch (error) {
      console.error('Error deleting payroll:', error);
      toast.error('Error al eliminar la nómina');
    }
  };

  return {
    payrolls,
    payments,
    loading,
    createPayroll,
    addEmployee,
    removeEmployee,
    updateEmployeeSalary,
    processPayroll,
    togglePayrollActive,
    deletePayroll,
    refetch: () => Promise.all([fetchPayrolls(), fetchPayments()]),
  };
};

function calculateNextPaymentDate(frequency: 'weekly' | 'biweekly' | 'monthly', payDay: number): Date {
  const now = new Date();
  const result = new Date(now);

  if (frequency === 'monthly') {
    result.setDate(payDay);
    if (result <= now) {
      result.setMonth(result.getMonth() + 1);
    }
  } else if (frequency === 'biweekly') {
    const dayOfWeek = now.getDay();
    const daysUntilPayDay = (payDay - dayOfWeek + 7) % 7 || 14;
    result.setDate(now.getDate() + daysUntilPayDay);
  } else {
    const dayOfWeek = now.getDay();
    const daysUntilPayDay = (payDay - dayOfWeek + 7) % 7 || 7;
    result.setDate(now.getDate() + daysUntilPayDay);
  }

  return result;
}
