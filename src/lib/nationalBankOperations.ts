import { supabase } from '@/integrations/supabase/client';
import { adjustBacking, requireBackingFor, getRateToPdh, BackingLine, backingTotals } from '@/lib/backingOperations';
import { computeExchangeRate } from '@/hooks/useCountriesData';

// ---------- Types ----------
export interface NationalBank {
  id: string;
  country_id: string;
  name: string;
  status: string;
  pdh_reserve: number;
  kyd_reserve: number;
  frozen_pdh: number;
  frozen_kyd: number;
  created_at: string;
  updated_at: string;
}

export interface NationalAccount {
  id: string;
  national_bank_id: string;
  account_number: string;
  holder_name: string;
  account_type: string;
  balance_real: number;
  balance_symbolic: number;
  backing_currency: string | null;
  backing_amount: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface NationalTx {
  id: string;
  national_bank_id: string;
  transaction_type: string;
  from_account_id: string | null;
  to_account_id: string | null;
  counterparty_national_bank_id: string | null;
  amount_local: number;
  currency_local: string | null;
  backing_amount: number;
  backing_currency: string | null;
  is_symbolic: boolean;
  description: string;
  status: string;
  created_at: string;
}

export interface BankMetrics {
  printed_total: number;
  committed_real: number;
  committed_real_shared: number;  // sum across all banks sharing the same currency
  available_real: number;          // printed_total - committed_real_shared (pool global)
  committed_symbolic: number;
  total_operational: number;
  pdh_reserve: number;
  kyd_reserve: number;
  backing_total: number;       // PDH-equivalent at current rates
  backings: BackingLine[];
  backing_frozen: number;
  backing_available: number;
  currency_iso: string;
  currency_rate_to_pdh: number; // 1 local = X PDH
}

export interface CustodyAccount {
  id: string;
  national_bank_id: string;
  custody_type: 'own_resources' | 'currency_backing' | 'international_backing';
  currency_iso: string;
  amount: number;
  frozen: number;
}

// ---------- Helpers ----------

function num(v: any): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

async function logTx(t: Omit<NationalTx, 'id' | 'created_at'>) {
  const { error } = await supabase
    .from('national_bank_transactions')
    .insert(t as any);
  if (error) throw error;
}

function genAcctNumber(): string {
  const n = Math.floor(Math.random() * 9_000_000) + 1_000_000;
  return `NB-${n}`;
}

// Convert local amount -> PDH equivalent
export function localToPdh(amountLocal: number, rateToPdh: number): number {
  return amountLocal * (rateToPdh || 1);
}
// Convert PDH -> local
export function pdhToLocal(amountPdh: number, rateToPdh: number): number {
  const r = rateToPdh || 1;
  return r === 0 ? amountPdh : amountPdh / r;
}

// ---------- Metrics ----------

export function computeMetrics(args: {
  bank: NationalBank;
  accounts: NationalAccount[];
  printedTotal: number;
  currencyIso: string;
  currencyRateToPdh: number;
  committedRealShared?: number; // sum of balance_real across ALL banks sharing this currency
  backings?: BackingLine[];
}): BankMetrics {
  const committed_real = args.accounts.reduce((s, a) => s + num(a.balance_real), 0);
  const committed_real_shared = args.committedRealShared ?? committed_real;
  const committed_symbolic = args.accounts.reduce((s, a) => s + num(a.balance_symbolic), 0);
  const backings = args.backings || [];
  const t = backingTotals(backings);
  const pdh_reserve = backings.find(b => b.currency_iso === 'PDH')?.amount || 0;
  const kyd_reserve = backings.find(b => b.currency_iso === 'KYD')?.amount || 0;
  return {
    printed_total: args.printedTotal,
    committed_real,
    committed_real_shared,
    available_real: Math.max(0, args.printedTotal - committed_real_shared),
    committed_symbolic,
    total_operational: committed_real + committed_symbolic,
    pdh_reserve, kyd_reserve,
    backing_total: t.total,
    backings,
    backing_frozen: t.frozen,
    backing_available: t.available,
    currency_iso: args.currencyIso,
    currency_rate_to_pdh: args.currencyRateToPdh,
  };
}

// ---------- Operations ----------

export async function createNationalBank(countryId: string, name: string): Promise<void> {
  const { data: existing } = await supabase
    .from('national_banks').select('id').eq('country_id', countryId).maybeSingle();
  if (existing) throw new Error('Este país ya tiene un Banco Nacional. Solo se permite uno por país.');
  const { data: created, error } = await supabase
    .from('national_banks')
    .insert({ country_id: countryId, name } as any)
    .select('id')
    .single();
  if (error) throw error;
  const { error: accountError } = await supabase.from('national_bank_accounts').insert({
    national_bank_id: created.id,
    account_number: `NB-OWN-${Math.floor(Math.random() * 9000000 + 1000000)}`,
    holder_name: `${name} · Cuenta propia`,
    account_type: 'bank_treasury',
    balance_real: 0,
    balance_symbolic: 0,
    status: 'active',
  } as any);
  if (accountError) throw accountError;
}

export async function deleteNationalBank(bankId: string): Promise<void> {
  // hard delete (cascades not set; clean accounts/tx first)
  await supabase.from('national_bank_accounts').delete().eq('national_bank_id', bankId);
  await supabase.from('national_bank_transactions').delete().eq('national_bank_id', bankId);
  await supabase.from('bank_backings' as any).delete().eq('bank_type', 'national').eq('bank_id', bankId);
  const { error } = await supabase.from('national_banks').delete().eq('id', bankId);
  if (error) throw error;
}

export async function setBankStatus(bankId: string, status: string): Promise<void> {
  const { error } = await supabase.from('national_banks').update({ status } as any).eq('id', bankId);
  if (error) throw error;
}

async function adjustIssuanceReserve(bankId: string, delta: number): Promise<void> {
  const bank = await getBank(bankId);
  const { data: country } = await supabase.from('countries').select('currency_id').eq('id', bank.country_id).maybeSingle();
  if (!country?.currency_id) throw new Error('El banco no tiene una moneda asociada.');
  const { data: currency, error } = await supabase.from('currencies').select('*').eq('id', country.currency_id).single();
  if (error || !currency) throw error || new Error('Moneda no encontrada.');
  const reserves = Math.max(0, Number((currency as any).pdh_reserves) + delta);
  const rate = computeExchangeRate({ ...currency as any, pdh_reserves: reserves });
  const { error: updateError } = await supabase.from('currencies').update({ pdh_reserves: reserves, exchange_rate_to_pdh: rate } as any).eq('id', country.currency_id);
  if (updateError) throw updateError;
}

export async function addIssuanceReserve(bankId: string, amount: number): Promise<void> {
  if (amount <= 0) throw new Error('El monto debe ser mayor que cero.');
  await adjustIssuanceReserve(bankId, amount);
}

export async function withdrawIssuanceReserve(bankId: string, amount: number): Promise<void> {
  if (amount <= 0) throw new Error('El monto debe ser mayor que cero.');
  await adjustIssuanceReserve(bankId, -amount);
}

// Accounts
export async function createNationalAccount(bankId: string, holder: string, type: string): Promise<void> {
  const { error } = await supabase.from('national_bank_accounts').insert({
    national_bank_id: bankId,
    account_number: genAcctNumber(),
    holder_name: holder,
    account_type: type,
  } as any);
  if (error) throw error;
}

export async function deleteNationalAccount(accountId: string): Promise<void> {
  const { error } = await supabase.from('national_bank_accounts').delete().eq('id', accountId);
  if (error) throw error;
}

export async function updateNationalAccount(accountId: string, patch: Partial<NationalAccount>): Promise<void> {
  const { error } = await supabase.from('national_bank_accounts').update(patch as any).eq('id', accountId);
  if (error) throw error;
}

// ---------- Backing (PDH/KYD with MAHR bank-main) ----------

async function getBankMain() {
  const { data, error } = await supabase
    .from('bank_main_account').select('*').eq('id', 'bank-main').maybeSingle();
  if (error || !data) throw new Error('Cuenta MAHR Bank no encontrada.');
  return data as any;
}

async function getBank(bankId: string): Promise<NationalBank> {
  const { data, error } = await supabase
    .from('national_banks').select('*').eq('id', bankId).maybeSingle();
  if (error || !data) throw new Error('Banco Nacional no encontrado.');
  return data as unknown as NationalBank;
}

async function adjustTreasury(bankId: string, deltaReal: number): Promise<void> {
  if (!deltaReal) return;
  const { data: treasury } = await supabase.from('national_bank_accounts').select('id, balance_real').eq('national_bank_id', bankId).eq('account_type', 'bank_treasury').maybeSingle();
  if (!treasury) throw new Error('El Banco Nacional no tiene cuenta propia operativa.');
  const next = num(treasury.balance_real) + deltaReal;
  if (next < -1e-9) throw new Error('Fondos propios insuficientes en la cuenta del Banco Nacional.');
  const { error } = await supabase.from('national_bank_accounts').update({ balance_real: Math.max(0, next) } as any).eq('id', treasury.id);
  if (error) throw error;
}

/** ISO de la moneda del país del banco nacional. */
async function getBankCurrencyIso(bankId: string): Promise<string | null> {
  const bank = await getBank(bankId);
  const { data: country } = await supabase
    .from('countries').select('currency_id').eq('id', (bank as any).country_id).maybeSingle();
  if (!country) return null;
  const { data: cur } = await supabase
    .from('currencies').select('iso_symbol').eq('id', (country as any).currency_id).maybeSingle();
  return (cur as any)?.iso_symbol ?? null;
}

/**
 * Depósito de respaldo del Banco Nacional al MAHR Bank, en cualquier moneda registrada.
 * MAHR custodia el valor en PDH (bank-main sube por el valor actual en PDH).
 */
export async function addBacking(bankId: string, currency: string, amount: number): Promise<void> {
  if (amount <= 0) throw new Error('Monto inválido.');
  await getBank(bankId);
  const ownIso = await getBankCurrencyIso(bankId);
  if (ownIso && currency === ownIso) {
    throw new Error(`Un banco no puede agregar respaldo en su propia moneda (${ownIso}).`);
  }
  const rate = await getRateToPdh(currency);
  const valuePdh = amount * rate;
  const bm = await getBankMain();
  await adjustBacking('national', bankId, currency, amount);
  await supabase.from('bank_main_account')
    .update({ balance_pdh: num(bm.balance_pdh) + valuePdh } as any).eq('id', 'bank-main');

  await logTx({
    national_bank_id: bankId,
    transaction_type: 'mahr_deposit_backing',
    from_account_id: null, to_account_id: null, counterparty_national_bank_id: null,
    amount_local: 0, currency_local: null,
    backing_amount: amount, backing_currency: currency,
    is_symbolic: false,
    description: `Depósito de respaldo ${amount.toFixed(2)} ${currency} (≈ ${valuePdh.toFixed(2)} PDH) al MAHR Bank`,
    status: 'executed',
  });
}

/** Retiro de respaldo: devuelve unidades de la moneda; MAHR entrega su valor actual en PDH. */
export async function withdrawBacking(bankId: string, currency: string, amount: number): Promise<void> {
  if (amount <= 0) throw new Error('Monto inválido.');
  const rate = await getRateToPdh(currency);
  await requireBackingFor('national', bankId, currency, amount * rate);
  const valuePdh = amount * rate;
  const bm = await getBankMain();
  if (num(bm.balance_pdh) < valuePdh) throw new Error('MAHR Bank no tiene fondos suficientes para devolver el depósito.');

  await adjustBacking('national', bankId, currency, -amount);
  await supabase.from('bank_main_account')
    .update({ balance_pdh: num(bm.balance_pdh) - valuePdh } as any).eq('id', 'bank-main');

  await logTx({
    national_bank_id: bankId,
    transaction_type: 'mahr_withdraw_backing',
    from_account_id: null, to_account_id: null, counterparty_national_bank_id: null,
    amount_local: 0, currency_local: null,
    backing_amount: amount, backing_currency: currency,
    is_symbolic: false,
    description: `Retiro de respaldo ${amount.toFixed(2)} ${currency} (≈ ${valuePdh.toFixed(2)} PDH) desde MAHR Bank`,
    status: 'executed',
  });
}

// ---------- National operations ----------

/**
 * Transfer local money between two accounts of the SAME national bank.
 * The "real" total of the bank doesn't change (zero-sum). Symbolic isn't created here.
 */
export async function nationalTransfer(args: {
  bankId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currencyIso: string;
}): Promise<void> {
  const { bankId, fromAccountId, toAccountId, amount, currencyIso } = args;
  if (amount <= 0) throw new Error('Monto inválido.');
  if (fromAccountId === toAccountId) throw new Error('Cuentas iguales.');

  const { data: fromAcc } = await supabase
    .from('national_bank_accounts').select('*').eq('id', fromAccountId).maybeSingle();
  const { data: toAcc } = await supabase
    .from('national_bank_accounts').select('*').eq('id', toAccountId).maybeSingle();
  if (!fromAcc || !toAcc) throw new Error('Cuenta inexistente.');

  // For an intra-bank transfer we ONLY allow moving real balance the sender has.
  // (No symbolic creation on national transfers — symbolic only arises from intl flows.)
  if (num(fromAcc.balance_real) < amount) {
    throw new Error('Saldo real insuficiente en la cuenta origen.');
  }

  await supabase.from('national_bank_accounts')
    .update({ balance_real: num(fromAcc.balance_real) - amount } as any).eq('id', fromAccountId);
  await supabase.from('national_bank_accounts')
    .update({ balance_real: num(toAcc.balance_real) + amount } as any).eq('id', toAccountId);

  await logTx({
    national_bank_id: bankId,
    transaction_type: 'national_transfer',
    from_account_id: fromAccountId, to_account_id: toAccountId,
    counterparty_national_bank_id: null,
    amount_local: amount, currency_local: currencyIso,
    backing_amount: 0, backing_currency: null,
    is_symbolic: false,
    description: `Transferencia nacional ${fromAcc.account_number} → ${toAcc.account_number}`,
    status: 'executed',
  });
}

/**
 * National deposit: add real local money to an account.
 * Validates that bank does not exceed printed_total (real).
 * If exceeded, requires backing PDH/KYD to back the excess as symbolic.
 */
export async function nationalDeposit(args: {
  bankId: string;
  toAccountId: string;
  amount: number;
  currencyIso: string;
  availableReal: number;
  rateToPdh: number;
  moneySource: 'printed' | 'symbolic';
  backingCurrency?: string;
}): Promise<void> {
  const { bankId, toAccountId, amount, currencyIso, availableReal, rateToPdh, moneySource, backingCurrency } = args;
  if (amount <= 0) throw new Error('Monto inválido.');
  const { data: toAcc } = await supabase
    .from('national_bank_accounts').select('*').eq('id', toAccountId).maybeSingle();
  if (!toAcc) throw new Error('Cuenta inexistente.');

  let realPart = 0, symbolicPart = 0, frozenAdd = 0;
  let backingCurFinal: string | null = null;

  if (moneySource === 'printed') {
    if (amount > availableReal) {
      throw new Error(`Dinero impreso disponible insuficiente. Disponible: ${availableReal.toFixed(2)} ${currencyIso}. Cambia a "Dinero simbólico" o reduce el monto.`);
    }
    realPart = amount;
    await adjustTreasury(bankId, -realPart);
  } else {
    if (!backingCurrency) throw new Error('Selecciona la moneda de respaldo para dinero simbólico.');
    const ownIso = await getBankCurrencyIso(bankId);
    if (ownIso && backingCurrency === ownIso) {
      throw new Error(`Un banco no puede respaldar dinero simbólico con su propia moneda (${ownIso}).`);
    }
    if (toAcc.backing_currency && num(toAcc.backing_amount) > 0 && toAcc.backing_currency !== backingCurrency) {
      throw new Error(`Esta cuenta ya tiene simbólico respaldado en ${toAcc.backing_currency}. Usa esa misma moneda.`);
    }
    const equivPdh = localToPdh(amount, rateToPdh);
    const { units } = await requireBackingFor('national', bankId, backingCurrency, equivPdh);
    await adjustBacking('national', bankId, backingCurrency, 0, units);
    symbolicPart = amount;
    frozenAdd = units;
    backingCurFinal = backingCurrency;
  }

  await supabase.from('national_bank_accounts').update({
    balance_real: num(toAcc.balance_real) + realPart,
    balance_symbolic: num(toAcc.balance_symbolic) + symbolicPart,
    backing_amount: num(toAcc.backing_amount) + frozenAdd,
    backing_currency: backingCurFinal ?? toAcc.backing_currency,
  } as any).eq('id', toAccountId);

  await logTx({
    national_bank_id: bankId,
    transaction_type: 'national_deposit',
    from_account_id: null, to_account_id: toAccountId,
    counterparty_national_bank_id: null,
    amount_local: amount, currency_local: currencyIso,
    backing_amount: frozenAdd, backing_currency: backingCurFinal,
    is_symbolic: moneySource === 'symbolic',
    description: moneySource === 'symbolic'
      ? `Depósito simbólico ${amount.toFixed(2)} ${currencyIso} respaldado por ${frozenAdd.toFixed(2)} ${backingCurFinal}`
      : `Depósito con dinero impreso ${amount.toFixed(2)} ${currencyIso}`,
    status: 'executed',
  });
}

/**
 * National withdrawal: remove local from account. Releases symbolic+backing first if needed.
 */
export async function nationalWithdraw(args: {
  bankId: string;
  fromAccountId: string;
  amount: number;
  currencyIso: string;
  rateToPdh: number;
}): Promise<void> {
  const { bankId, fromAccountId, amount, currencyIso, rateToPdh } = args;
  if (amount <= 0) throw new Error('Monto inválido.');
  const { data: acc } = await supabase
    .from('national_bank_accounts').select('*').eq('id', fromAccountId).maybeSingle();
  if (!acc) throw new Error('Cuenta inexistente.');
  const total = num(acc.balance_real) + num(acc.balance_symbolic);
  if (total < amount) throw new Error('Saldo total insuficiente.');

  // Burn symbolic first (libera respaldo congelado)
  let remaining = amount;
  let releaseBacking = 0;
  let symPart = Math.min(num(acc.balance_symbolic), remaining);
  remaining -= symPart;
  let realPart = remaining;

  await adjustTreasury(bankId, realPart);

  if (symPart > 0 && acc.backing_currency) {
    const ratio = symPart / num(acc.balance_symbolic);
    releaseBacking = num(acc.backing_amount) * ratio;
    await adjustBacking('national', bankId, acc.backing_currency, 0, -releaseBacking);
  }

  await supabase.from('national_bank_accounts').update({
    balance_real: num(acc.balance_real) - realPart,
    balance_symbolic: num(acc.balance_symbolic) - symPart,
    backing_amount: Math.max(0, num(acc.backing_amount) - releaseBacking),
  } as any).eq('id', fromAccountId);

  await logTx({
    national_bank_id: bankId,
    transaction_type: 'national_withdrawal',
    from_account_id: fromAccountId, to_account_id: null,
    counterparty_national_bank_id: null,
    amount_local: amount, currency_local: currencyIso,
    backing_amount: releaseBacking, backing_currency: acc.backing_currency,
    is_symbolic: symPart > 0,
    description: `Retiro nacional (${realPart.toFixed(2)} real + ${symPart.toFixed(2)} simbólico)`,
    status: 'executed',
  });
}

// ---------- International transfer (via MAHR) ----------

export async function intlTransfer(args: {
  fromBankId: string;
  fromAccountId: string;
  toBankId: string;
  toAccountId: string;
  amountLocalFrom: number;
  backingCurrency: string;
  fromCurrencyIso: string;
  fromRateToPdh: number;
  toCurrencyIso: string;
  toRateToPdh: number;
  toAvailableReal: number;
  receiverMoneySource?: 'printed' | 'symbolic'; // default 'printed', falls back to symbolic when insufficient
}): Promise<void> {
  const {
    fromBankId, fromAccountId, toBankId, toAccountId,
    amountLocalFrom, backingCurrency,
    fromCurrencyIso, fromRateToPdh,
    toCurrencyIso, toRateToPdh, toAvailableReal,
    receiverMoneySource = 'printed',
  } = args;
  if (amountLocalFrom <= 0) throw new Error('Monto inválido.');
  if (fromBankId === toBankId) throw new Error('Bancos de origen y destino iguales.');

  const { data: fromAcc } = await supabase
    .from('national_bank_accounts').select('*').eq('id', fromAccountId).maybeSingle();
  const { data: toAcc } = await supabase
    .from('national_bank_accounts').select('*').eq('id', toAccountId).maybeSingle();
  if (!fromAcc || !toAcc) throw new Error('Cuenta inexistente.');

  // 1) Sender real balance check
  if (num(fromAcc.balance_real) < amountLocalFrom) {
    throw new Error('Saldo real insuficiente en la cuenta emisora.');
  }

  // 2) Convert local -> PDH equivalent
  const equivPdh = localToPdh(amountLocalFrom, fromRateToPdh);

  // 3) MAHR verifies sender has enough backing (not frozen)
  const fromOwnIso = await getBankCurrencyIso(fromBankId);
  if (fromOwnIso && backingCurrency === fromOwnIso) {
    throw new Error(`Un banco no puede usar su propia moneda (${fromOwnIso}) como respaldo.`);
  }
  const { units: backingUnits, rate: backingRate } = await requireBackingFor('national', fromBankId, backingCurrency, equivPdh);
  if (receiverMoneySource === 'printed') {
    const amtTo = pdhToLocal(equivPdh, toRateToPdh);
    if (amtTo > toAvailableReal) {
      throw new Error(`Dinero impreso disponible en banco destino insuficiente (${toAvailableReal.toFixed(2)} ${toCurrencyIso}). Selecciona "Dinero simbólico".`);
    }
  }

  // 4) Debit sender backing; sender's local goes BACK to the account (per spec "moneda local queda disponible nuevamente")
  //    Spec: cuenta emisora pierde el envío pero el respaldo descontado libera capacidad real del banco.
  //    Implementación: reducimos balance_real de la cuenta emisora.
  await supabase.from('national_bank_accounts')
    .update({ balance_real: num(fromAcc.balance_real) - amountLocalFrom } as any)
    .eq('id', fromAccountId);

  await adjustBacking('national', fromBankId, backingCurrency, -backingUnits);

  // 5) Credit receiver backing (same currency, same units)
  await adjustBacking('national', toBankId, backingCurrency, backingUnits);

  // 6) Convert PDH equiv -> receiver local
  const amountLocalTo = pdhToLocal(equivPdh, toRateToPdh);

  // 7) Assign to receiver based on chosen money source
  let realPart = 0, symPart = 0, frozenAdd = 0;
  if (receiverMoneySource === 'printed') {
    if (amountLocalTo > toAvailableReal) {
      throw new Error(`Dinero impreso disponible en banco destino insuficiente (${toAvailableReal.toFixed(2)} ${toCurrencyIso}). Selecciona "Dinero simbólico".`);
    }
    realPart = amountLocalTo;
  } else {
    symPart = amountLocalTo;
    frozenAdd = localToPdh(symPart, toRateToPdh) / backingRate;
    await adjustBacking('national', toBankId, backingCurrency, 0, frozenAdd);
  }


  await supabase.from('national_bank_accounts').update({
    balance_real: num(toAcc.balance_real) + realPart,
    balance_symbolic: num(toAcc.balance_symbolic) + symPart,
    backing_amount: num(toAcc.backing_amount) + frozenAdd,
    backing_currency: symPart > 0 ? backingCurrency : toAcc.backing_currency,
  } as any).eq('id', toAccountId);

  // 8) Ledger entries
  await logTx({
    national_bank_id: fromBankId,
    transaction_type: 'intl_send',
    from_account_id: fromAccountId, to_account_id: toAccountId,
    counterparty_national_bank_id: toBankId,
    amount_local: amountLocalFrom, currency_local: fromCurrencyIso,
    backing_amount: backingUnits, backing_currency: backingCurrency,
    is_symbolic: false,
    description: `Envío internacional ${amountLocalFrom.toFixed(2)} ${fromCurrencyIso} → ${amountLocalTo.toFixed(2)} ${toCurrencyIso}`,
    status: 'executed',
  });
  await logTx({
    national_bank_id: toBankId,
    transaction_type: 'intl_receive',
    from_account_id: fromAccountId, to_account_id: toAccountId,
    counterparty_national_bank_id: fromBankId,
    amount_local: amountLocalTo, currency_local: toCurrencyIso,
    backing_amount: backingUnits, backing_currency: backingCurrency,
    is_symbolic: symPart > 0,
    description: `Recepción internacional ${amountLocalTo.toFixed(2)} ${toCurrencyIso} (${realPart.toFixed(2)} real + ${symPart.toFixed(2)} simbólico)`,
    status: 'executed',
  });
}

// ---------- MAHR <-> National account transfers ----------

/**
 * Transferencia desde una cuenta del Banco Nacional hacia una cuenta MAHR.
 * - Debita la cuenta nacional (moneda local).
 * - Convierte el monto local -> PDH.
 * - Reduce el respaldo PDH del banco nacional (respaldo disponible no congelado).
 * - MAHR devuelve la custodia: bank-main.balance_pdh disminuye.
 * - Acredita la cuenta MAHR en su moneda (convertida desde PDH).
 */
export async function nationalToMahrTransfer(args: {
  bankId: string;
  fromNationalAccountId: string;
  toMahrAccountId: string;
  amountLocal: number;
  currencyLocalIso: string;
  rateToPdh: number;
  backingCurrency?: string;
}): Promise<void> {
  const { bankId, fromNationalAccountId, toMahrAccountId, amountLocal, currencyLocalIso, rateToPdh, backingCurrency = 'PDH' } = args;
  if (amountLocal <= 0) throw new Error('Monto inválido.');

  const { data: fromAcc } = await supabase
    .from('national_bank_accounts').select('*').eq('id', fromNationalAccountId).maybeSingle();
  if (!fromAcc) throw new Error('Cuenta nacional inexistente.');
  if (num(fromAcc.balance_real) < amountLocal) {
    throw new Error('Saldo real insuficiente en la cuenta nacional.');
  }

  const { data: toMahr } = await supabase
    .from('accounts').select('*').eq('id', toMahrAccountId).maybeSingle();
  if (!toMahr) throw new Error('Cuenta MAHR inexistente.');

  const equivPdh = localToPdh(amountLocal, rateToPdh);

  const ownIso2 = await getBankCurrencyIso(bankId);
  if (ownIso2 && backingCurrency === ownIso2) {
    throw new Error(`Un banco no puede usar su propia moneda (${ownIso2}) como respaldo.`);
  }
  const { units: backingUnits } = await requireBackingFor('national', bankId, backingCurrency, equivPdh);

  const bm = await getBankMain();
  if (num(bm.balance_pdh) < equivPdh) {
    throw new Error('MAHR Bank no tiene fondos suficientes para devolver la custodia.');
  }

  // Convert PDH -> MAHR account currency
  const { data: curRow } = await supabase
    .from('currencies').select('exchange_rate_to_pdh').eq('iso_symbol', toMahr.currency).maybeSingle();
  const toRate = Number(curRow?.exchange_rate_to_pdh ?? 1) || 1;
  const amountMahr = equivPdh / toRate;

  // 1) Debit national account
  await supabase.from('national_bank_accounts')
    .update({ balance_real: num(fromAcc.balance_real) - amountLocal } as any)
    .eq('id', fromNationalAccountId);

  // 2) Debit national bank backing
  await adjustBacking('national', bankId, backingCurrency, -backingUnits);

  // 3) MAHR returns custody (bank-main goes down)
  await supabase.from('bank_main_account')
    .update({ balance_pdh: num(bm.balance_pdh) - equivPdh } as any).eq('id', 'bank-main');

  // 4) Credit MAHR user account (accounts.balance_pdh stores balance in the account's own currency)
  await supabase.from('accounts')
    .update({ balance_pdh: Number(toMahr.balance_pdh) + amountMahr } as any).eq('id', toMahrAccountId);

  await logTx({
    national_bank_id: bankId,
    transaction_type: 'mahr_send',
    from_account_id: fromNationalAccountId, to_account_id: null,
    counterparty_national_bank_id: null,
    amount_local: amountLocal, currency_local: currencyLocalIso,
    backing_amount: backingUnits, backing_currency: backingCurrency,
    is_symbolic: false,
    description: `Envío a MAHR: ${amountLocal.toFixed(2)} ${currencyLocalIso} → ${amountMahr.toFixed(2)} ${toMahr.currency} (cuenta ${toMahr.account_number})`,
    status: 'executed',
  });
}

/**
 * Transferencia desde una cuenta MAHR hacia una cuenta del Banco Nacional.
 * - Debita la cuenta MAHR (moneda del cliente).
 * - Convierte a PDH -> a moneda local del banco nacional.
 * - MAHR recibe custodia (bank-main sube), y el respaldo PDH del banco nacional sube.
 * - Se acredita a la cuenta nacional dividiendo en real/simbólico según disponibilidad real,
 *   congelando el respaldo PDH equivalente cuando aplica.
 */
export async function mahrToNationalTransfer(args: {
  bankId: string;
  fromMahrAccountId: string;
  toNationalAccountId: string;
  amountMahr: number;
  currencyLocalIso: string;
  rateToPdh: number;
  availableReal: number;
  moneySource?: 'printed' | 'symbolic';
}): Promise<void> {
  const { bankId, fromMahrAccountId, toNationalAccountId, amountMahr, currencyLocalIso, rateToPdh, availableReal, moneySource = 'printed' } = args;
  if (moneySource === 'symbolic' && args && (await (async () => { const { data } = await supabase.from('national_bank_accounts').select('backing_currency, backing_amount').eq('id', toNationalAccountId).maybeSingle(); return data && (data as any).backing_currency && Number((data as any).backing_amount) > 0 && (data as any).backing_currency !== 'PDH'; })())) {
    throw new Error('Esta cuenta ya tiene simbólico respaldado en otra moneda; lo recibido desde MAHR se respalda en PDH.');
  }
  if (amountMahr <= 0) throw new Error('Monto inválido.');

  const { data: fromMahr } = await supabase
    .from('accounts').select('*').eq('id', fromMahrAccountId).maybeSingle();
  if (!fromMahr) throw new Error('Cuenta MAHR inexistente.');
  if (Number(fromMahr.balance_pdh) < amountMahr) throw new Error('Saldo MAHR insuficiente.');

  const { data: toAcc } = await supabase
    .from('national_bank_accounts').select('*').eq('id', toNationalAccountId).maybeSingle();
  if (!toAcc) throw new Error('Cuenta nacional inexistente.');

  // Convert MAHR -> PDH
  const { data: curRow } = await supabase
    .from('currencies').select('exchange_rate_to_pdh').eq('iso_symbol', fromMahr.currency).maybeSingle();
  const fromRate = Number(curRow?.exchange_rate_to_pdh ?? 1) || 1;
  const equivPdh = amountMahr * fromRate;

  // Convert PDH -> local
  const amountLocal = pdhToLocal(equivPdh, rateToPdh);

  // Assign based on chosen money source
  let realPart = 0, symPart = 0, frozenAdd = 0;
  if (moneySource === 'printed') {
    if (amountLocal > availableReal) {
      throw new Error(`Dinero impreso disponible insuficiente (${availableReal.toFixed(2)} ${currencyLocalIso}). Selecciona "Dinero simbólico".`);
    }
    realPart = amountLocal;
  } else {
    symPart = amountLocal;
    frozenAdd = localToPdh(symPart, rateToPdh);
  }


  // 1) Debit MAHR account (accounts.balance_pdh stores balance in the account's own currency)
  await supabase.from('accounts')
    .update({ balance_pdh: Number(fromMahr.balance_pdh) - amountMahr } as any).eq('id', fromMahrAccountId);

  // 2) MAHR receives custody (bank-main goes up)
  const bm = await getBankMain();
  await supabase.from('bank_main_account')
    .update({ balance_pdh: num(bm.balance_pdh) + equivPdh } as any).eq('id', 'bank-main');

  // 3) Bank national PDH reserve up, and freeze if symbolic
  await adjustBacking('national', bankId, 'PDH', equivPdh, frozenAdd);

  // 4) Credit national account (real + symbolic)
  await supabase.from('national_bank_accounts').update({
    balance_real: num(toAcc.balance_real) + realPart,
    balance_symbolic: num(toAcc.balance_symbolic) + symPart,
    backing_amount: num(toAcc.backing_amount) + frozenAdd,
    backing_currency: symPart > 0 ? 'PDH' : toAcc.backing_currency,
  } as any).eq('id', toNationalAccountId);

  await logTx({
    national_bank_id: bankId,
    transaction_type: 'mahr_receive',
    from_account_id: null, to_account_id: toNationalAccountId,
    counterparty_national_bank_id: null,
    amount_local: amountLocal, currency_local: currencyLocalIso,
    backing_amount: equivPdh, backing_currency: 'PDH',
    is_symbolic: symPart > 0,
    description: `Recepción desde MAHR: ${amountMahr.toFixed(2)} ${fromMahr.currency} (cuenta ${fromMahr.account_number}) → ${amountLocal.toFixed(2)} ${currencyLocalIso} (${realPart.toFixed(2)} real + ${symPart.toFixed(2)} simbólico)`,
    status: 'executed',
  });
}

