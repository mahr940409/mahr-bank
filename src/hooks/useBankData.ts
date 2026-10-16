import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Account, BankMainAccount, Transaction, Loan, LoanPayment } from '@/types/bank';
import { processDeposit, processWithdrawal, processTransfer } from '@/lib/bankOperations';
import { calculateWeeklyPayment, getInterestRateByAccountType, generatePaymentSchedule } from '@/lib/loanOperations';
import { loadExchangeRates, convertToPDH, convertCurrency } from '@/lib/currencyUtils';
import { useBankSettings } from '@/hooks/useBankSettings';
import { toast } from './use-toast';
import { mahrToNationalTransfer } from '@/lib/nationalBankOperations';
import { computeExchangeRate } from '@/hooks/useCountriesData';

export function useBankData() {
  const [bankMainAccount, setBankMainAccount] = useState<BankMainAccount>({
    id: 'bank-main',
    accountNumber: 'MAHR-BANK-000001',
    balance: 0,
  });
  
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loanPayments, setLoanPayments] = useState<LoanPayment[]>([]);
  const [loading, setLoading] = useState(true);
  
  const loadBankMainAccount = async () => {
    const { data, error } = await supabase
      .from('bank_main_account')
      .select('*')
      .eq('id', 'bank-main')
      .single();
    
    if (error) { console.error('Error loading bank main account:', error); return; }
    
    if (data) {
      setBankMainAccount({
        id: data.id,
        accountNumber: data.account_number,
        balance: Number(data.balance_pdh),
        balanceBdh: Number((data as any).balance_bdh || 0),
        balanceLdh: Number((data as any).balance_ldh || 0),
      });
    }
  };
  
  const loadAccounts = async () => {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) { console.error('Error loading accounts:', error); return; }
    
    if (data) {
      // Load countries for names
      const { data: countriesData } = await supabase.from('countries').select('id, name');
      const countriesMap: Record<string, string> = {};
      if (countriesData) {
        (countriesData as any[]).forEach(c => { countriesMap[c.id] = c.name; });
      }

      const mappedAccounts: Account[] = data.map((acc: any) => ({
        id: acc.id,
        userId: acc.user_id,
        userName: acc.user_name,
        accountNumber: acc.account_number,
        type: acc.account_type as 'personal' | 'business',
        balance: Number(acc.balance_pdh),
        balanceReal: Number(acc.balance_real ?? acc.balance_pdh ?? 0),
        balanceSymbolic: Number(acc.balance_symbolic ?? 0),
        balanceFrozen: Number(acc.balance_frozen ?? 0),
        backingCurrency: acc.backing_currency || undefined,
        backingAmount: Number(acc.backing_amount ?? 0),
        currency: acc.currency || 'PDH',
        countryId: acc.country_id || undefined,
        countryName: acc.country_id ? countriesMap[acc.country_id] : undefined,
        monthlyFee: Number(acc.monthly_fee),
        createdAt: new Date(acc.created_at),
      }));
      setAccounts(mappedAccounts);
    }
  };
  
  const loadTransactions = async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) { console.error('Error loading transactions:', error); return; }
    
    if (data) {
      const mappedTransactions: Transaction[] = data.map((txn) => ({
        id: txn.id,
        type: txn.transaction_type as any,
        fromAccountId: txn.from_account_id || undefined,
        fromAccountNumber: txn.from_account_number || undefined,
        toAccountId: txn.to_account_id || undefined,
        toAccountNumber: txn.to_account_number || undefined,
        amount: Number(txn.amount),
        currency: txn.currency,
        commission: txn.commission ? Number(txn.commission) : undefined,
        commissionCurrency: txn.commission_currency || undefined,
        description: txn.description,
        timestamp: new Date(txn.created_at),
      }));
      setTransactions(mappedTransactions);
    }
  };

  const loadLoans = async () => {
    const { data, error } = await supabase
      .from('loans')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) { console.error('Error loading loans:', error); return; }
    
    if (data) {
      const mappedLoans: Loan[] = data.map((loan: any) => ({
        id: loan.id,
        userId: loan.user_id,
        accountId: loan.account_id,
        amount: Number(loan.amount),
        currency: loan.currency || 'PDH',
        interestRate: Number(loan.interest_rate),
        termMonths: loan.term_months,
        monthlyPayment: Number(loan.monthly_payment),
        outstandingBalance: Number(loan.outstanding_balance),
        status: loan.status as any,
        startDate: loan.start_date ? new Date(loan.start_date) : undefined,
        endDate: loan.end_date ? new Date(loan.end_date) : undefined,
        createdAt: new Date(loan.created_at),
        updatedAt: new Date(loan.updated_at),
      }));
      setLoans(mappedLoans);
    }
  };

  const loadLoanPayments = async () => {
    const { data, error } = await supabase
      .from('loan_payments')
      .select('*')
      .order('due_date', { ascending: true });
    
    if (error) { console.error('Error loading loan payments:', error); return; }
    
    if (data) {
      const mappedPayments: LoanPayment[] = data.map((payment) => ({
        id: payment.id,
        loanId: payment.loan_id,
        paymentNumber: payment.payment_number,
        dueDate: new Date(payment.due_date),
        amount: Number(payment.amount),
        principal: Number(payment.principal),
        interest: Number(payment.interest),
        penalty: Number(payment.penalty),
        paidDate: payment.paid_date ? new Date(payment.paid_date) : undefined,
        status: payment.status as any,
        createdAt: new Date(payment.created_at),
      }));
      setLoanPayments(mappedPayments);
    }
  };
  
  const loadAllData = async () => {
    setLoading(true);
    await loadExchangeRates();
    await Promise.all([
      loadBankMainAccount(),
      loadAccounts(),
      loadTransactions(),
      loadLoans(),
      loadLoanPayments(),
    ]);
    setLoading(false);
  };
  
  useEffect(() => { loadAllData(); }, []);
  
  // Create account
  const createAccount = async (accountData: Omit<Account, 'id' | 'createdAt'>) => {
    const newAccount: Account = {
      ...accountData,
      id: `ACC-${Date.now()}`,
      createdAt: new Date(),
    };
    
    const { error } = await supabase.from('accounts').insert({
      id: newAccount.id,
      user_id: newAccount.userId,
      user_name: newAccount.userName,
      account_number: newAccount.accountNumber,
      account_type: newAccount.type,
      balance_pdh: newAccount.balance,
      balance_real: newAccount.balance,
      balance_symbolic: 0,
      balance_frozen: 0,
      backing_amount: 0,
      balance_bdh: 0,
      balance_ldh: 0,
      monthly_fee: newAccount.monthlyFee,
      country_id: newAccount.countryId || null,
      currency: newAccount.currency,
    } as any);
    
    if (error) {
      toast({ title: 'Error', description: 'No se pudo crear la cuenta.', variant: 'destructive' });
      return;
    }
    
    await loadAccounts();
    toast({ title: 'Cuenta creada', description: `Cuenta ${newAccount.accountNumber} creada exitosamente.` });
  };
  
  // Deposit
  const handleDeposit = async (accountId: string, amount: number, currency: string) => {
    const account = accounts.find((acc) => acc.id === accountId);
    if (!account) return;
    
    const result = processDeposit(account, amount, currency, bankMainAccount);
    const netDelta = result.updatedAccount.balance - account.balance;
    if (accountId !== 'bank-main') {
      const { error: atomicError } = await supabase.rpc('deposit_mahr_account' as any, {
        p_account_id: accountId, p_net_amount: netDelta,
        p_commission_pdh: result.updatedBankAccount.balance - bankMainAccount.balance,
        p_amount: result.transaction.amount, p_currency: result.transaction.currency,
        p_commission: result.transaction.commission || 0, p_description: result.transaction.description,
      } as any);
      if (atomicError) { toast({ title: 'Error', description: atomicError.message, variant: 'destructive' }); return; }
      await loadAllData();
      toast({ title: 'Depósito realizado', description: `Depósito de ${amount.toFixed(2)} ${currency} realizado exitosamente.` });
      return;
    }
    
    // Update account balance (stored in balance_pdh column, but actually in account's currency)
    const { error: accountError } = await supabase
      .from('accounts')
      .update({
        balance_pdh: result.updatedAccount.balance,
        balance_real: Number(account.balanceReal ?? account.balance) + (result.updatedAccount.balance - account.balance),
      } as any)
      .eq('id', accountId);
    
    if (accountError) {
      toast({ title: 'Error', description: 'No se pudo realizar el depósito.', variant: 'destructive' });
      return;
    }
    
    // Update bank account
    const { error: bankError } = await supabase
      .from('bank_main_account')
      .update({ balance_pdh: result.updatedBankAccount.balance } as any)
      .eq('id', 'bank-main');
    
    if (bankError) {
      toast({ title: 'Error', description: 'Error al actualizar cuenta del banco.', variant: 'destructive' });
      return;
    }
    
    // Save transaction
    const txnId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await supabase.from('transactions').insert({
      id: txnId,
      transaction_type: result.transaction.type,
      to_account_id: result.transaction.toAccountId,
      to_account_number: result.transaction.toAccountNumber,
      amount: result.transaction.amount,
      currency: result.transaction.currency,
      commission: result.transaction.commission,
      commission_currency: result.transaction.commissionCurrency,
      description: result.transaction.description,
    });
    
    await loadAllData();
    toast({ title: 'Depósito realizado', description: `Depósito de ${amount.toFixed(2)} ${currency} realizado exitosamente.` });
  };
  
  // Withdrawal
  const handleWithdrawal = async (accountId: string, amount: number, currency: string) => {
    const account = accountId === 'bank-main'
      ? { ...bankMainAccount, userId: 'bank', userName: 'MAHR Bank', type: 'business' as const, monthlyFee: 0, createdAt: new Date(), currency: 'PDH', balance: bankMainAccount.balance }
      : accounts.find((acc) => acc.id === accountId);
    
    if (!account) return;
    
    const result = processWithdrawal(account, amount, currency);
    
    if (!result.success) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
      return;
    }
    if (accountId !== 'bank-main') {
      const { error: atomicError } = await supabase.rpc('withdraw_mahr_account' as any, {
        p_account_id: accountId,
        p_amount_account: account.balance - result.updatedAccount.balance,
        p_amount: result.transaction.amount,
        p_currency: result.transaction.currency,
        p_description: result.transaction.description,
      } as any);
      if (atomicError) { toast({ title: 'Error', description: atomicError.message, variant: 'destructive' }); return; }
      await loadAllData();
      toast({ title: 'Retiro realizado', description: `Retiro de ${amount.toFixed(2)} ${currency} realizado exitosamente.` });
      return;
    }
    
    const tableName = accountId === 'bank-main' ? 'bank_main_account' : 'accounts';
    const { error } = await supabase
      .from(tableName as any)
      .update({
        balance_pdh: result.updatedAccount.balance,
        balance_real: accountId === 'bank-main' ? undefined : Number(account.balanceReal ?? account.balance) - (account.balance - result.updatedAccount.balance),
      } as any)
      .eq('id', accountId);
    
    if (error) {
      toast({ title: 'Error', description: 'No se pudo realizar el retiro.', variant: 'destructive' });
      return;
    }
    
    const txnId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await supabase.from('transactions').insert({
      id: txnId,
      transaction_type: result.transaction.type,
      from_account_id: result.transaction.fromAccountId,
      from_account_number: result.transaction.fromAccountNumber,
      amount: result.transaction.amount,
      currency: result.transaction.currency,
      description: result.transaction.description,
    });
    
    await loadAllData();
    toast({ title: 'Retiro realizado', description: `Retiro de ${amount.toFixed(2)} ${currency} realizado exitosamente.` });
  };
  
  // Transfer
  const handleTransfer = async (fromAccountId: string, toAccountId: string, amount: number, currency: string) => {
    const bankAsAccount: Account = {
      ...bankMainAccount, userId: 'bank', userName: 'MAHR Bank',
      type: 'business' as const, monthlyFee: 0, createdAt: new Date(),
      currency: 'PDH', balance: bankMainAccount.balance,
    };
    
    const fromAccount = fromAccountId === 'bank-main' ? bankAsAccount : accounts.find((acc) => acc.id === fromAccountId);
    const toAccount = toAccountId === 'bank-main' ? bankAsAccount : accounts.find((acc) => acc.id === toAccountId);
    
    if (!fromAccount || !toAccount) return;
    
    const result = processTransfer(fromAccount, toAccount, amount, currency, bankMainAccount);
    
    if (!result.success) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
      return;
    }

    if (fromAccountId !== 'bank-main' && toAccountId !== 'bank-main' && fromAccount.currency === toAccount.currency) {
      const { error: atomicError } = await supabase.rpc('transfer_mahr_accounts' as any, {
        p_from_account_id: fromAccountId,
        p_to_account_id: toAccountId,
        p_amount: amount,
        p_commission: result.transaction.commission || 0,
        p_currency: currency,
        p_description: result.transaction.description,
      } as any);
      if (atomicError) {
        toast({ title: 'Error', description: atomicError.message, variant: 'destructive' });
        return;
      }
      await loadAllData();
      toast({ title: 'Transferencia realizada', description: `Transferencia de ${amount.toFixed(2)} ${currency} realizada exitosamente.` });
      return;
    }
    
    // Update from account
    const fromTable = fromAccountId === 'bank-main' ? 'bank_main_account' : 'accounts';
    await supabase
      .from(fromTable as any)
      .update({
        balance_pdh: result.updatedFromAccount.balance,
        balance_real: fromAccountId === 'bank-main' ? undefined : Number(fromAccount.balanceReal ?? fromAccount.balance) - (fromAccount.balance - result.updatedFromAccount.balance),
      } as any)
      .eq('id', fromAccountId);
    
    // Update to account
    if (toAccountId === 'bank-main') {
      const bankBalance = result.updatedToAccount.balance + 
        (result.updatedBankAccount.balance - bankMainAccount.balance);
      await supabase
        .from('bank_main_account')
        .update({ balance_pdh: bankBalance } as any)
        .eq('id', 'bank-main');
    } else {
      await supabase
        .from('accounts' as any)
        .update({
          balance_pdh: result.updatedToAccount.balance,
          balance_real: toAccountId === 'bank-main' ? undefined : Number(toAccount.balanceReal ?? toAccount.balance) + (result.updatedToAccount.balance - toAccount.balance),
        } as any)
        .eq('id', toAccountId);
      
      if (result.updatedBankAccount.balance !== bankMainAccount.balance) {
        await supabase
          .from('bank_main_account')
          .update({ balance_pdh: result.updatedBankAccount.balance } as any)
          .eq('id', 'bank-main');
      }
    }
    
    const txnId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await supabase.from('transactions').insert({
      id: txnId,
      transaction_type: result.transaction.type,
      from_account_id: result.transaction.fromAccountId,
      from_account_number: result.transaction.fromAccountNumber,
      to_account_id: result.transaction.toAccountId,
      to_account_number: result.transaction.toAccountNumber,
      amount: result.transaction.amount,
      currency: result.transaction.currency,
      commission: result.transaction.commission,
      commission_currency: result.transaction.commissionCurrency,
      description: result.transaction.description,
    });
    
    await loadAllData();
    toast({ title: 'Transferencia realizada', description: `Transferencia de ${amount.toFixed(2)} ${currency} realizada exitosamente.` });
  };

  const handleTransferToNational = async (fromMahrAccountId: string, toNationalAccountId: string, amountMahr: number) => {
    const { data: target } = await supabase.from('national_bank_accounts').select('*').eq('id', toNationalAccountId).single();
    if (!target) throw new Error('Cuenta nacional inexistente.');
    const { data: bank } = await supabase.from('national_banks').select('id, country_id').eq('id', target.national_bank_id).single();
    if (!bank) throw new Error('Banco Nacional inexistente.');
    const { data: country } = await supabase.from('countries').select('currency_id').eq('id', bank.country_id).single();
    const { data: currency } = country ? await supabase.from('currencies').select('*').eq('id', country.currency_id).single() : { data: null } as any;
    if (!currency) throw new Error('Moneda nacional inexistente.');
    const { data: bankAccounts } = await supabase.from('national_bank_accounts').select('balance_real').eq('national_bank_id', bank.id);
    const committed = (bankAccounts || []).reduce((sum: number, account: any) => sum + Number(account.balance_real || 0), 0);
    const rate = computeExchangeRate(currency as any);
    const availableReal = Math.max(0, Number(currency.printed_amount || 0) - Number(currency.burned_amount || 0) - committed);
    await mahrToNationalTransfer({ bankId: bank.id, fromMahrAccountId, toNationalAccountId, amountMahr, currencyLocalIso: currency.iso_symbol, rateToPdh: rate, availableReal, moneySource: 'printed' });
    await loadAllData();
    toast({ title: 'Transferencia realizada', description: `Fondos enviados a ${currency.iso_symbol}.` });
  };

  // Request loan - amount is in account's currency
  const requestLoan = async (accountId: string, amount: number, termWeeks: number) => {
    const account = accounts.find((acc) => acc.id === accountId);
    if (!account) return;

    const currency = account.currency || 'PDH';
    const interestRate = getInterestRateByAccountType(account.type);
    const weeklyPayment = calculateWeeklyPayment(amount, interestRate, termWeeks);
    const loanId = `LOAN-${Date.now()}`;
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (termWeeks * 7));

    // Convert amount to PDH for bank main account
    const amountInPDH = convertCurrency(amount, currency, 'PDH');

    const { error: loanError } = await supabase.from('loans').insert({
      id: loanId,
      user_id: account.userId,
      account_id: accountId,
      amount,
      currency,
      interest_rate: interestRate,
      term_months: termWeeks, // DB column is term_months but stores weeks
      monthly_payment: weeklyPayment, // DB column is monthly_payment but stores weekly
      outstanding_balance: amount,
      status: 'active',
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    } as any);

    if (loanError) {
      toast({ title: 'Error', description: 'No se pudo crear el préstamo.', variant: 'destructive' });
      return;
    }

    const paymentSchedule = generatePaymentSchedule(loanId, amount, interestRate, termWeeks, startDate);
    
    for (const payment of paymentSchedule) {
      const paymentId = `PAY-${Date.now()}-${payment.paymentNumber}`;
      await supabase.from('loan_payments').insert({
        id: paymentId,
        loan_id: payment.loanId,
        payment_number: payment.paymentNumber,
        due_date: payment.dueDate.toISOString(),
        amount: payment.amount,
        principal: payment.principal,
        interest: payment.interest,
        penalty: payment.penalty,
        status: payment.status,
      });
    }

    // Disburse loan - add amount in account's currency
    const newBalance = account.balance + amount;
    await supabase
      .from('accounts')
      .update({ balance_pdh: newBalance } as any)
      .eq('id', accountId);

    // Deduct from bank in PDH
    const newBankBalance = bankMainAccount.balance - amountInPDH;
    await supabase
      .from('bank_main_account')
      .update({ balance_pdh: newBankBalance } as any)
      .eq('id', 'bank-main');

    const txnId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await supabase.from('transactions').insert({
      id: txnId,
      transaction_type: 'loan_disbursement',
      from_account_id: 'bank-main',
      from_account_number: 'MAHR-BANK-000001',
      to_account_id: accountId,
      to_account_number: account.accountNumber,
      amount,
      currency: currency,
      description: `Desembolso de préstamo ${loanId} - ${account.userName}`,
    });

    await loadAllData();
    toast({ title: 'Préstamo aprobado', description: `Préstamo de ${amount.toFixed(2)} ${currency} desembolsado exitosamente.` });
  };

  // Pay loan installment
  const payLoanInstallment = async (loanId: string, paymentId: string) => {
    const loan = loans.find((l) => l.id === loanId);
    const payment = loanPayments.find((p) => p.id === paymentId);
    const account = accounts.find((acc) => acc.id === loan?.accountId);

    if (!loan || !payment || !account) {
      toast({ title: 'Error', description: 'Datos no encontrados.', variant: 'destructive' });
      return;
    }

    const totalPayment = payment.amount + payment.penalty;
    const currency = account.currency || 'PDH';
    // Payment amounts are in account currency, convert to PDH for bank
    const totalPaymentInPDH = convertCurrency(totalPayment, currency, 'PDH');

    if (account.balance < totalPayment) {
      toast({ title: 'Error', description: 'Saldo insuficiente para pagar la cuota.', variant: 'destructive' });
      return;
    }

    await supabase.from('loan_payments').update({ status: 'paid', paid_date: new Date().toISOString() }).eq('id', paymentId);

    const newOutstandingBalance = loan.outstandingBalance - payment.principal;
    const loanStatus = newOutstandingBalance <= 0 ? 'completed' : 'active';
    await supabase.from('loans').update({ outstanding_balance: Math.max(0, newOutstandingBalance), status: loanStatus }).eq('id', loanId);

    const newAccountBalance = account.balance - totalPayment;
    await supabase.from('accounts').update({ balance_pdh: newAccountBalance } as any).eq('id', account.id);

    const newBankBalance = bankMainAccount.balance + totalPaymentInPDH;
    await supabase.from('bank_main_account').update({ balance_pdh: newBankBalance } as any).eq('id', 'bank-main');

    const txnId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await supabase.from('transactions').insert({
      id: txnId,
      transaction_type: 'loan_payment',
      from_account_id: account.id,
      from_account_number: account.accountNumber,
      to_account_id: 'bank-main',
      to_account_number: 'MAHR-BANK-000001',
      amount: totalPayment,
      currency: currency,
      description: `Pago cuota #${payment.paymentNumber} - Préstamo ${loanId.slice(0, 8)}`,
    });

    await loadAllData();
    toast({ title: 'Pago realizado', description: `Cuota #${payment.paymentNumber} pagada exitosamente.` });
  };

  // Pay loan in full (liquidar)
  const payLoanInFull = async (loanId: string) => {
    const loan = loans.find((l) => l.id === loanId);
    const account = accounts.find((acc) => acc.id === loan?.accountId);
    if (!loan || !account) {
      toast({ title: 'Error', description: 'Datos no encontrados.', variant: 'destructive' });
      return;
    }

    const pendingPayments = loanPayments.filter(
      (p) => p.loanId === loanId && p.status !== 'paid'
    );
    const penaltyTotal = pendingPayments.reduce((s, p) => s + (p.penalty || 0), 0);
    const totalPayment = loan.outstandingBalance + penaltyTotal;
    const currency = loan.currency || 'PDH';

    if (account.balance < totalPayment) {
      toast({ title: 'Error', description: 'Saldo insuficiente para liquidar el préstamo.', variant: 'destructive' });
      return;
    }

    const totalPaymentInPDH = convertCurrency(totalPayment, currency, 'PDH');

    // Mark all pending payments as paid
    for (const p of pendingPayments) {
      await supabase.from('loan_payments').update({ status: 'paid', paid_date: new Date().toISOString() }).eq('id', p.id);
    }

    await supabase.from('loans').update({ outstanding_balance: 0, status: 'completed', end_date: new Date().toISOString() }).eq('id', loanId);

    await supabase.from('accounts').update({ balance_pdh: account.balance - totalPayment } as any).eq('id', account.id);
    await supabase.from('bank_main_account').update({ balance_pdh: bankMainAccount.balance + totalPaymentInPDH } as any).eq('id', 'bank-main');

    const txnId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await supabase.from('transactions').insert({
      id: txnId,
      transaction_type: 'loan_payment',
      from_account_id: account.id,
      from_account_number: account.accountNumber,
      to_account_id: 'bank-main',
      to_account_number: 'MAHR-BANK-000001',
      amount: totalPayment,
      currency,
      description: `Liquidación total - Préstamo ${loanId.slice(0, 8)}`,
    });

    await loadAllData();
    toast({ title: 'Préstamo liquidado', description: `Se liquidó el préstamo por ${totalPayment.toFixed(2)} ${currency}.` });
  };

  // Extra payment (abono) - reduces principal and re-amortizes pending payments
  const makeLoanExtraPayment = async (loanId: string, amount: number) => {
    const loan = loans.find((l) => l.id === loanId);
    const account = accounts.find((acc) => acc.id === loan?.accountId);
    if (!loan || !account) {
      toast({ title: 'Error', description: 'Datos no encontrados.', variant: 'destructive' });
      return;
    }
    if (amount <= 0) {
      toast({ title: 'Error', description: 'El monto debe ser mayor a 0.', variant: 'destructive' });
      return;
    }
    if (amount > loan.outstandingBalance) {
      toast({ title: 'Error', description: 'El abono excede el saldo pendiente. Use Liquidar.', variant: 'destructive' });
      return;
    }
    if (account.balance < amount) {
      toast({ title: 'Error', description: 'Saldo insuficiente.', variant: 'destructive' });
      return;
    }

    const currency = loan.currency || 'PDH';
    const newOutstanding = loan.outstandingBalance - amount;

    // Re-amortize pending payments
    const pending = loanPayments
      .filter((p) => p.loanId === loanId && p.status !== 'paid')
      .sort((a, b) => a.paymentNumber - b.paymentNumber);

    if (newOutstanding <= 0) {
      // Fully paid via abono
      for (const p of pending) {
        await supabase.from('loan_payments').update({ status: 'paid', paid_date: new Date().toISOString() }).eq('id', p.id);
      }
      await supabase.from('loans').update({ outstanding_balance: 0, status: 'completed', end_date: new Date().toISOString() }).eq('id', loanId);
    } else if (pending.length > 0) {
      const weeks = pending.length;
      const annualRate = loan.interestRate;
      const newWeeklyPayment = calculateWeeklyPayment(newOutstanding, annualRate, weeks);
      const weeklyRate = annualRate / 52 / 100;
      let remaining = newOutstanding;
      for (const p of pending) {
        const interest = remaining * weeklyRate;
        const principal = newWeeklyPayment - interest;
        remaining -= principal;
        await supabase.from('loan_payments').update({
          amount: Math.round(newWeeklyPayment * 100) / 100,
          principal: Math.round(principal * 100) / 100,
          interest: Math.round(Math.max(0, interest) * 100) / 100,
        }).eq('id', p.id);
      }
      await supabase.from('loans').update({
        outstanding_balance: newOutstanding,
        monthly_payment: Math.round(newWeeklyPayment * 100) / 100,
      }).eq('id', loanId);
    } else {
      await supabase.from('loans').update({ outstanding_balance: newOutstanding }).eq('id', loanId);
    }

    const amountInPDH = convertCurrency(amount, currency, 'PDH');
    await supabase.from('accounts').update({ balance_pdh: account.balance - amount } as any).eq('id', account.id);
    await supabase.from('bank_main_account').update({ balance_pdh: bankMainAccount.balance + amountInPDH } as any).eq('id', 'bank-main');

    const txnId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await supabase.from('transactions').insert({
      id: txnId,
      transaction_type: 'loan_payment',
      from_account_id: account.id,
      from_account_number: account.accountNumber,
      to_account_id: 'bank-main',
      to_account_number: 'MAHR-BANK-000001',
      amount,
      currency,
      description: `Abono a capital - Préstamo ${loanId.slice(0, 8)}`,
    });

    await loadAllData();
    toast({ title: 'Abono realizado', description: `Se abonaron ${amount.toFixed(2)} ${currency} a capital.` });
  };

  // Capital injection
  const injectCapital = async (amount: number, currency: string, description: string) => {
    const amountInPDH = convertToPDH(amount, currency);
    const newBalancePDH = bankMainAccount.balance + amountInPDH;
    
    const { error: updateError } = await supabase
      .from('bank_main_account')
      .update({ balance_pdh: newBalancePDH } as any)
      .eq('id', 'bank-main');
    
    if (updateError) {
      toast({ title: 'Error', description: 'No se pudo inyectar el capital.', variant: 'destructive' });
      return;
    }
    
    const txnId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await supabase.from('transactions').insert({
      id: txnId,
      transaction_type: 'capital_injection',
      to_account_id: 'bank-main',
      to_account_number: bankMainAccount.accountNumber,
      amount,
      currency,
      description,
    });
    
    await loadAllData();
    toast({ title: 'Capital inyectado', description: `Se añadieron ${amount.toFixed(2)} ${currency} a la cuenta del banco.` });
  };

  const updateAccountName = async (accountId: string, newName: string) => {
    const { error } = await supabase
      .from('accounts')
      .update({ user_name: newName } as any)
      .eq('id', accountId);

    if (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar el nombre.', variant: 'destructive' });
      return;
    }

    await loadAccounts();
    toast({ title: 'Nombre actualizado', description: `El nombre de la cuenta fue actualizado a "${newName}".` });
  };

  const deleteAccount = async (accountId: string) => {
    if (accountId === 'bank-main') {
      toast({ title: 'No permitido', description: 'No puedes eliminar la cuenta principal del banco.', variant: 'destructive' });
      return false;
    }
    const account = accounts.find(a => a.id === accountId);
    if (!account) return false;
    if (Math.abs(account.balance) > 0.001) {
      toast({ title: 'Saldo no nulo', description: 'La cuenta debe tener saldo 0 antes de eliminarla.', variant: 'destructive' });
      return false;
    }
    const activeLoan = loans.find(l => l.accountId === accountId && l.status === 'active');
    if (activeLoan) {
      toast({ title: 'Préstamo activo', description: 'La cuenta tiene un préstamo activo y no se puede eliminar.', variant: 'destructive' });
      return false;
    }
    const { error } = await supabase.from('accounts').delete().eq('id', accountId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    }
    await loadAllData();
    toast({ title: 'Cuenta eliminada', description: `"${account.userName}" fue eliminada.` });
    return true;
  };

  return {
    bankMainAccount,
    accounts,
    transactions,
    loans,
    loanPayments,
    loading,
    createAccount,
    handleDeposit,
    handleWithdrawal,
    handleTransfer,
    handleTransferToNational,
    requestLoan,
    payLoanInstallment,
    payLoanInFull,
    makeLoanExtraPayment,
    injectCapital,
    updateAccountName,
    deleteAccount,
  };
}
