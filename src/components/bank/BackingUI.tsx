import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/currencyUtils';
import type { BackingLine } from '@/lib/backingOperations';

/** Selector with every registered currency (alphabetical). `exclude` hides a currency (e.g. the bank's own). */
export function BackingCurrencySelect({ value, onChange, exclude }: { value: string; onChange: (v: string) => void; exclude?: string }) {
  const [list, setList] = useState<{ iso: string; rate: number }[]>([]);
  useEffect(() => {
    supabase.from('currencies').select('iso_symbol, exchange_rate_to_pdh').then(({ data }) => {
      setList(((data as any[]) || [])
        .filter((c) => c.iso_symbol && c.iso_symbol !== exclude)
        .map((c) => ({ iso: c.iso_symbol, rate: Number(c.exchange_rate_to_pdh) || 0 }))
        .sort((a, b) => a.iso.localeCompare(b.iso)));
    });
  }, [exclude]);
  return (
    <Select value={value || 'PDH'} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-[200px]">
        {(list.length ? list : [{ iso: 'PDH', rate: 1 }]).map((c) => (
          <SelectItem key={c.iso} value={c.iso}>
            {c.iso} {c.iso === 'PDH' ? '· fijo' : `· 1 = ${formatNumber(c.rate)} PDH`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Table with each backing currency, amount, frozen, and current PDH value. */
export function BackingTable({ lines, title = 'Respaldo', description }: { lines: BackingLine[]; title?: string; description?: string }) {
  const total = lines.reduce((s, l) => s + l.value_pdh, 0);
  const avail = lines.reduce((s, l) => s + l.available_pdh, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description ?? 'Valor actualizado en PDH según el valor de hoy de cada moneda. Solo el PDH tiene valor fijo.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground px-6 pb-6">Sin respaldo registrado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Moneda</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Congelado</TableHead>
                <TableHead className="text-right">1 unidad = PDH</TableHead>
                <TableHead className="text-right">Valor hoy (PDH)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Badge variant="outline">{l.currency_iso}</Badge>{' '}
                    <span className="text-xs text-muted-foreground">{l.currency_iso === 'PDH' ? 'fijo' : 'variable'}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(l.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(l.frozen)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(l.rate_to_pdh)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatNumber(l.value_pdh)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={4} className="font-semibold">Total (disponible: {formatNumber(avail)} PDH)</TableCell>
                <TableCell className="text-right tabular-nums font-bold">{formatNumber(total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
