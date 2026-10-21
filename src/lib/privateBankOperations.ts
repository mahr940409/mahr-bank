import { supabase } from '@/integrations/supabase/client';
import { adjustBacking, getRateToPdh, requireBackingFor, getBackings } from '@/lib/backingOperations';

// ---------- Types ----------
export interface PrivateBank {
  id: string;
  name: string;
  country_id: string;
  national_bank_id: string;
  fee_withdrawal: number;
  fee_transfer: number;
  fee_deposit: number;
  pdh_reserve: number;
  kyd_reserve: number;
  guarantor_source_type: 'mahr' | 'national' | string;
  guarantor_source_account_id: string | null;
  guarantor_frozen_kyd: number;
  guarantor_active: boolean;
  cash_on_hand?: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PrivateAccount {
  id: string;
  private_bank_id: string;
  holder: string;
  account_number: string;
  type: 'main' | 'client' | string;
  balance_real: number;
  balance_symbolic: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PrivateTx {
  id: string;
  private_bank_id: string;
  type: string;
  from_account_id: string | null;
  to_account_id: string | null;
  amount: number;
  fee: number;
  money_source: 'printed' | 'symbolic' | string;
  currency_iso: string | null;
  description: string | null;
  denomination_breakdown?: Record<string, number>;
  created_at: string;
}

export const GUARANTOR_KYD = 500_000;
export const MIN_RESERVE_RATIO = 0.10; // 10% reservas PDH+KYD sobre total gestionado (en PDH-eq)

// ---------- Helpers ----------
function num(v: any): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function genAcctNumber(prefix = 'PB'): string {
  const n = Math.floor(Math.random() * 9_000_000) + 1_000_000;
  return `${prefix}-${n}`;
}

async function logTx(t: Omit<PrivateTx, 'id' | 'created_at'>) {
  const { error } = await supabase.from('private_bank_transactions' as any).insert(t as any);
  if (error) throw error;
}

async function getBank(bankId: string): Promise<PrivateBank> {
  const { data, error } = await supabase.from('private_banks' as any).select('*').eq('id', bankId).maybeSingle();
  if (error || !data) throw new Error('Banco privado no encontrado.');
  return data as unknown as PrivateBank;
}

async function getAccount(id: string): Promise<PrivateAccount> {
  const { data, error } = await supabase.from('private_bank_accounts' as any).select('*').eq('id', id).maybeSingle();
  if (error || !data) throw new Error('Cuenta inexistente.');
  return data as unknown as PrivateAccount;
}

async function getMainAccountOfBank(bankId: string): Promise<PrivateAccount | null> {
  const { data } = await supabase.from('private_bank_accounts' as any)
    .select('*').eq('private_bank_id', bankId).eq('type', 'main').maybeSingle();
  return (data as unknown as PrivateAccount) || null;
}

// ---------- Guarantor logic ----------
// Freeze 500k KYD (or equivalent) from the chosen source.
async function freezeGuarantor(source: 'mahr' | 'national', sourceAccountId: string, rateToPdh: number): Promise<void> {
  // KYD is 1:1 with PDH.
  if (source === 'mahr') {
    if (!sourceAccountId) throw new Error('Selecciona una cuenta fiadora del MAHR Bank.');
    if (sourceAccountId === 'bank-main') {
      const { data: bm } = await supabase.from('bank_main_account').select('*').eq('id', 'bank-main').maybeSingle();
      if (!bm) throw new Error('MAHR Bank no encontrado.');
      if (num((bm as any).balance_pdh) < GUARANTOR_KYD) {
        throw new Error(`La cuenta principal del MAHR Bank no tiene ${GUARANTOR_KYD.toLocaleString()} PDH para actuar como fiador.`);
      }
      const { error } = await supabase.from('bank_main_account')
        .update({ balance_pdh: num((bm as any).balance_pdh) - GUARANTOR_KYD } as any)
        .eq('id', 'bank-main');
      if (error) throw error;
    } else {
      const { data: acc } = await supabase.from('accounts').select('*').eq('id', sourceAccountId).maybeSingle();
      if (!acc) throw new Error('Cuenta fiadora del MAHR Bank no encontrada.');
      if (num((acc as any).balance_pdh) < GUARANTOR_KYD) {
        throw new Error(`La cuenta fiadora necesita al menos ${GUARANTOR_KYD.toLocaleString()} PDH.`);
      }
      const { error } = await supabase.from('accounts')
        .update({
          balance_pdh: num((acc as any).balance_pdh) - GUARANTOR_KYD,
          balance_frozen: num((acc as any).balance_frozen) + GUARANTOR_KYD,
        } as any)
        .eq('id', sourceAccountId);
      if (error) throw error;
    }
  } else {
    // National bank account: freeze equivalent local amount = 500,000 / rateToPdh
    if (!sourceAccountId) throw new Error('Selecciona una cuenta fiadora del Banco Nacional.');
    const { data: acc } = await supabase.from('national_bank_accounts').select('*').eq('id', sourceAccountId).maybeSingle();
    if (!acc) throw new Error('Cuenta del banco nacional no encontrada.');
    const neededLocal = rateToPdh > 0 ? GUARANTOR_KYD / rateToPdh : GUARANTOR_KYD;
    if (num((acc as any).balance_real) < neededLocal) {
      throw new Error(`La cuenta necesita al menos ${neededLocal.toFixed(2)} (equiv. a 500.000 PDH) para actuar como fiador.`);
    }
    const { error } = await supabase.from('national_bank_accounts')
      .update({ balance_real: num((acc as any).balance_real) - neededLocal } as any)
      .eq('id', sourceAccountId);
    if (error) throw error;
  }
}

async function refundGuarantor(bank: PrivateBank, rateToPdh: number): Promise<void> {
  if (!bank.guarantor_active) return;
  if (bank.guarantor_source_type === 'mahr') {
    const srcId = bank.guarantor_source_account_id || 'bank-main';
    if (srcId === 'bank-main') {
      const { data: bm } = await supabase.from('bank_main_account').select('*').eq('id', 'bank-main').maybeSingle();
      if (bm) {
        const { error } = await supabase.from('bank_main_account')
          .update({ balance_pdh: num((bm as any).balance_pdh) + GUARANTOR_KYD } as any)
          .eq('id', 'bank-main');
        if (error) throw error;
      }
    } else {
      const { data: acc } = await supabase.from('accounts').select('*').eq('id', srcId).maybeSingle();
      if (acc) {
        const { error } = await supabase.from('accounts')
          .update({
            balance_pdh: num((acc as any).balance_pdh) + GUARANTOR_KYD,
            balance_frozen: Math.max(0, num((acc as any).balance_frozen) - GUARANTOR_KYD),
          } as any)
          .eq('id', srcId);
        if (error) throw error;
      }
    }
  } else if (bank.guarantor_source_account_id) {
    const { data: acc } = await supabase.from('national_bank_accounts').select('*').eq('id', bank.guarantor_source_account_id).maybeSingle();
    if (acc) {
      const returnedLocal = rateToPdh > 0 ? GUARANTOR_KYD / rateToPdh : GUARANTOR_KYD;
      const { error } = await supabase.from('national_bank_accounts')
        .update({ balance_real: num((acc as any).balance_real) + returnedLocal } as any)
        .eq('id', bank.guarantor_source_account_id);
      if (error) throw error;
    }
  }
}

/**
 * Sync guarantor state:
 * - If main account >= 500k KYD-eq and guarantor is active → refund and set inactive.
 * - If main account < 500k KYD-eq and guarantor is inactive → try to refreeze.
 */
export async function syncGuarantor(bankId: string, rateToPdh: number): Promise<void> {
  const bank = await getBank(bankId);
  const main = await getMainAccountOfBank(bankId);
  if (!main) return;
  const mainKydEq = (num(main.balance_real) + num(main.balance_symbolic)) * (rateToPdh || 1);

  if (bank.guarantor_active && mainKydEq >= GUARANTOR_KYD) {
    await refundGuarantor(bank, rateToPdh);
    const { error } = await supabase.from('private_banks' as any).update({
      guarantor_active: false,
      guarantor_frozen_kyd: 0,
    } as any).eq('id', bankId);
    if (error) throw error;
  } else if (!bank.guarantor_active && mainKydEq < GUARANTOR_KYD) {
    try {
      await freezeGuarantor(
        bank.guarantor_source_type as 'mahr' | 'national',
        bank.guarantor_source_account_id || '',
        rateToPdh,
      );
      const { error } = await supabase.from('private_banks' as any).update({
        guarantor_active: true,
        guarantor_frozen_kyd: GUARANTOR_KYD,
      } as any).eq('id', bankId);
      if (error) throw error;
    } catch (error) {
      throw new Error(`No se pudo reactivar el fiador: ${error instanceof Error ? error.message : 'error de base de datos'}`);
    }
  }
}

// ---------- Reserve check ----------
/**
 * Enforces 10% PDH+KYD reserves on total client balances (in PDH-equivalent).
 */
export async function assertReserveOk(bankId: string, rateToPdh: number, extraManagedLocal = 0): Promise<void> {
  const { data: accs } = await supabase.from('private_bank_accounts' as any)
    .select('*').eq('private_bank_id', bankId).neq('type', 'main');
  const totalLocal = (accs as any[] || []).reduce((s, a) => s + num(a.balance_real) + num(a.balance_symbolic), 0) + extraManagedLocal;
  const totalPdh = totalLocal * (rateToPdh || 1);
  let reserves = 0;
  for (const r of await getBackings('private', bankId)) {
    try { reserves += r.amount * (await getRateToPdh(r.currency_iso)); } catch { /* sin valor */ }
  }
  const minRequired = totalPdh * MIN_RESERVE_RATIO;
  if (reserves < minRequired) {
    throw new Error(`Reservas insuficientes. Mínimo requerido: ${minRequired.toFixed(2)} PDH-eq (10% del total gestionado). Actual: ${reserves.toFixed(2)} PDH-eq.`);
  }
}

// ---------- Bank CRUD ----------
export async function createPrivateBank(input: {
  name: string;
  countryId: string;
  nationalBankId: string;
  feeWithdrawal: number;
  feeTransfer: number;
  feeDeposit: number;
  pdhReserve: number;
  kydReserve: number;
  guarantorSource: 'mahr' | 'national';
  guarantorSourceAccountId?: string;
  rateToPdh: number;
}): Promise<void> {
  const { name, countryId, nationalBankId, feeWithdrawal, feeTransfer, feeDeposit,
    pdhReserve, kydReserve, guarantorSource, guarantorSourceAccountId, rateToPdh } = input;

  if (!name.trim()) throw new Error('El nombre es obligatorio.');
  if (pdhReserve < 0 || kydReserve < 0) throw new Error('Reservas inválidas.');

  // Congelar fiador ANTES de crear registro
  await freezeGuarantor(guarantorSource, guarantorSourceAccountId || '', rateToPdh);

  const bankId = crypto.randomUUID();
  const { error: e1 } = await supabase.from('private_banks' as any).insert({
    id: bankId,
    name: name.trim(),
    country_id: countryId,
    national_bank_id: nationalBankId,
    fee_withdrawal: feeWithdrawal,
    fee_transfer: feeTransfer,
    fee_deposit: feeDeposit,
    pdh_reserve: 0,
    kyd_reserve: 0,
    guarantor_source_type: guarantorSource,
    guarantor_source_account_id: guarantorSourceAccountId || null,
    guarantor_frozen_kyd: GUARANTOR_KYD,
    guarantor_active: true,
    status: 'active',
  } as any);
  if (e1) throw e1;
  if (pdhReserve > 0) await adjustBacking('private', bankId, 'PDH', pdhReserve);
  if (kydReserve > 0) await adjustBacking('private', bankId, 'KYD', kydReserve);

  // Crear cuenta principal automáticamente
  const { error: e2 } = await supabase.from('private_bank_accounts' as any).insert({
    private_bank_id: bankId,
    holder: `Cuenta Principal · ${name.trim()}`,
    account_number: genAcctNumber('PB-MAIN'),
    type: 'main',
  } as any);
  if (e2) throw e2;
}

export async function deletePrivateBank(bankId: string, rateToPdh: number): Promise<void> {
  throw new Error('Los Bancos Privados no se eliminan; deben marcarse como inactivos para conservar su cuenta principal e historial.');
}

export async function updatePrivateBank(bankId: string, patch: Partial<PrivateBank>): Promise<void> {
  const { error } = await supabase.from('private_banks' as any).update(patch as any).eq('id', bankId);
  if (error) throw error;
}

// ---------- Accounts ----------
export async function createPrivateAccount(bankId: string, holder: string): Promise<void> {
  if (!holder.trim()) throw new Error('Nombre requerido.');
  const { error } = await supabase.from('private_bank_accounts' as any).insert({
    private_bank_id: bankId,
    holder: holder.trim(),
    account_number: genAcctNumber('PB'),
    type: 'client',
  } as any);
  if (error) throw error;
}

export async function deletePrivateAccount(accountId: string): Promise<void> {
  const acc = await getAccount(accountId);
  if (acc.type === 'main') throw new Error('No puedes eliminar la cuenta principal del banco.');
  if (num(acc.balance_real) + num(acc.balance_symbolic) !== 0) {
    throw new Error('Solo se pueden eliminar cuentas con saldo cero.');
  }
  const { error } = await supabase.from('private_bank_accounts' as any).delete().eq('id', accountId);
  if (error) throw error;
}

// ---------- Reserves (MAHR ↔ private bank) ----------
export async function addReserve(bankId: string, currency: string, amount: number): Promise<void> {
  if (amount <= 0) throw new Error('Monto inválido.');
  const bankForCheck: any = await getBank(bankId);
  const { data: pCountry } = await supabase.from('countries').select('currency_id').eq('id', bankForCheck.country_id).maybeSingle();
  if (pCountry) {
    const { data: pCur } = await supabase.from('currencies').select('iso_symbol').eq('id', (pCountry as any).currency_id).maybeSingle();
    if (pCur && (pCur as any).iso_symbol === currency) {
      throw new Error(`Un banco no puede agregar respaldo en su propia moneda (${currency}).`);
    }
  }
  const rate = await getRateToPdh(currency);
  const valuePdh = amount * rate;
  const { data: bm } = await supabase.from('bank_main_account').select('*').eq('id', 'bank-main').maybeSingle();
  if (!bm) throw new Error('MAHR Bank no encontrado.');
  if (num((bm as any).balance_pdh) < valuePdh) throw new Error(`MAHR Bank no tiene fondos suficientes (${valuePdh.toFixed(2)} PDH).`);

  await getBank(bankId);
  await supabase.from('bank_main_account')
    .update({ balance_pdh: num((bm as any).balance_pdh) - valuePdh } as any).eq('id', 'bank-main');
  await adjustBacking('private', bankId, currency, amount);

  await logTx({
    private_bank_id: bankId,
    type: 'reserve_add',
    from_account_id: null, to_account_id: null,
    amount, fee: 0, money_source: 'printed', currency_iso: currency,
    description: `Aporte de reserva ${amount.toFixed(2)} ${currency} (≈ ${valuePdh.toFixed(2)} PDH)`,
  });
}

export async function withdrawReserve(bankId: string, currency: string, amount: number): Promise<void> {
  if (amount <= 0) throw new Error('Monto inválido.');
  const rate = await getRateToPdh(currency);
  await requireBackingFor('private', bankId, currency, amount * rate);
  const valuePdh = amount * rate;
  await adjustBacking('private', bankId, currency, -amount);

  const { data: bm } = await supabase.from('bank_main_account').select('*').eq('id', 'bank-main').maybeSingle();
  if (bm) {
    await supabase.from('bank_main_account')
      .update({ balance_pdh: num((bm as any).balance_pdh) + valuePdh } as any).eq('id', 'bank-main');
  }

  await logTx({
    private_bank_id: bankId,
    type: 'reserve_withdraw',
    from_account_id: null, to_account_id: null,
    amount, fee: 0, money_source: 'printed', currency_iso: currency,
    description: `Retiro de reserva ${amount.toFixed(2)} ${currency} (≈ ${valuePdh.toFixed(2)} PDH)`,
  });
}

// ---------- Vault cash (físico, enviado por el Banco Nacional) ----------
export async function moveVaultCash(bankId: string, nationalAccountId: string, amount: number, direction: 'in' | 'out', currencyIso: string): Promise<void> {
  if (amount <= 0) throw new Error('Monto inválido.');
  const bank = await getBank(bankId);
  const { data: nAcc } = await supabase.from('national_bank_accounts').select('*').eq('id', nationalAccountId).maybeSingle();
  if (!nAcc) throw new Error('Cuenta del Banco Nacional no encontrada.');
  const cash = num((bank as any).cash_on_hand);
  const real = num((nAcc as any).balance_real);
  if (direction === 'in' && real < amount) throw new Error('Dinero impreso insuficiente en la cuenta del Banco Nacional.');
  if (direction === 'out' && cash < amount) throw new Error(`Efectivo insuficiente en bóveda (disponible ${cash.toFixed(2)}).`);
  await supabase.from('national_bank_accounts')
    .update({ balance_real: direction === 'in' ? real - amount : real + amount } as any).eq('id', nationalAccountId);
  await supabase.from('private_banks' as any)
    .update({ cash_on_hand: direction === 'in' ? cash + amount : cash - amount } as any).eq('id', bankId);
  await logTx({
    private_bank_id: bankId,
    type: direction === 'in' ? 'cash_in' : 'cash_out',
    from_account_id: direction === 'in' ? nationalAccountId : null,
    to_account_id: direction === 'out' ? nationalAccountId : null,
    amount, fee: 0, money_source: 'printed', currency_iso: currencyIso,
    description: direction === 'in' ? `Efectivo recibido del Banco Nacional ${amount.toFixed(2)} ${currencyIso}` : `Efectivo devuelto al Banco Nacional ${amount.toFixed(2)} ${currencyIso}`,
  });
}

// ---------- Operations ----------
// Fees are always credited to the bank's main account (in local currency).

async function creditFeeToMain(bankId: string, fee: number): Promise<void> {
  if (fee <= 0) return;
  const main = await getMainAccountOfBank(bankId);
  if (!main) return;
  await supabase.from('private_bank_accounts' as any)
    .update({ balance_real: num(main.balance_real) + fee } as any)
    .eq('id', main.id);
}

/**
 * Deposit: bring money INTO a private-bank client account.
 * - 'printed': comes from a chosen national-bank account (real transfer real→real).
 * - 'symbolic': freeze equivalent PDH/KYD reserve in the private bank; credit balance_symbolic.
 */
export async function privateDeposit(args: {
  bankId: string;
  toAccountId: string;
  amount: number; // in local currency
  currencyIso: string;
  rateToPdh: number;
  sourceRateToPdh?: number;
  moneySource: 'printed' | 'symbolic';
  sourceNationalAccountId?: string; // for printed
  backingCurrency?: string;   // for symbolic
  denominationBreakdown?: Record<string, number>;
}): Promise<void> {
  const { bankId, toAccountId, amount, currencyIso, rateToPdh, moneySource } = args;
  if (amount <= 0) throw new Error('Monto inválido.');
  const to = await getAccount(toAccountId);
  const bank = await getBank(bankId);
  const sourceRateToPdh = args.sourceRateToPdh ?? (
    currencyIso === 'PDH' ? 1 : currencyIso === 'LDH' ? 9 : currencyIso === 'BDH' ? 81 : rateToPdh
  );
  const accountAmount = amount * (sourceRateToPdh || 1) / (rateToPdh || 1);
  const feeRate = num(bank.fee_deposit) / 100;
  const fee = accountAmount * feeRate;
  const net = accountAmount - fee;

  if (moneySource === 'printed') {
    const resourceCurrency = ['PDH', 'LDH', 'BDH'].includes(currencyIso);
    if (!resourceCurrency && (!args.denominationBreakdown || Object.keys(args.denominationBreakdown).length === 0)) {
      throw new Error('Indica cuántos billetes recibes de cada denominación.');
    }
    const physicalTotal = Object.entries(args.denominationBreakdown).reduce(
      (sum, [value, count]) => sum + Number(value) * Number(count), 0,
    );
    if (!resourceCurrency && Math.abs(physicalTotal - amount) > 0.000001) {
      throw new Error(`Las denominaciones suman ${physicalTotal.toFixed(2)}, pero el monto indicado es ${amount.toFixed(2)}.`);
    }
    const { data: denominations, error: denominationError } = await supabase
      .from('banknote_denominations' as any)
      .select('id, value, boxes_printed')
      .eq('national_bank_id', bank.national_bank_id);
    if (denominationError) throw denominationError;
    for (const [value, countRaw] of Object.entries(args.denominationBreakdown)) {
      const count = Math.floor(Number(countRaw));
      const denomination = (denominations as any[] || []).find(d => Math.abs(Number(d.value) - Number(value)) < 0.000001);
      if (!denomination) throw new Error(`La denominación ${value} no está emitida por el Banco Nacional.`);
      const { data: held } = await supabase.from('banknote_custody' as any)
        .select('quantity').eq('denomination_id', denomination.id);
      const alreadyHeld = (held as any[] || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0);
      const issued = Number(denomination.boxes_printed || 0) * 16;
      if (count > issued - alreadyHeld) {
        throw new Error(`No hay suficientes billetes de ${value} en circulación. Disponibles: ${Math.max(0, issued - alreadyHeld)}.`);
      }
    }
    await supabase.from('private_bank_accounts' as any)
      .update({ balance_real: num(to.balance_real) + net } as any).eq('id', toAccountId);
    for (const [value, countRaw] of Object.entries(args.denominationBreakdown)) {
      const denomination = (denominations as any[] || []).find(d => Math.abs(Number(d.value) - Number(value)) < 0.000001);
      if (denomination) {
        const { data: current } = await supabase.from('banknote_custody' as any)
          .select('quantity').eq('bank_type', 'private').eq('bank_id', bankId).eq('denomination_id', denomination.id).maybeSingle();
        await supabase.from('banknote_custody' as any).upsert({
          bank_type: 'private', bank_id: bankId, denomination_id: denomination.id,
          quantity: Number(current?.quantity || 0) + Math.floor(Number(countRaw)), updated_at: new Date().toISOString(),
        } as any, { onConflict: 'bank_type,bank_id,denomination_id' });
      }
    }
    // Transferencia desde el banco nacional: no es efectivo, no entra a la bóveda.
  } else {
    if (!args.backingCurrency) throw new Error('Selecciona la moneda de respaldo para dinero simbólico.');
    const { data: dCountry } = await supabase.from('countries').select('currency_id').eq('id', (bank as any).country_id).maybeSingle();
    if (dCountry) {
      const { data: dCur } = await supabase.from('currencies').select('iso_symbol').eq('id', (dCountry as any).currency_id).maybeSingle();
      if (dCur && (dCur as any).iso_symbol === args.backingCurrency) {
        throw new Error(`Un banco no puede respaldar dinero simbólico con su propia moneda (${args.backingCurrency}).`);
      }
    }
    const equivPdh = amount * (rateToPdh || 1);
    const { units } = await requireBackingFor('private', bankId, args.backingCurrency, equivPdh);
    // Consume reserve (mueve el respaldo a "circulación" simbólica). Se libera al retirar (en PDH).
    await adjustBacking('private', bankId, args.backingCurrency, -units);
    await supabase.from('private_bank_accounts' as any)
      .update({ balance_symbolic: num(to.balance_symbolic) + net } as any).eq('id', toAccountId);
  }

  await creditFeeToMain(bankId, fee);

  await logTx({
    private_bank_id: bankId,
    type: 'deposit',
    from_account_id: args.sourceNationalAccountId || null,
    to_account_id: toAccountId,
    amount: net, fee, money_source: moneySource, currency_iso: currencyIso,
    denomination_breakdown: moneySource === 'printed' ? (args.denominationBreakdown || {}) : {},
    description: `Depósito ${moneySource === 'symbolic' ? 'simbólico' : 'impreso'} ${amount.toFixed(2)} ${currencyIso} → ${net.toFixed(2)} moneda de cuenta (fee ${fee.toFixed(2)})`,
  });

  await assertReserveOk(bankId, rateToPdh).catch(async (e) => {
    // rollback? Simplemente relanzar (los datos ya cambiaron; en un simulador es tolerable).
    throw e;
  });
  await syncGuarantor(bankId, rateToPdh);
}

/**
 * Withdrawal: pull money OUT of a client account back to a national bank account (real) or burn symbolic.
 */
export async function privateWithdraw(args: {
  bankId: string;
  fromAccountId: string;
  amount: number;
  currencyIso: string;
  rateToPdh: number;
  destinationNationalAccountId?: string; // where the real money goes back
}): Promise<void> {
  const { bankId, fromAccountId, amount, currencyIso, rateToPdh } = args;
  if (amount <= 0) throw new Error('Monto inválido.');
  const acc = await getAccount(fromAccountId);
  const total = num(acc.balance_real) + num(acc.balance_symbolic);
  if (total < amount) throw new Error('Saldo total insuficiente.');
  const bank = await getBank(bankId);
  const feeRate = num(bank.fee_withdrawal) / 100;
  const fee = amount * feeRate;
  const netOut = amount - fee;

  // Consume simbólico primero, real después
  let remaining = amount;
  const symPart = Math.min(num(acc.balance_symbolic), remaining);
  remaining -= symPart;
  const realPart = remaining;

  // Todo retiro entrega efectivo físico: debe existir en la bóveda (sin importar si el saldo era real o simbólico)
  const cash = num((bank as any).cash_on_hand);
  if (cash < netOut) throw new Error(`Efectivo insuficiente en la bóveda del banco privado (disponible ${cash.toFixed(2)} ${currencyIso}, requerido ${netOut.toFixed(2)}).`);
  const { data: heldNotes } = await supabase.from('banknote_custody' as any)
    .select('quantity, denomination_id, banknote_denominations(value)')
    .eq('bank_type', 'private').eq('bank_id', bankId);
  const heldValue = (heldNotes as any[] || []).reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.banknote_denominations?.value || 0), 0);
  if (heldValue < netOut && !['PDH', 'LDH', 'BDH'].includes(currencyIso)) {
    throw new Error(`Los billetes físicos registrados (${heldValue.toFixed(2)} ${currencyIso}) no cubren este retiro.`);
  }
  await supabase.from('private_banks' as any)
    .update({ cash_on_hand: cash - netOut } as any).eq('id', bankId);

