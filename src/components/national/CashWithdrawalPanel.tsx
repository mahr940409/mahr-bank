import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { formatNumber } from '@/lib/currencyUtils';
import { toast } from '@/hooks/use-toast';
const NOTES_PER_BUNDLE = 16;
const BUNDLES_PER_BOX = 432 / NOTES_PER_BUNDLE;

const rowsQuery = 'id, value, boxes_printed, bundles_withdrawn';

export function CashWithdrawalPanel({ bank, onChanged }: { bank: any; onChanged: () => Promise<void> | void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [bundles, setBundles] = useState<Record<string, number>>({});

  const load = async () => {
    const { data } = await supabase.from('banknote_denominations' as any).select(rowsQuery).eq('national_bank_id', bank.id).order('value');
    setRows((data || []).map((row: any) => ({ ...row, value: Number(row.value), bundles_withdrawn: Number(row.bundles_withdrawn || 0) })));
  };
  useEffect(() => { load(); }, [bank.id]);

  const withdraw = async (row: any) => {
    const count = Math.floor(bundles[row.id] || 0);
    const available = row.boxes_printed * BUNDLES_PER_BOX - row.bundles_withdrawn;
    const amount = count * NOTES_PER_BUNDLE * row.value;
    if (count <= 0 || count > available) return toast({ title: 'Fajos inválidos', description: `Disponibles: ${available}.`, variant: 'destructive' });
    const { data: treasury } = await supabase.from('national_bank_accounts').select('id, balance_real').eq('national_bank_id', bank.id).eq('account_type', 'bank_treasury').maybeSingle();
    if (!treasury || Number(treasury.balance_real) < amount) return toast({ title: 'Fondos insuficientes', description: 'La cuenta propia no tiene efectivo suficiente.', variant: 'destructive' });
    const { error } = await supabase.from('banknote_denominations' as any).update({ bundles_withdrawn: row.bundles_withdrawn + count } as any).eq('id', row.id);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    await supabase.from('national_bank_accounts').update({ balance_real: Number(treasury.balance_real) - amount } as any).eq('id', treasury.id);
    toast({ title: 'Efectivo retirado', description: `${count} fajos × ${NOTES_PER_BUNDLE} billetes de ${formatNumber(row.value)} = ${formatNumber(amount)} ${bank.metrics.currency_iso}` });
    setBundles((current) => ({ ...current, [row.id]: 0 }));
    await load();
    await onChanged();
  };

  const selectedRows = rows.filter((row) => Math.floor(bundles[row.id] || 0) > 0);
  const withdrawSelected = async () => {
    if (selectedRows.length === 0) return toast({ title: 'Sin fajos seleccionados', description: 'Indica fajos en al menos una denominación.', variant: 'destructive' });
    for (const row of selectedRows) await withdraw(row);
  };

  return <Card><CardHeader><CardTitle>Retiro de efectivo por fajos</CardTitle><CardDescription>Cada fajo contiene {NOTES_PER_BUNDLE} billetes. El retiro se descuenta de la cuenta propia del Banco Nacional.</CardDescription></CardHeader><CardContent className="space-y-3">
    {rows.map((row) => { const available = row.boxes_printed * BUNDLES_PER_BOX - row.bundles_withdrawn; return <div key={row.id} className="flex flex-wrap items-end gap-3 border-b pb-3"><div className="min-w-[180px] flex-1"><p className="font-medium">{formatNumber(row.value)} {bank.metrics.currency_iso}</p><p className="text-xs text-muted-foreground">{available} fajos disponibles</p></div><div className="w-40"><NumberInput value={bundles[row.id] ? String(bundles[row.id]) : ''} onChange={(value) => setBundles((current) => ({ ...current, [row.id]: Number(value) || 0 }))} placeholder="Fajos" /></div><Button onClick={() => withdraw(row)}>Retirar fajos</Button></div>; })}
    {rows.length === 0 && <p className="text-sm text-muted-foreground">No hay denominaciones registradas.</p>}
    {rows.length > 0 && <div className="flex justify-end border-t pt-4"><Button onClick={withdrawSelected} disabled={selectedRows.length === 0}>Retirar seleccionados</Button></div>}
  </CardContent></Card>;
}
