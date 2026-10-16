import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  NationalBank, NationalAccount, NationalTx, BankMetrics, CustodyAccount,
  computeMetrics,
  createNationalBank, deleteNationalBank, setBankStatus,
  createNationalAccount, deleteNationalAccount, updateNationalAccount,
  addBacking, withdrawBacking,
  nationalTransfer, nationalDeposit, nationalWithdraw,
  intlTransfer,
  nationalToMahrTransfer, mahrToNationalTransfer,
  addIssuanceReserve, withdrawIssuanceReserve,

} from '@/lib/nationalBankOperations';
import { useCountriesData, CurrencyRecord, CountryRecord, computeExchangeRate } from '@/hooks/useCountriesData';
import { BackingRow, enrichBackings } from '@/lib/backingOperations';

export interface NationalBankEnriched extends NationalBank {
  country?: CountryRecord;
  currency?: CurrencyRecord;
  accounts: NationalAccount[];
  custodyAccounts: CustodyAccount[];
  metrics: BankMetrics;
}

export function useNationalBanks() {
  const { countries, currencies, loading: countriesLoading, reload: reloadCountries } = useCountriesData();
  const [banks, setBanks] = useState<NationalBank[]>([]);
  const [accounts, setAccounts] = useState<NationalAccount[]>([]);
  const [txs, setTxs] = useState<NationalTx[]>([]);
  const [backings, setBackings] = useState<BackingRow[]>([]);
  const [custodies, setCustodies] = useState<CustodyAccount[]>([]);
  const [denominations, setDenominations] = useState<any[]>([]);
  const denominationsRef = useRef<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [b, a, t, bk, c, d] = await Promise.all([
      supabase.from('national_banks').select('*').order('created_at', { ascending: true }),
      supabase.from('national_bank_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('national_bank_transactions').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('bank_backings' as any).select('*').eq('bank_type', 'national'),
      supabase.from('national_bank_custody_accounts' as any).select('*'),
      supabase.from('banknote_denominations' as any).select('national_bank_id, value, bundles_withdrawn'),
    ]);
    if (bk.data) setBackings((bk.data as any[]).map(r => ({ ...r, amount: Number(r.amount), frozen: Number(r.frozen) })));
    if (b.data) setBanks(b.data as unknown as NationalBank[]);
    if (c.data) setCustodies(c.data as unknown as CustodyAccount[]);
    if (d.data) { denominationsRef.current = d.data as any[]; setDenominations(d.data as any[]); }
    if (a.data) setAccounts(a.data as unknown as NationalAccount[]);
    if (t.data) setTxs(t.data as unknown as NationalTx[]);
    // Refresh currencies so KYD printed_amount reflects the new mirror value
    await reloadCountries();
    setLoading(false);
  }, [reloadCountries]);

  useEffect(() => { load(); }, [load]);

  // Pre-compute committed_real per currency (shared pool across all banks using same currency)
  const committedRealByCurrency: Record<string, number> = {};
  for (const b of banks) {
    const country = countries.find(c => c.id === b.country_id);
    const curId = country?.currency_id;
    if (!curId) continue;
    const accs = accounts.filter(a => a.national_bank_id === b.id && a.account_type !== 'bank_treasury');
    const sum = accs.reduce((s, a) => s + Number(a.balance_real || 0), 0);
    committedRealByCurrency[curId] = (committedRealByCurrency[curId] || 0) + sum;
  }

  const rates: Record<string, number> = {};
  for (const c of currencies) rates[c.iso_symbol] = Number(c.exchange_rate_to_pdh) || 0;
  rates['PDH'] = 1;

  const enriched: NationalBankEnriched[] = banks.map(b => {
    const country = countries.find(c => c.id === b.country_id);
    const currency = country?.currency || currencies.find(c => c.id === country?.currency_id);
    // Keep the treasury account visible in the bank detail. It is the bank's
    // physical location account, not a customer balance and therefore must
    // not reduce the shared committed pool.
    const allAccs = accounts.filter(a => a.national_bank_id === b.id);
    const metricAccs = allAccs.filter(a => a.account_type !== 'bank_treasury');
    const printed = currency
      // Physical withdrawals only change where the notes are held (national
      // bank vault, private bank vault, etc.); they remain in circulation.
      ? Math.max(0, Number(currency.printed_amount || 0) - Number(currency.burned_amount || 0))
      : 0;
    const sharedCommitted = currency ? (committedRealByCurrency[currency.id] || 0) : 0;
    const metrics = computeMetrics({
      bank: b,
      accounts: metricAccs,
      printedTotal: printed,
      currencyIso: currency?.iso_symbol || 'PDH',
      currencyRateToPdh: currency ? computeExchangeRate(currency) : 1,
      committedRealShared: sharedCommitted,
      backings: enrichBackings(backings.filter(x => x.bank_id === b.id), rates),
    });
    return { ...b, country, currency, accounts: allAccs, metrics, custodyAccounts: custodies.filter((row) => row.national_bank_id === b.id) };
  });

  const reload = async () => { await Promise.all([load(), reloadCountries()]); };

  return {
    banks: enriched,
    txs,
    loading: loading || countriesLoading,
    reload,
    // ops
    createBank: async (countryId: string, name: string) => { await createNationalBank(countryId, name); await reload(); },
    deleteBank: async (id: string) => { await deleteNationalBank(id); await reload(); },
    setStatus: async (id: string, status: string) => { await setBankStatus(id, status); await reload(); },
    createAccount: async (bankId: string, holder: string, type: string) => { await createNationalAccount(bankId, holder, type); await reload(); },
    deleteAccount: async (id: string) => { await deleteNationalAccount(id); await reload(); },
    updateAccount: async (id: string, patch: Partial<NationalAccount>) => { await updateNationalAccount(id, patch); await reload(); },
    addBacking: async (bankId: string, cur: string, amount: number) => { await addBacking(bankId, cur, amount); await reload(); },
    withdrawBacking: async (bankId: string, cur: string, amount: number) => { await withdrawBacking(bankId, cur, amount); await reload(); },
    nationalTransfer: async (args: Parameters<typeof nationalTransfer>[0]) => { await nationalTransfer(args); await reload(); },
    nationalDeposit: async (args: Parameters<typeof nationalDeposit>[0]) => { await nationalDeposit(args); await reload(); },
    nationalWithdraw: async (args: Parameters<typeof nationalWithdraw>[0]) => { await nationalWithdraw(args); await reload(); },
    intlTransfer: async (args: Parameters<typeof intlTransfer>[0]) => { await intlTransfer(args); await reload(); },
    nationalToMahrTransfer: async (args: Parameters<typeof nationalToMahrTransfer>[0]) => { await nationalToMahrTransfer(args); await reload(); },
    mahrToNationalTransfer: async (args: Parameters<typeof mahrToNationalTransfer>[0]) => { await mahrToNationalTransfer(args); await reload(); },
    addIssuanceReserve: async (bankId: string, amount: number, currencyIso?: string) => { await addIssuanceReserve(bankId, amount, currencyIso); await reload(); },
    withdrawIssuanceReserve: async (bankId: string, amount: number, currencyIso?: string) => { await withdrawIssuanceReserve(bankId, amount, currencyIso); await reload(); },
  };
}