  // Liberar reserva simbólica (regresa al banco privado)
  if (symPart > 0) {
    const equivPdh = symPart * (rateToPdh || 1);
    await adjustBacking('private', bankId, 'PDH', equivPdh);
  }


  await supabase.from('private_bank_accounts' as any).update({
    balance_real: num(acc.balance_real) - realPart,
    balance_symbolic: num(acc.balance_symbolic) - symPart,
  } as any).eq('id', fromAccountId);

  await creditFeeToMain(bankId, fee);

  await logTx({
    private_bank_id: bankId,
    type: 'withdrawal',
    from_account_id: fromAccountId,
    to_account_id: args.destinationNationalAccountId || null,
    amount, fee, money_source: symPart > 0 ? 'symbolic' : 'printed', currency_iso: currencyIso,
    description: `Retiro ${amount.toFixed(2)} ${currencyIso} (real ${realPart.toFixed(2)}, simb ${symPart.toFixed(2)}, fee ${fee.toFixed(2)})`,
  });

  await syncGuarantor(bankId, rateToPdh);
}

/**
 * Intra-private-bank transfer between two client accounts (or main → client / client → main).
 */
export async function privateTransfer(args: {
  bankId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currencyIso: string;
  rateToPdh: number;
}): Promise<void> {
  const { bankId, fromAccountId, toAccountId, amount, currencyIso, rateToPdh } = args;
  if (amount <= 0) throw new Error('Monto inválido.');
  if (fromAccountId === toAccountId) throw new Error('Cuentas iguales.');
  const from = await getAccount(fromAccountId);
  const to = await getAccount(toAccountId);
  const totalFrom = num(from.balance_real) + num(from.balance_symbolic);
  if (totalFrom < amount) throw new Error('Saldo insuficiente en origen.');

  const bank = await getBank(bankId);
  const feeRate = num(bank.fee_transfer) / 100;
  const fee = amount * feeRate;
  const net = amount - fee;

  // Consume simbólico primero
  let remaining = amount;
  const symPart = Math.min(num(from.balance_symbolic), remaining);
  remaining -= symPart;
  const realPart = remaining;

  // El destino recibe manteniendo proporción real/simbólica del neto
  const netRatioReal = amount > 0 ? realPart / amount : 0;
  const netRatioSym = amount > 0 ? symPart / amount : 0;
  const arrivingReal = net * netRatioReal;
  const arrivingSym = net * netRatioSym;

  await supabase.from('private_bank_accounts' as any).update({
    balance_real: num(from.balance_real) - realPart,
    balance_symbolic: num(from.balance_symbolic) - symPart,
  } as any).eq('id', fromAccountId);

  await supabase.from('private_bank_accounts' as any).update({
    balance_real: num(to.balance_real) + arrivingReal,
    balance_symbolic: num(to.balance_symbolic) + arrivingSym,
  } as any).eq('id', toAccountId);

  await creditFeeToMain(bankId, fee);

  await logTx({
    private_bank_id: bankId,
    type: 'transfer',
    from_account_id: fromAccountId, to_account_id: toAccountId,
    amount: net, fee, money_source: symPart > 0 ? 'symbolic' : 'printed', currency_iso: currencyIso,
    description: `Transferencia interna (fee ${fee.toFixed(2)})`,
  });

  await syncGuarantor(bankId, rateToPdh);
}
