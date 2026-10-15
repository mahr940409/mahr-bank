import { supabase } from '@/integrations/supabase/client';

// Cache for exchange rates
let exchangeRatesCache: Record<string, number> = {
  PDH: 1,
  BDH: 81,
  LDH: 9,
  KYD: 1,
};

function calculateCurrencyRate(currency: {
  pdh_reserves?: number;
  printed_amount?: number;
  burned_amount?: number;
  initial_units_per_pdh?: number;
  exchange_rate_to_pdh?: number;
}): number {
  const circulation = Math.max(0, Number(currency.printed_amount || 0) - Number(currency.burned_amount || 0));
  if (circulation > 0) return Math.max(0, Number(currency.pdh_reserves || 0)) / circulation;
  const initial = Number(currency.initial_units_per_pdh || 0);
  return initial > 0 ? 1 / initial : Number(currency.exchange_rate_to_pdh || 1);
}

// Load exchange rates from DB
export async function loadExchangeRates(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('currencies')
    .select('*');
  
  if (!error && data) {
    const rates: Record<string, number> = {};
    (data as any[]).forEach((cur) => {
      rates[cur.iso_symbol] = calculateCurrencyRate(cur);
    });
    exchangeRatesCache = rates;
  }
  return exchangeRatesCache;
}

export function getExchangeRates(): Record<string, number> {
  return exchangeRatesCache;
}

// Convert any currency to PDH (base currency)
export function convertToPDH(amount: number, fromCurrency: string): number {
  const rate = exchangeRatesCache[fromCurrency];
  if (!rate) return amount; // Unknown currency, treat as 1:1
  return amount * rate;
}

// Convert PDH to any currency
export function convertFromPDH(amount: number, toCurrency: string): number {
  const rate = exchangeRatesCache[toCurrency];
  if (!rate) return amount;
  return amount / rate;
}

// Convert between any two currencies (through PDH)
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): number {
  if (fromCurrency === toCurrency) return amount;
  const amountInPDH = convertToPDH(amount, fromCurrency);
  return convertFromPDH(amountInPDH, toCurrency);
}

// Format number with thousand separators (Spanish format: 1.234,56)
export function formatNumber(amount: number): string {
  const parts = amount.toFixed(2).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimalPart = parts[1];
  return `${integerPart},${decimalPart}`;
}

// Format currency with symbol and thousand separators
export function formatCurrency(amount: number, currency: string): string {
  return `${formatNumber(amount)} ${currency}`;
}
