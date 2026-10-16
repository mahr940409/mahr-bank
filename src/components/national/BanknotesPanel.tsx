import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Plus, Printer, Trash2 } from 'lucide-react';
import { formatNumber } from '@/lib/currencyUtils';

export const NOTES_PER_BOX = 432;
export const NOTES_PER_BUNDLE = 16;
export const BUNDLES_PER_BOX = NOTES_PER_BOX / NOTES_PER_BUNDLE;

type Denom = { id: string; value: number; boxes_printed: number; bundles_withdrawn: number };

export function BanknotesPanel({ bank, onChanged }: { bank: any; onChanged: () => Promise<void> | void }) {
  const [denoms, setDenoms] = useState<Denom[]>([]);
  const [newValue, setNewValue] = useState<number>(0);
  const [boxes, setBoxes] = useState<Record<string, number>>({});
  const [bundles, setBundles] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const iso = bank.metrics.currency_iso;
  const currencyId: string | undefined = bank.currency?.id ?? bank.country?.currency_id;

  const load = async () => {
    const { data } = await supabase
      .from('banknote_denominations' as any)
      .select('id, value, boxes_printed, bundles_withdrawn')
      .eq('national_bank_id', bank.id)
      .order('value');
    setDenoms(((data as any[]) || []).map((d) => ({ ...d, value: Number(d.value), bundles_withdrawn: Number(d.bundles_withdrawn || 0) })));
  };
  useEffect(() => { load(); }, [bank.id]);

  const addDenom = async () => {
    if (!(newValue > 0)) return toast({ title: 'Error', description: 'Escribe un valor mayor a 0.', variant: 'destructive' });
    if (denoms.some((d) => d.value === newValue)) return toast({ title: 'Error', description: 'Esa denominación ya existe.', variant: 'destructive' });
    const { error } = await supabase.from('banknote_denominations' as any).insert({ national_bank_id: bank.id, value: newValue } as any);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setNewValue(0);
    load();
  };

  const removeDenom = async (d: Denom) => {
    if (d.boxes_printed > 0) return toast({ title: 'No se puede eliminar', description: 'Ya se imprimieron billetes de esta denominación.', variant: 'destructive' });
    await supabase.from('banknote_denominations' as any).delete().eq('id', d.id);
    load();
  };

  const print = async (d: Denom, notify = true) => {
    const n = Math.floor(boxes[d.id] || 0);
    if (n <= 0) return toast({ title: 'Error', description: 'Indica cuántas cajas imprimir.', variant: 'destructive' });
    if (!currencyId) return toast({ title: 'Error', description: 'El país no tiene moneda asignada.', variant: 'destructive' });
    setBusy(true);
    try {
      const amount = d.value * NOTES_PER_BOX * n;
      const { error } = await supabase.rpc('print_banknote_boxes' as any, { p_bank_id: bank.id, p_denomination_id: d.id, p_boxes: n } as any);
      if (error) throw error;
      if (notify) toast({ title: 'Impresión realizada', description: `${n} caja(s) × ${NOTES_PER_BOX} billetes de ${formatNumber(d.value)} = ${formatNumber(amount)} ${iso}` });
      setBoxes((b) => ({ ...b, [d.id]: 0 }));
      await load();
      await onChanged();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const withdrawBundles = async (d: Denom) => {
    const count = Math.floor(bundles[d.id] || 0);
    const available = d.boxes_printed * BUNDLES_PER_BOX - d.bundles_withdrawn;
    if (count <= 0 || count > available) return toast({ title: 'Error', description: `Fajos disponibles: ${available}.`, variant: 'destructive' });
    const amount = count * NOTES_PER_BUNDLE * d.value;
    const { error } = await supabase.rpc('withdraw_banknote_bundles' as any, { p_bank_id: bank.id, p_denomination_id: d.id, p_bundles: count } as any);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Retiro de efectivo realizado', description: `${count} fajos × ${NOTES_PER_BUNDLE} billetes de ${formatNumber(d.value)} = ${formatNumber(amount)} ${iso}` });
    setBundles((b) => ({ ...b, [d.id]: 0 }));
    await load();
    await onChanged();
  };

  const totalPrinted = denoms.reduce((s, d) => s + d.value * NOTES_PER_BOX * d.boxes_printed, 0);
  const printAll = async () => {
    const pending = denoms.filter((d) => Math.floor(boxes[d.id] || 0) > 0);
    if (pending.length === 0) {
      toast({ title: 'Sin cajas pendientes', description: 'Indica un número mayor que 0 en al menos una denominación.', variant: 'destructive' });
      return;
    }
    try {
      for (const denomination of pending) await print(denomination, false);
      const total = pending.reduce((sum, d) => sum + Math.floor(boxes[d.id] || 0) * NOTES_PER_BOX * d.value, 0);
      toast({ title: 'Impresión realizada', description: `${pending.length} denominación(es), total ${formatNumber(total)} ${iso}.` });
    } catch (e: any) {
      toast({ title: 'Error en impresión', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billetes</CardTitle>
        <CardDescription>
          Se imprime siempre por cajas de {NOTES_PER_BOX} billetes. Solo el Banco Nacional emisor puede imprimir. El respaldo de emisión en Pepita de Hierro (PDH) es independiente del respaldo internacional.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2 max-w-sm">
          <div className="flex-1 space-y-1.5">
            <Label>Nueva denominación ({iso})</Label>
            <NumberInput value={newValue ? String(newValue) : ""} onChange={(v) => setNewValue(Number(v) || 0)} />
          </div>
          <Button onClick={addDenom}><Plus className="h-4 w-4 mr-1" />Agregar</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Valor de la moneda: respaldo de emisión en Pepita de Hierro (PDH) ÷ circulación impresa neta. La moneda digital no aumenta este total.
        </p>

        {denoms.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay denominaciones. Agrega la primera arriba.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Billete</TableHead>
                <TableHead className="text-right">Cajas impresas</TableHead>
                <TableHead className="text-right">Billetes</TableHead>
                <TableHead className="text-right">Valor impreso</TableHead>
                <TableHead>Cajas a imprimir</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {denoms.map((d) => {
                const n = Math.floor(boxes[d.id] || 0);
                const availableBundles = d.boxes_printed * BUNDLES_PER_BOX - d.bundles_withdrawn;
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{formatNumber(d.value)} {iso}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.boxes_printed}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(d.boxes_printed * NOTES_PER_BOX)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(d.value * NOTES_PER_BOX * d.boxes_printed)}</TableCell>
                    <TableCell className="min-w-[180px]">
                      <NumberInput value={boxes[d.id] ? String(boxes[d.id]) : ""} onChange={(v) => setBoxes((b) => ({ ...b, [d.id]: Number(v) || 0 }))} />
                      {n > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatNumber(n * NOTES_PER_BOX)} billetes = {formatNumber(n * NOTES_PER_BOX * d.value)} {iso}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" disabled={busy || n <= 0} onClick={() => print(d)}><Printer className="h-4 w-4 mr-1" />Imprimir</Button>
                      <Button size="icon" variant="ghost" onClick={() => removeDenom(d)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Total impreso en billetes: <span className="font-semibold text-foreground">{formatNumber(totalPrinted)} {iso}</span></p>
          <Button onClick={printAll} disabled={busy}><Printer className="h-4 w-4 mr-1" />Imprimir todos</Button>
        </div>
      </CardContent>
    </Card>
  );
}
