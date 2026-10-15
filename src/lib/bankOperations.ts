import { Account, BankMainAccount, Transaction } from '@/types/bank';
import { convertToPDH, convertCurrency } from './currencyUtils';
import { getBankSettings } from '@/hooks/useBankSettings';

// Calculate commission for deposit
export function calculateDepositCommission(amount: number, currency: string): {
  commission: number;
  commissionInPDH: number;
  netAmount: number;
} {
  const rate = getBankSettings().depositCommission;
  const commission = amount * rate;
  const netAmount = amount - commission;
  const commissionInPDH = convertToPDH(commission, currency);
  
  return { commission, commissionInPDH, netAmount };
}

// Determine transfer commission rate based on account types and whether it's international
export function getTransferCommissionRate(
  fromAccountType: 'personal' | 'business',
  isInternational: boolean
): number {
  const settings = getBankSettings();
  if (isInternational) {
    return settings.internationalTransferCommission;
  }
  if (fromAccountType === 'business') {
    return settings.businessTransferCommission;
  }
  return 0;
}

// Calculate commission for transfer
export function calculateTransferCommission(
  amount: number,
  currency: string,
  fromAccount: Account,
  toAccount: Account
): {
  commission: number;
  commissionInPDH: number;
  shouldApplyCommission: boolean;
  commissionRate: number;
  isInternational: boolean;
} {
  const isInternational = !!(fromAccount.countryId && toAccount.countryId && fromAccount.countryId !== toAccount.countryId);
  const commissionRate = getTransferCommissionRate(fromAccount.type, isInternational);
  const shouldApplyCommission = commissionRate > 0;

  if (!shouldApplyCommission) {
    return { commission: 0, commissionInPDH: 0, shouldApplyCommission: false, commissionRate: 0, isInternational };
  }
  
  const commission = amount * commissionRate;
  const commissionInPDH = convertToPDH(commission, currency);
  
  return { commission, commissionInPDH, shouldApplyCommission: true, commissionRate, isInternational };
}

// Process deposit
export function processDeposit(
  account: Account,
  amount: number,
  currency: string,
  bankMainAccount: BankMainAccount
): {
  updatedAccount: Account;
  updatedBankAccount: BankMainAccount;
  transaction: Omit<Transaction, 'id' | 'timestamp'>;
} {
  const { commission, commissionInPDH, netAmount } = calculateDepositCommission(amount, currency);
  const rate = getBankSettings().depositCommission;
  const netInAccountCurrency = convertCurrency(netAmount, currency, account.currency);
  
  const updatedAccount: Account = {
    ...account,
    balance: account.balance + netInAccountCurrency,
  };
  
  const updatedBankAccount: BankMainAccount = {
    ...bankMainAccount,
    balance: bankMainAccount.balance + commissionInPDH,
  };
  
  const transaction: Omit<Transaction, 'id' | 'timestamp'> = {
    type: 'deposit',
    toAccountId: account.id,
    toAccountNumber: account.accountNumber,
    amount: netAmount,
    currency,
    commission,
    commissionCurrency: currency,
    description: `Depósito a cuenta ${account.accountNumber} (Comisión ${(rate * 100).toFixed(1)}%: ${commission.toFixed(2)} ${currency})`,
  };
  
  return { updatedAccount, updatedBankAccount, transaction };
}

// Process withdrawal
export function processWithdrawal(
  account: Account,
  amount: number,
  currency: string
): {
  updatedAccount: Account;
  transaction: Omit<Transaction, 'id' | 'timestamp'>;
  success: boolean;
  error?: string;
} {
  const amountInAccountCurrency = convertCurrency(amount, currency, account.currency);
  
  if (account.balance < amountInAccountCurrency) {
    return {
      updatedAccount: account,
      transaction: {} as any,
      success: false,
      error: `Saldo insuficiente`,
    };
  }
  
  const updatedAccount: Account = {
    ...account,
    balance: account.balance - amountInAccountCurrency,
  };
  
  const transaction: Omit<Transaction, 'id' | 'timestamp'> = {
    type: 'withdrawal',
    fromAccountId: account.id,
    fromAccountNumber: account.accountNumber,
    amount,
    currency,
    description: `Retiro de cuenta ${account.accountNumber}`,
  };
  
  return { updatedAccount, transaction, success: true };
}

// Process transfer
export function processTransfer(
  fromAccount: Account,
  toAccount: Account,
  amount: number,
  currency: string,
  bankMainAccount: BankMainAccount
): {
  updatedFromAccount: Account;
  updatedToAccount: Account;
  updatedBankAccount: BankMainAccount;
  transaction: Omit<Transaction, 'id' | 'timestamp'>;
  success: boolean;
  error?: string;
} {
  const { commission, commissionInPDH, shouldApplyCommission, commissionRate, isInternational } = calculateTransferCommission(
    amount,
    currency,
    fromAccount,
    toAccount
  );
  
  const totalToDeduct = shouldApplyCommission ? amount + commission : amount;
  const totalToDeductInSenderCurrency = convertCurrency(totalToDeduct, currency, fromAccount.currency);
  
  if (fromAccount.balance < totalToDeductInSenderCurrency) {
    return {
      updatedFromAccount: fromAccount,
      updatedToAccount: toAccount,
      updatedBankAccount: bankMainAccount,
      transaction: {} as any,
      success: false,
      error: `Saldo insuficiente`,
    };
  }
  
  const amountInReceiverCurrency = convertCurrency(amount, currency, toAccount.currency);
  
  const updatedFromAccount: Account = {
    ...fromAccount,
    balance: fromAccount.balance - totalToDeductInSenderCurrency,
  };
  
  const updatedToAccount: Account = {
    ...toAccount,
    balance: toAccount.balance + amountInReceiverCurrency,
  };
  
  const updatedBankAccount: BankMainAccount = shouldApplyCommission
    ? { ...bankMainAccount, balance: bankMainAccount.balance + commissionInPDH }
    : bankMainAccount;
  
  const commissionLabel = isInternational ? 'Internacional' : 'Empresarial';
  const commissionText = shouldApplyCommission 
    ? ` | Comisión ${commissionLabel} ${(commissionRate * 100).toFixed(1)}%: ${commission.toFixed(2)} ${currency}` 
    : '';
  
  const conversionText = fromAccount.currency !== toAccount.currency
    ? ` | Envía: ${totalToDeductInSenderCurrency.toFixed(2)} ${fromAccount.currency} → Recibe: ${amountInReceiverCurrency.toFixed(2)} ${toAccount.currency}`
    : ` | Monto: ${amount.toFixed(2)} ${currency}`;
  
  const transaction: Omit<Transaction, 'id' | 'timestamp'> = {
    type: 'transfer',
    fromAccountId: fromAccount.id,
    fromAccountNumber: fromAccount.accountNumber,
    toAccountId: toAccount.id,
    toAccountNumber: toAccount.accountNumber,
    amount,
    currency,
    commission: shouldApplyCommission ? commission : undefined,
    commissionCurrency: shouldApplyCommission ? currency : undefined,
    description: `Transferencia de ${fromAccount.accountNumber} a ${toAccount.accountNumber}${conversionText}${commissionText}`,
  };
  
  return {
    updatedFromAccount,
    updatedToAccount,
    updatedBankAccount,
    transaction,
    success: true,
  };
}
