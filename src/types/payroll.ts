export interface PayrollConfig {
  id: string;
  employerAccountId: string;
  name: string;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  payDay: number;
  currency: string;
  isActive: boolean;
  nextPaymentDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayrollEmployee {
  id: string;
  payrollId: string;
  employeeAccountId: string;
  salary: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayrollPayment {
  id: string;
  payrollId: string;
  employeeAccountId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  paymentDate: Date;
  transactionId: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface PayrollWithEmployees extends PayrollConfig {
  employees: PayrollEmployee[];
  employerName: string;
}
