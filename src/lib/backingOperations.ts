import { supabase } from '@/integrations/supabase/client';

export type BankType = 'national' | 'private';

export interface BackingRow {
  id: string;
  bank_type: BankType;
  bank_id: string;
  currency_iso: string;
  amount: number;
  frozen: number;
}

export interface BackingLine extends BackingRow {
  rate_to_pdh: number;
  value_pdh: number;
  available: number;
  available_pdh: number;
  frozen_pdh: number;
}

const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

/** Rate 1 unit -> PDH. PDH is always 1 (the only fixed value). */
export async function getRateToPdh(iso: string): Promise<number> {
  if (iso === 'PDH') return 1;
  const { data } = await supabase.from('currencies').select('exchange_rate_to_pdh').eq('iso_symbol', iso).maybeSingle();
  const r = Number((data as any)?.exchange_rate_to_pdh);
  if (!r || r <= 0) throw new Error(`La moneda ${iso} no tiene valor definido.`);
  return r;
}

export async function getBackings(type: BankType, bankId: string): Promise<BackingRow[]> {
  const { data, error } = await supabase.from('bank_backings' as any).select('*').eq('bank_type', type).eq('bank_id', bankId);
  if (error) throw error;
  return ((data as any[]) || []).map((r) => ({ ...r, amount: num(r.amount), frozen: num(r.frozen) }));
}

export async function getAllBackings(type: BankType): Promise<BackingRow[]> {
  const { data } = await supabase.from('bank_backings' as any).select('*').eq('bank_type', type);
  return ((data as any[]) || []).map((r) => ({ ...r, amount: num(r.amount), frozen: num(r.frozen) }));
}

/** Add deltas (in units of the backing currency) to a bank's backing line. */
export async function adjustBacking(type: BankType, bankId: string, iso: string, deltaAmount: number, deltaFrozen = 0): Promise<void> {
  const { data } = await supabase.from('bank_backings' as any).select('*')
    .eq('bank_type', type).eq('bank_id', bankId).eq('currency_iso', iso).maybeSingle();
  const row: any = data;
  if (!row) {
    if (deltaAmount < 0 || deltaFrozen < 0) throw new Error(`No hay respaldo en ${iso}.`);
    const { error } = await supabase.from('bank_backings' as any).insert({
      bank_type: type, bank_id: bankId, currency_iso: iso, amount: deltaAmount, frozen: deltaFrozen,
    } as any);
    if (error) throw error;
    return;
  }
  const amount = num(row.amount) + deltaAmount;
  const frozen = Math.max(0, num(row.frozen) + deltaFrozen);
  if (amount < -1e-9) throw new Error(`Respaldo ${iso} insuficiente.`);
  const { error } = await supabase.from('bank_backings' as any).update({ amount: Math.max(0, amount), frozen } as any).eq('id', row.id);
  if (error) throw error;
}

/** Units of `iso` needed to cover `pdh` value; validates availability (not frozen). */
export async function requireBackingFor(type: BankType, bankId: string, iso: string, pdh: number): Promise<{ units: number; rate: number }> {
  const rate = await getRateToPdh(iso);
  const units = pdh / rate;
  const rows = await getBackings(type, bankId);
  const row = rows.find((r) => r.currency_iso === iso);
  const available = row ? row.amount - row.frozen : 0;
  if (available + 1e-9 < units) {
    throw new Error(`Respaldo ${iso} disponible insuficiente. Requerido: ${units.toFixed(2)} ${iso} (≈ ${pdh.toFixed(2)} PDH). Disponible: ${available.toFixed(2)} ${iso}.`);
  }
  return { units, rate };
}

export function enrichBackings(rows: BackingRow[], rates: Record<string, number>): BackingLine[] {
  return rows
    .map((r) => {
      const rate = r.currency_iso === 'PDH' ? 1 : (rates[r.currency_iso] || 0);
      const available = Math.max(0, r.amount - r.frozen);
      return {
        ...r,
        rate_to_pdh: rate,
        value_pdh: r.amount * rate,
        available,
        available_pdh: available * rate,
        frozen_pdh: r.frozen * rate,
      };
    })
    .sort((a, b) => a.currency_iso.localeCompare(b.currency_iso));
}

export function backingTotals(lines: BackingLine[]) {
  const total = lines.reduce((s, l) => s + l.value_pdh, 0);
  const frozen = lines.reduce((s, l) => s + l.frozen_pdh, 0);
  return { total, frozen, available: Math.max(0, total - frozen) };
}

/** Total available (not frozen) backing value in PDH at current rates. */
export async function availableBackingPdh(type: BankType, bankId: string): Promise<number> {
  const rows = await getBackings(type, bankId);
  let total = 0;
  for (const r of rows) {
    const avail = r.amount - r.frozen;
    if (avail <= 0) continue;
    try { total += avail * (await getRateToPdh(r.currency_iso)); } catch { /* currency without value */ }
  }
  return total;
}

/**
 * Spend `pdh` worth of available backing: PDH first, then other currencies alphabetically.
 * Throws if the total available value is not enough.
 */
export async function spendBackingPdh(type: BankType, bankId: string, pdh: number): Promise<void> {
  if (pdh <= 0) return;
  const avail = await availableBackingPdh(type, bankId);
  if (avail + 1e-9 < pdh) throw new Error(`Respaldo insuficiente. Requerido: ${pdh.toFixed(2)} PDH-eq. Disponible: ${avail.toFixed(2)} PDH-eq.`);
  const rows = (await getBackings(type, bankId)).sort((a, b) =>
    a.currency_iso === 'PDH' ? -1 : b.currency_iso === 'PDH' ? 1 : a.currency_iso.localeCompare(b.currency_iso));
  let rem = pdh;
  for (const r of rows) {
    if (rem <= 1e-9) break;
    const free = r.amount - r.frozen;
    if (free <= 0) continue;
    let rate = 0;
    try { rate = await getRateToPdh(r.currency_iso); } catch { continue; }
    const units = Math.min(free, rem / rate);
    await adjustBacking(type, bankId, r.currency_iso, -units);
    rem -= units * rate;
  }
}
