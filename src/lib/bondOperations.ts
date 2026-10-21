import { supabase } from '@/integrations/supabase/client';
import { getRateToPdh } from '@/lib/backingOperations';

export interface StateBond {
  id: string;
  national_bank_id: string;
  name: string;
  description: string | null;
  denom_mode: 'local' | 'pdh' | 'kyd';
  denom_currency: string;
  unit_price: number;
  total_units: number;
  available_units: number;
  annual_rate: number;
  term_weeks: number;
  issued_at: string;
  status: 'active' | 'closed' | 'repurchased';
  created_at: string;
  updated_at: string;
}

export interface BondHolding {
  id: string;
  bond_id: string;
  account_id: string;
  units: number;
  principal_pdh: number;
  principal_denom: number;
  purchased_at: string;
  maturity_at: string;
  last_coupon_at: string;
  coupons_paid: number;
  total_interest_pdh: number;
  status: 'active' | 'matured' | 'repurchased';
}

const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };


// denom -> PDH equivalent
// For mode 'kyd' pass the KYD rate as rateToPdh (KYD is variable, not 1:1).
export function denomToPdh(amount: number, mode: 'local' | 'pdh' | 'kyd', rateToPdh: number): number {
  if (mode === 'pdh') return amount;
  return amount * (rateToPdh || 1);
}

export async function createBond(args: {
  nationalBankId: string;
  name: string;
  description?: string;
  denomMode: 'local' | 'pdh' | 'kyd';
  denomCurrency: string; // iso symbol if local, or 'PDH' / 'KYD'
  unitPrice: number;
  totalUnits: number;
  annualRate: number;
  termWeeks: number;
}): Promise<void> {
  if (args.unitPrice <= 0 || args.totalUnits <= 0 || args.termWeeks <= 0) {
    throw new Error('Valores inválidos.');
  }
  const { error } = await supabase.from('state_bonds').insert({
    national_bank_id: args.nationalBankId,
    name: args.name,
    description: args.description || null,
    denom_mode: args.denomMode,
    denom_currency: args.denomCurrency,
    unit_price: args.unitPrice,
    total_units: args.totalUnits,
    available_units: args.totalUnits,
    annual_rate: args.annualRate,
    term_weeks: args.termWeeks,
  } as any);
  if (error) throw error;
}

export async function setBondStatus(bondId: string, status: 'active' | 'closed' | 'repurchased'): Promise<void> {
  const { error } = await supabase.from('state_bonds').update({ status } as any).eq('id', bondId);
  if (error) throw error;
}

export async function deleteBond(bondId: string): Promise<void> {
  const { data: holdings } = await supabase.from('bond_holdings')
    .select('id').eq('bond_id', bondId).neq('status', 'matured').neq('status', 'repurchased');
  if (holdings && holdings.length > 0) {
    throw new Error('No se puede eliminar: hay inversores activos. Cierra o recompra primero.');
  }
  const { error } = await supabase.from('state_bonds').delete().eq('id', bondId);
  if (error) throw error;
}

/**
 * Buy bond units with a MAHR Bank account. Pays from balance_pdh (PDH equivalent).
 * Bank receives the payment as PDH backing (or KYD backing at the current KYD rate).
 */
export async function buyBond(args: {
  bondId: string;
  accountId: string;
  units: number;
  rateToPdh: number; // for local denom
}): Promise<void> {
  const { bondId, accountId, units, rateToPdh } = args;
  if (units <= 0) throw new Error('Cantidad inválida.');

  // Flujo nuevo: crear y liquidar una orden dentro de una función atómica.
  const { data: orderBond, error: orderBondError } = await supabase.from('state_bonds').select('*').eq('id', bondId).maybeSingle();
  if (orderBondError || !orderBond) throw new Error('Bono no encontrado.');
  if (orderBond.status !== 'active') throw new Error('Bono no disponible.');
  if (num(orderBond.available_units) < units) throw new Error('No hay suficientes unidades disponibles.');
  const orderPrincipalDenom = units * num(orderBond.unit_price);
  const orderKydRate = orderBond.denom_mode === 'kyd' ? await getRateToPdh('KYD') : 0;
  const orderPrincipalPdh = denomToPdh(orderPrincipalDenom, orderBond.denom_mode as any, orderBond.denom_mode === 'kyd' ? orderKydRate : rateToPdh);
  const { data: order, error: orderError } = await supabase.from('bond_purchase_orders' as any).insert({
    bond_id: bondId, account_id: accountId, units,
    unit_price: num(orderBond.unit_price), principal_denom: orderPrincipalDenom,
    principal_pdh: orderPrincipalPdh, fee_pdh: 0, status: 'pending',
  } as any).select('id').single();
  if (orderError || !order) throw orderError || new Error('No se pudo crear la orden.');
  const { error: settleError } = await supabase.rpc('settle_bond_purchase_order' as any, { p_order_id: order.id } as any);
  if (settleError) throw settleError;
}

