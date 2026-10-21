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
  if (input.chequeType === 'bank') {
    const { data, error } = await supabase.rpc('issue_bank_cheque' as any, {
      p_issuer_bank_type: input.issuerBankType,
      p_issuer_bank_id: input.issuerBankId,
      p_issuer_account_id: input.issuerAccountId || null,
      p_payee_name: input.payeeName.trim(),
      p_payee_account_id: input.payeeAccountId || null,
      p_currency_iso: input.currencyIso,
      p_amount: input.amount,
      p_memo: input.memo || null,
    } as any);
    if (error) throw error;
    return data;
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
    frozen_amount: 0,
    memo: input.memo || null,
  } as any).select('*').single();
  if (error) throw error;
  return data;
}

export async function presentPersonalCheque(chequeId: string, payingBankId: string) {
  const { data, error } = await supabase.rpc('present_personal_cheque' as any, { p_cheque_id: chequeId, p_paying_bank_id: payingBankId } as any);
  if (error) throw error;
  return data;
}

export async function cancelCheque(chequeId: string) {
  const { data: cheque } = await supabase.from('cheques' as any).select('cheque_type').eq('id', chequeId).maybeSingle();
  const { error } = cheque?.cheque_type === 'bank'
    ? await supabase.rpc('cancel_bank_cheque' as any, { p_cheque_id: chequeId } as any)
    : await supabase.from('cheques' as any).update({ status: 'cancelled', frozen_amount: 0 }).eq('id', chequeId).eq('status', 'issued');
  if (error) throw error;
}

export async function presentBankCheque(chequeId: string) {
  const { data, error } = await supabase.rpc('present_bank_cheque' as any, { p_cheque_id: chequeId } as any);
  if (error) throw error;
  return data;
}

export async function payPromissoryNote(noteId: string) {
  const { data, error } = await supabase.rpc('pay_promissory_note' as any, { p_note_id: noteId } as any);
  if (error) throw error;
  return data;
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
