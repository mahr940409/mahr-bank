import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { convertCurrency, loadExchangeRates } from '@/lib/currencyUtils';

export interface Commodity {
  id: string;
  name: string;
  code: string;
  priceInKyd: number;
  trend: string;
  updatedAt: string;
}

export interface CommodityDeposit {
  id: string;
  accountId: string;
  commodityId: string;
  units: number;
  priceAtDeposit: number;
  currencyAtDeposit: string;
  totalValueAtDeposit: number;
  status: string;
  createdAt: string;
  commodity?: Commodity;
  accountNumber?: string;
}

export function useCommoditiesData() {
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [deposits, setDeposits] = useState<CommodityDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  async function loadCommodities() {
    const { data, error } = await supabase
      .from('commodities')
      .select('*')
      .order('name');
    if (!error && data) {
      setCommodities(
        (data as any[]).map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
          priceInKyd: Number(c.price_in_kyd),
          trend: c.trend,
          updatedAt: c.updated_at,
        }))
      );
    }
  }

  async function loadDeposits() {
    const { data, error } = await supabase
      .from('commodity_deposits')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setDeposits(
        (data as any[]).map((d) => ({
          id: d.id,
          accountId: d.account_id,
          commodityId: d.commodity_id,
          units: Number(d.units),
          priceAtDeposit: Number(d.price_at_deposit),
          currencyAtDeposit: d.currency_at_deposit,
          totalValueAtDeposit: Number(d.total_value_at_deposit),
          status: d.status,
          createdAt: d.created_at,
        }))
      );
    }
  }

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadCommodities(), loadDeposits()]);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function syncPrices() {
    await loadCommodities();
  }

  // Precio manual (sin API): guarda el nuevo valor en PDH y calcula la tendencia
  async function updatePrice(id: string, newPrice: number) {
    const current = commodities.find((c) => c.id === id);
    const old = current?.priceInKyd ?? 0;
    const trend = newPrice > old ? 'up' : newPrice < old ? 'down' : 'stable';
    const { error } = await supabase.from('commodities').update({ price_in_kyd: newPrice, trend } as any).eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    await loadCommodities();
    toast({ title: 'Precio actualizado', description: `${current?.name ?? ''}: ${newPrice} PDH` });
  }

  // DEPOSITAR: El usuario trae el commodity al banco, se le acredita el valor en su cuenta
  async function depositCommodity(
    accountId: string,
    commodityId: string,
    units: number,
    accountCurrency: string
  ) {
    try {
      const commodity = commodities.find((c) => c.id === commodityId);
      if (!commodity) throw new Error('Commodity no encontrado');

      const totalValueKYD = units * commodity.priceInKyd;

      const { data: accData, error: accErr } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .single();
      if (accErr || !accData) throw new Error('Cuenta no encontrada');

      const account = accData as any;
      const currentBalance = Number(account.balance_pdh);
      const accCur = account.currency || accountCurrency || 'PDH';
      await loadExchangeRates();
      const valueLocal = convertCurrency(totalValueKYD, 'PDH', accCur);

      // Add value (PDH price converted to the account's currency)
      const { error: upErr } = await supabase
        .from('accounts')
        .update({ balance_pdh: currentBalance + valueLocal })
        .eq('id', accountId);
      if (upErr) throw upErr;

      // Create deposit record
      const { error: depErr } = await supabase
        .from('commodity_deposits')
        .insert({
          account_id: accountId,
          commodity_id: commodityId,
          units,
          price_at_deposit: commodity.priceInKyd,
          currency_at_deposit: accountCurrency,
          total_value_at_deposit: totalValueKYD,
          status: 'active',
        });
      if (depErr) throw depErr;

      // Record transaction
      await supabase
        .from('transactions')
        .insert({
          id: crypto.randomUUID(),
          transaction_type: 'commodity_deposit',
          to_account_id: accountId,
          to_account_number: account.account_number,
          amount: valueLocal,
          currency: accCur,
          description: `Depósito de ${units} ${commodity.code} a ${commodity.priceInKyd.toFixed(2)} PDH c/u`,
        });

      await loadAll();
      toast({ title: 'Depósito exitoso', description: `${units} ${commodity.code} depositados. +${valueLocal.toFixed(2)} ${accCur}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }

  // COMPRAR: El usuario compra commodity con dinero de su cuenta (se deduce el saldo)
  async function buyCommodity(
    accountId: string,
    commodityId: string,
    units: number,
    accountCurrency: string
  ) {
    try {
      const commodity = commodities.find((c) => c.id === commodityId);
      if (!commodity) throw new Error('Commodity no encontrado');

      const totalValueKYD = units * commodity.priceInKyd;

      const { data: accData, error: accErr } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .single();
      if (accErr || !accData) throw new Error('Cuenta no encontrada');

      const account = accData as any;
      const currentBalance = Number(account.balance_pdh);

      // Price is in PDH; convert to the account's currency
      await loadExchangeRates();
      const valueInAccountCurrency = convertCurrency(totalValueKYD, 'PDH', accountCurrency);

      if (currentBalance < valueInAccountCurrency) {
        throw new Error('Saldo insuficiente para comprar este commodity');
      }

      // Deduct from account (balance is stored in the account's currency)
      const { error: upErr } = await supabase
        .from('accounts')
        .update({ balance_pdh: currentBalance - valueInAccountCurrency })
        .eq('id', accountId);
      if (upErr) throw upErr;

      // Create deposit record (stored in PDH for historical reference)
      const { error: depErr } = await supabase
        .from('commodity_deposits')
        .insert({
          account_id: accountId,
          commodity_id: commodityId,
          units,
          price_at_deposit: commodity.priceInKyd,
          currency_at_deposit: accountCurrency,
          total_value_at_deposit: totalValueKYD,
          status: 'active',
        });
      if (depErr) throw depErr;

      // Record transaction in account currency
      await supabase
        .from('transactions')
        .insert({
          id: crypto.randomUUID(),
          transaction_type: 'commodity_purchase',
          from_account_id: accountId,
          from_account_number: account.account_number,
          amount: valueInAccountCurrency,
          currency: accountCurrency,
          description: `Compra de ${units} ${commodity.code} a ${commodity.priceInKyd.toFixed(2)} PDH c/u`,
        });

      await loadAll();
      toast({ title: 'Compra exitosa', description: `${units} ${commodity.code} comprados. -${valueInAccountCurrency.toFixed(2)} ${accountCurrency}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }

  async function liquidateDeposit(depositId: string) {
    try {
      const deposit = deposits.find((d) => d.id === depositId);
      if (!deposit) throw new Error('Depósito no encontrado');

      const commodity = commodities.find((c) => c.id === deposit.commodityId);
      if (!commodity) throw new Error('Commodity no encontrado');

      const currentValue = deposit.units * commodity.priceInKyd;

      // Get account
      const { data: accData, error: accErr } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', deposit.accountId)
        .single();
      if (accErr || !accData) throw new Error('Cuenta no encontrada');

      const account = accData as any;
      const currentBalance = Number(account.balance_pdh);
      const accountCurrency = account.currency || 'PDH';

      // Convert PDH value to the account's currency
      await loadExchangeRates();
      const valueInAccountCurrency = convertCurrency(currentValue, 'PDH', accountCurrency);

      // Add current value to account (in account's currency)
      const { error: upErr } = await supabase
        .from('accounts')
        .update({ balance_pdh: currentBalance + valueInAccountCurrency })
        .eq('id', deposit.accountId);
      if (upErr) throw upErr;

      // Update deposit status
      const { error: depErr } = await supabase
        .from('commodity_deposits')
        .update({ status: 'liquidated' })
        .eq('id', depositId);
      if (depErr) throw depErr;

      // Record transaction
      const { error: txErr } = await supabase
        .from('transactions')
        .insert({
          id: crypto.randomUUID(),
          transaction_type: 'commodity_sale',
          to_account_id: deposit.accountId,
          to_account_number: account.account_number,
          amount: valueInAccountCurrency,
          currency: accountCurrency,
          description: `Venta de ${deposit.units} ${commodity.code} a ${commodity.priceInKyd.toFixed(2)} PDH c/u (Comprado a ${deposit.priceAtDeposit.toFixed(2)} KYD)`,
        });

      const profit = currentValue - deposit.totalValueAtDeposit;
      const profitText = profit >= 0 ? `Ganancia: ${profit.toFixed(2)} PDH` : `Pérdida: ${Math.abs(profit).toFixed(2)} PDH`;

      await loadAll();
      toast({ title: 'Commodity liquidado', description: `${deposit.units} ${commodity.code} vendidos. ${profitText}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }

  // Enrich deposits with commodity info
  const enrichedDeposits = deposits.map((d) => ({
    ...d,
    commodity: commodities.find((c) => c.id === d.commodityId),
  }));

  return {
    commodities,
    deposits: enrichedDeposits,
    loading,
    syncPrices,
    updatePrice,
    depositCommodity,
    buyCommodity,
    liquidateDeposit,
    reload: loadAll,
  };
}
