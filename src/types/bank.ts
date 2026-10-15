// Bank system types for MAHR Bank

export type Currency = string;

export type AccountType = 'personal' | 'business';

export type TransactionType = 'deposit' | 'withdrawal' | 'transfer' | 'fee' | 'commission' | 'loan_disbursement' | 'loan_payment' | 'cdt_interest_payout' | 'cdt_creation' | 'cdt_liquidation' | 'cdt_maturity' | 'savings_interest';

export type LoanStatus = 'pending' | 'approved' | 'active' | 'completed' | 'defaulted';

export type PaymentStatus = 'pending' | 'paid' | 'overdue';

export interface Account {
  id: string;
  userId: string;
  userName: string;
  accountNumber: string;
  type: AccountType;
  balance: number;
  currency: string;
  countryId?: string;
  countryName?: string;
  monthlyFee: number;
  createdAt: Date;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  fromAccountId?: string;
  fromAccountNumber?: string;
  toAccountId?: string;
  toAccountNumber?: string;
  amount: number;
  currency: Currency;
  commission?: number;
  commissionCurrency?: Currency;
  description: string;
  timestamp: Date;
}

export interface BankMainAccount {
  id: string;
  accountNumber: string;
  balance: number; // Always in PDH
}

export interface Loan {
  id: string;
  userId: string;
  accountId: string;
  amount: number;
  currency: string;
  interestRate: number;
  termMonths: number;
  monthlyPayment: number;
  outstandingBalance: number;
  status: LoanStatus;
  startDate?: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoanPayment {
  id: string;
  loanId: string;
  paymentNumber: number;
  dueDate: Date;
  amount: number;
  principal: number;
  interest: number;
  penalty: number;
  paidDate?: Date;
  status: PaymentStatus;
  createdAt: Date;
}
