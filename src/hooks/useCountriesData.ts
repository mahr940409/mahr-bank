import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CurrencyRecord {
  id: string;
  name: string;
  iso_symbol: string;
  exchange_rate_to_pdh: number;
  is_fixed_rate: boolean;
  pdh_reserves: number;
  printed_amount: number;
  burned_amount: number;
  initial_units_per_pdh: number;
  created_at: string;
  updated_at: string;
}

/**
 * Compute the exchange rate (1 unit of currency = X PDH) from economic data.
 * circulation = printed - burned
 * With circulation, the current value is always reserves / circulation.
 * The initial parity is only used before any units have been issued.
 */
export function computeExchangeRate(c: {
  pdh_reserves: number;
  printed_amount: number;
  burned_amount: number;
  initial_units_per_pdh: number;
}): number {
  const circulation = Math.max(0, (c.printed_amount || 0) - (c.burned_amount || 0));
  if (circulation > 0) return Math.max(0, c.pdh_reserves || 0) / circulation;
  const initial = c.initial_units_per_pdh || 1;
  return initial > 0 ? 1 / initial : 1;
}

export interface CountryRecord {
  id: string;
  name: string;
  currency_id: string;
  created_at: string;
  updated_at: string;
  currency?: CurrencyRecord;
}

export function useCountriesData() {
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([]);
  const [countries, setCountries] = useState<CountryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCurrencies = useCallback(async () => {
    const { data, error } = await supabase
      .from('currencies')
      .select('*')
      .order('name');
    if (!error && data) {
      const existing = new Set((data as any[]).map((currency) => currency.iso_symbol));
      const systemCurrencies = [
        { name: 'Lingote de Hierro', iso_symbol: 'LDH', exchange_rate_to_pdh: 9, is_fixed_rate: true, initial_units_per_pdh: 1 / 9 },
        { name: 'Bloque de Hierro', iso_symbol: 'BDH', exchange_rate_to_pdh: 81, is_fixed_rate: true, initial_units_per_pdh: 1 / 81 },
      ].filter((currency) => !existing.has(currency.iso_symbol));
      if (systemCurrencies.length > 0) {
        await supabase.from('currencies').insert(systemCurrencies as any);
        const refreshed = await supabase.from('currencies').select('*').order('name');
        if (!refreshed.error && refreshed.data) setCurrencies(refreshed.data as unknown as CurrencyRecord[]);
      } else {
        setCurrencies(data as unknown as CurrencyRecord[]);
      }
    }
  }, []);

  const loadCountries = useCallback(async () => {
    const { data, error } = await supabase
      .from('countries')
      .select('*')
      .order('name');
    if (!error && data) {
      setCountries(data as unknown as CountryRecord[]);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadCurrencies(), loadCountries()]);
    setLoading(false);
  }, [loadCurrencies, loadCountries]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const createCurrency = async (name: string, isoSymbol: string, exchangeRate: number, isFixed: boolean) => {
    const { error } = await supabase
      .from('currencies')
      .insert({ name, iso_symbol: isoSymbol, exchange_rate_to_pdh: exchangeRate, is_fixed_rate: isFixed } as any);
    if (error) throw error;
    await loadCurrencies();
  };

  const updateExchangeRate = async (currencyId: string, newRate: number) => {
    const { error } = await supabase
      .from('currencies')
      .update({ exchange_rate_to_pdh: newRate } as any)
      .eq('id', currencyId);
    if (error) throw error;
    await loadCurrencies();
  };

  const createCountry = async (name: string, currencyId: string) => {
    const { error } = await supabase
      .from('countries')
      .insert({ name, currency_id: currencyId } as any);
    if (error) throw error;
    await loadCountries();
  };

  const deleteCountry = async (countryId: string) => {
    const { error } = await supabase
      .from('countries')
      .delete()
      .eq('id', countryId);
    if (error) throw error;
    await loadCountries();
  };

  const deleteCurrency = async (currencyId: string) => {
    const cur = currencies.find((c) => c.id === currencyId);
    if (currencyId === 'cur-pdh' || currencyId === 'cur-kyd' || cur?.iso_symbol === 'PDH' || cur?.iso_symbol === 'KYD') {
      throw new Error('PDH y KYD son monedas del sistema y no se pueden eliminar.');
    }
    const { error } = await supabase
      .from('currencies')
      .delete()
      .eq('id', currencyId);
    if (error) throw error;
    await loadAll();
  };

  const updateCurrencyEconomy = async (
    currencyId: string,
    data: {
      pdh_reserves: number;
      printed_amount: number;
      burned_amount: number;
      initial_units_per_pdh: number;
    },
  ) => {
    const newRate = computeExchangeRate(data);
    const { error } = await supabase
      .from('currencies')
      .update({ ...data, exchange_rate_to_pdh: newRate } as any)
      .eq('id', currencyId);
    if (error) throw error;
    await loadCurrencies();
  };

  // Enrich countries with currency data
  const enrichedCountries: CountryRecord[] = countries.map(c => ({
    ...c,
    currency: currencies.find(cur => cur.id === c.currency_id),
  }));

  return {
    currencies,
    countries: enrichedCountries,
    loading,
    createCurrency,
    updateExchangeRate,
    updateCurrencyEconomy,
    createCountry,
    deleteCountry,
    deleteCurrency,
    reload: loadAll,
  };
}