export async function publishBondForSale(args: { holdingId: string; sellerAccountId: string; units: number; askPricePdh: number }): Promise<void> {
  if (args.units <= 0 || args.askPricePdh <= 0) throw new Error('Unidades y precio inválidos.');
  const { data: holding } = await supabase.from('bond_holdings').select('*').eq('id', args.holdingId).maybeSingle();
  if (!holding || holding.account_id !== args.sellerAccountId || holding.status !== 'active') throw new Error('Tenencia no disponible.');
  if (Number(holding.units) !== args.units) throw new Error('La venta debe incluir todas las unidades de la tenencia.');
  const { data: existingOrder } = await supabase.from('bond_market_orders' as any)
    .select('id').eq('holding_id', args.holdingId).eq('status', 'open').maybeSingle();
  if (existingOrder) throw new Error('Esta tenencia ya tiene una orden de venta abierta.');
  const { error } = await supabase.from('bond_market_orders' as any).insert({
    holding_id: args.holdingId, seller_account_id: args.sellerAccountId,
    units: args.units, ask_price_pdh: args.askPricePdh, status: 'open',
  } as any);
  if (error) throw error;
}

export async function executeBondMarketOrder(orderId: string, buyerAccountId: string): Promise<void> {
  const { error } = await supabase.rpc('execute_bond_market_order' as any, {
    p_order_id: orderId, p_buyer_account_id: buyerAccountId,
  } as any);
  if (error) throw error;
}

export async function cancelBondMarketOrder(orderId: string, sellerAccountId: string): Promise<void> {
  const { error } = await supabase.from('bond_market_orders' as any)
    .update({ status: 'cancelled' }).eq('id', orderId).eq('seller_account_id', sellerAccountId).eq('status', 'open');
  if (error) throw error;
}

export async function updateBondMarketOrderPrice(orderId: string, sellerAccountId: string, totalPricePdh: number, units: number): Promise<void> {
  if (totalPricePdh <= 0 || units <= 0) throw new Error('Precio inválido.');
  const { error } = await supabase.from('bond_market_orders' as any)
    .update({ ask_price_pdh: totalPricePdh / units }).eq('id', orderId).eq('seller_account_id', sellerAccountId).eq('status', 'open');
  if (error) throw error;
}

/**
 * Process all due weekly coupons for active holdings. Bank pays from its backing (any currency, current value).
 * If reserve is empty, coupon is skipped (accrues).
 */
export async function processCoupons(nationalBankId?: string): Promise<{ paid: number; total: number }> {
  let q = supabase.from('bond_holdings').select('*, state_bonds!inner(*)').eq('status', 'active');
  if (nationalBankId) q = q.eq('state_bonds.national_bank_id', nationalBankId);
  const { data: holdings } = await q;
  if (!holdings) return { paid: 0, total: 0 };
  let paid = 0;
  let totalPdh = 0;
  for (const h of holdings as any[]) {
    const { data, error } = await supabase.rpc('process_bond_coupon_atomic' as any, { p_holding_id: h.id } as any);
    if (error) throw error;
    paid += Number((data as any)?.paid || 0);
    totalPdh += Number((data as any)?.total || 0);
  }

  return { paid, total: totalPdh };
}

/**
 * Bank repurchases (forces refund) a holding early. Returns principal + any due coupons.
 */
export async function repurchaseHolding(holdingId: string): Promise<void> {
  const { error } = await supabase.rpc('repurchase_bond_atomic' as any, { p_holding_id: holdingId } as any);
  if (error) throw error;
}
