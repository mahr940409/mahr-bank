import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCountriesData, CurrencyRecord, CountryRecord } from '@/hooks/useCountriesData';
import { BackingRow, BackingLine, enrichBackings, backingTotals } from '@/lib/backingOperations';
import {
  PrivateBank, PrivateAccount, PrivateTx,
  createPrivateBank, deletePrivateBank, updatePrivateBank,
  createPrivateAccount, deletePrivateAccount,
  addReserve, withdrawReserve,
  privateDeposit, privateWithdraw, privateTransfer,
  syncGuarantor, moveVaultCash,
  GUARANTOR_KYD, MIN_RESERVE_RATIO,
} from '@/lib/privateBankOperations';

export interface PrivateBankEnriched extends PrivateBank {
  country?: CountryRecord;
  currency?: CurrencyRecord;
  accounts: PrivateAccount[];
  main?: PrivateAccount;
  backings: BackingLine[];
  metrics: {
    total_client_local: number;
    total_client_pdh: number;
    reserves_pdh_eq: number;
    reserves_required: number;
    reserves_ratio: number;
    reserves_ok: boolean;
    main_balance_local: number;
    main_balance_kyd_eq: number;
    guarantor_needed: boolean;
    currency_iso: string;
    rate_to_pdh: number;
  };
}

export function usePrivateBanks() {
  const { countries, currencies, loading: countriesLoading, reload: reloadCountries } = useCountriesData();
  const [banks, setBanks] = useState<PrivateBank[]>([]);
  const [accounts, setAccounts] = useState<PrivateAccount[]>([]);
  const [txs, setTxs] = useState<PrivateTx[]>([]);
  const [backings, setBackings] = useState<BackingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [b, a, t, bk] = await Promise.all([
      supabase.from('private_banks' as any).select('*').order('created_at', { ascending: true }),
      supabase.from('private_bank_accounts' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('private_bank_transactions' as any).select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('bank_backings' as any).select('*').eq('bank_type', 'private'),
    ]);
    if (bk.data) setBackings((bk.data as any[]).map(r => ({ ...r, amount: Number(r.amount), frozen: Number(r.frozen) })));
    if (b.data) setBanks(b.data as unknown as PrivateBank[]);
    if (a.data) setAccounts(a.data as unknown as PrivateAccount[]);
    if (t.data) setTxs(t.data as unknown as PrivateTx[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const rates: Record<string, number> = {};
  for (const c of currencies) rates[c.iso_symbol] = Number(c.exchange_rate_to_pdh) || 0;
  rates['PDH'] = 1;

  const enriched: PrivateBankEnriched[] = banks.map(b => {
    const bankBackings = enrichBackings(backings.filter(x => x.bank_id === b.id), rates);
    const country = countries.find(c => c.id === b.country_id);
    const currency = country?.currency || currencies.find(c => c.id === country?.currency_id);
    const rate = Number(currency?.exchange_rate_to_pdh ?? 1);
    const accs = accounts.filter(a => a.private_bank_id === b.id);
    const main = accs.find(a => a.type === 'main');
    const clients = accs.filter(a => a.type !== 'main');
    const totalLocal = clients.reduce((s, a) => s + Number(a.balance_real || 0) + Number(a.balance_symbolic || 0), 0);
    const totalPdh = totalLocal * rate;
    const reserves = backingTotals(bankBackings).total;
    const required = totalPdh * MIN_RESERVE_RATIO;
    const mainLocal = main ? Number(main.balance_real || 0) + Number(main.balance_symbolic || 0) : 0;
    const mainKyd = mainLocal * rate;
    return {
      ...b,
      country, currency, accounts: accs, main, backings: bankBackings,
      metrics: {
        total_client_local: totalLocal,
        total_client_pdh: totalPdh,
        reserves_pdh_eq: reserves,
        reserves_required: required,
        reserves_ratio: totalPdh > 0 ? reserves / totalPdh : 1,
        reserves_ok: reserves >= required,
        main_balance_local: mainLocal,
        main_balance_kyd_eq: mainKyd,
        guarantor_needed: mainKyd < GUARANTOR_KYD,
        currency_iso: currency?.iso_symbol || 'PDH',
        rate_to_pdh: rate,
      },
    };
  });

  const reload = async () => { await Promise.all([load(), reloadCountries()]); };

  const rateFor = (bankId: string): number => {
    const eb = enriched.find(b => b.id === bankId);
    return eb?.metrics.rate_to_pdh ?? 1;
  };

  return {
    banks: enriched,
    txs,
    loading: loading || countriesLoading,
    reload,
    createBank: async (input: Parameters<typeof createPrivateBank>[0]) => { await createPrivateBank(input); await reload(); },
    deleteBank: async (id: string) => { await deletePrivateBank(id, rateFor(id)); await reload(); },
    updateBank: async (id: string, patch: Partial<PrivateBank>) => { await updatePrivateBank(id, patch); await reload(); },
    createAccount: async (bankId: string, holder: string) => { await createPrivateAccount(bankId, holder); await reload(); },
    deleteAccount: async (id: string) => { await deletePrivateAccount(id); await reload(); },
    addReserve: async (bankId: string, cur: string, amount: number) => { await addReserve(bankId, cur, amount); await reload(); },
    withdrawReserve: async (bankId: string, cur: string, amount: number) => { await withdrawReserve(bankId, cur, amount); await reload(); },
    deposit: async (a: Parameters<typeof privateDeposit>[0]) => { await privateDeposit(a); await reload(); },
    withdraw: async (a: Parameters<typeof privateWithdraw>[0]) => { await privateWithdraw(a); await reload(); },
    transfer: async (a: Parameters<typeof privateTransfer>[0]) => { await privateTransfer(a); await reload(); },
    moveCash: async (bankId: string, nAccId: string, amount: number, dir: "in" | "out", iso: string) => { await moveVaultCash(bankId, nAccId, amount, dir, iso); await reload(); },
    syncGuarantor: async (bankId: string) => { await syncGuarantor(bankId, rateFor(bankId)); await reload(); },
  };
}
