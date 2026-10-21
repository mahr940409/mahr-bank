import { supabase } from '@/integrations/supabase/client';

export type ChequeType = 'personal' | 'bank';

export async function issueCheque(input: {
  chequeType: ChequeType;
  issuerAccountId?: string;
  issuerBankType?: 'national' | 'private' | 'mahr';
  issuerBankId?: string;
  payeeName: string;
  payeeAccountId?: string;
  currencyIso: string;
  amount: number;
  memo?: string;
}) {
  if (input.amount <= 0) throw new Error('El monto del cheque debe ser mayor que cero.');
  if (input.chequeType === 'personal' && !input.issuerAccountId) {
    throw new Error('El cheque personal necesita una cuenta emisora.');
  }
  if (input.chequeType === 'bank' && (!input.issuerBankType || !input.issuerBankId)) {
    throw new Error('El cheque bancario necesita un banco emisor.');
  }
  const { data, error } = await supabase.from('cheques' as any).insert({
    cheque_type: input.chequeType,
    issuer_account_id: input.issuerAccountId || null,
    issuer_bank_type: input.issuerBankType || null,
    issuer_bank_id: input.issuerBankId || null,
    payee_name: input.payeeName.trim(),
    payee_account_id: input.payeeAccountId || null,
    currency_iso: input.currencyIso,
    amount: input.amount,
    frozen_amount: input.chequeType === 'bank' ? input.amount : 0,
    memo: input.memo || null,
  } as any).select('*').single();
  if (error) throw error;
  return data;
}

export async function presentPersonalCheque(chequeId: string, payingBankId: string) {
  const { data: cheque, error } = await supabase.from('cheques' as any).select('*').eq('id', chequeId).single();
  if (error || !cheque) throw error || new Error('Cheque no encontrado.');
  if (cheque.cheque_type !== 'personal') throw new Error('Los cheques bancarios se liquidan entre bancos.');
  if (cheque.status !== 'issued') throw new Error('El cheque no está disponible para cobro.');
  if (!cheque.issuer_account_id) throw new Error('Cheque personal sin cuenta emisora.');
  const { data: account } = await supabase.from('accounts').select('balance_pdh').eq('id', cheque.issuer_account_id).single();
  if (!account || Number(account.balance_pdh) < Number(cheque.amount)) {
    await supabase.from('cheques' as any).update({ status: 'rejected', presented_at: new Date().toISOString() }).eq('id', chequeId);
    throw new Error('Cheque rechazado: saldo insuficiente.');
  }
  const { error: debitError } = await supabase.from('accounts').update({ balance_pdh: Number(account.balance_pdh) - Number(cheque.amount) }).eq('id', cheque.issuer_account_id);
  if (debitError) throw debitError;
  const { error: paidError } = await supabase.from('cheques' as any).update({ status: 'paid', presented_at: new Date().toISOString(), paid_at: new Date().toISOString(), frozen_amount: 0 }).eq('id', chequeId);
  if (paidError) throw paidError;
  return { ...cheque, status: 'paid', paying_bank_id: payingBankId };
}

export async function cancelCheque(chequeId: string) {
  const { error } = await supabase.from('cheques' as any).update({ status: 'cancelled', frozen_amount: 0 }).eq('id', chequeId).eq('status', 'issued');
  if (error) throw error;
}

export async function issuePromissoryNote(input: {
  issuerAccountId?: string;
  issuerBankType?: 'national' | 'private' | 'mahr';
  issuerBankId?: string;
  beneficiaryName: string;
  beneficiaryAccountId?: string;
  currencyIso: string;
  principal: number;
  interestRate?: number;
  dueAt?: string;
  memo?: string;
}) {
  if (input.principal <= 0) throw new Error('El principal del pagaré debe ser mayor que cero.');
  const { data, error } = await supabase.from('promissory_notes' as any).insert({
    issuer_account_id: input.issuerAccountId || null,
    issuer_bank_type: input.issuerBankType || null,
    issuer_bank_id: input.issuerBankId || null,
    beneficiary_name: input.beneficiaryName.trim(),
    beneficiary_account_id: input.beneficiaryAccountId || null,
    currency_iso: input.currencyIso,
    principal: input.principal,
    interest_rate: input.interestRate || 0,
    due_at: input.dueAt || null,
    outstanding: input.principal,
    memo: input.memo || null,
  } as any).select('*').single();
  if (error) throw error;
  return data;
}
