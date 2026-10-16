import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber } from "@/lib/currencyUtils";

export default function Calculator() {
  const [rates, setRates] = useState<Record<string, number>>({ PDH: 1 });
  const [amount, setAmount] = useState("1000");
  const [from, setFrom] = useState("PDH");
  const [to, setTo] = useState("KYD");

  useEffect(() => {
    supabase.from('currencies').select('*').then(({ data }) => {
      if (!data) return;
      const next: Record<string, number> = { PDH: 1 };
      (data as any[]).forEach((currency) => {
        const circulation = Math.max(0, Number(currency.printed_amount || 0) - Number(currency.burned_amount || 0));
        const initial = Number(currency.initial_units_per_pdh || 0);
        next[currency.iso_symbol] = circulation > 0
          ? Math.max(0, Number(currency.pdh_reserves || 0)) / circulation
          : (initial > 0 ? 1 / initial : Number(currency.exchange_rate_to_pdh || 1));
      });
      setRates(next);
    });
  }, []);

  const currencies = useMemo(() => Object.keys(rates).sort(), [rates]);
  const parsed = useMemo(() => {
    const n = Number(amount.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }, [amount]);
  const result = useMemo(() => {
    const fromRate = rates[from] ?? 1;
    const toRate = rates[to] ?? 1;
    return from === to ? parsed : (parsed * fromRate) / toRate;
  }, [parsed, from, to, rates]);
  const rate = (rates[from] ?? 1) / (rates[to] ?? 1);
  const formatRate = (value: number) => value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 8 });

  const CurSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-[200px]">
        {currencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="max-w-xl mx-auto">
      <Card>
        <CardHeader><CardTitle className="font-serif">Calculadora de saldos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Monto</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono text-lg" inputMode="decimal" />
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <div className="space-y-1.5"><Label>De</Label><CurSelect value={from} onChange={setFrom} /></div>
            <Button variant="outline" size="icon" className="rounded-full" onClick={() => { setFrom(to); setTo(from); }} aria-label="Invertir">
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
            <div className="space-y-1.5"><Label>A</Label><CurSelect value={to} onChange={setTo} /></div>
          </div>
          <div className="rounded-md border bg-muted/40 p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Resultado</div>
            <div className="font-mono text-2xl font-bold break-all">{formatNumber(result)} {to}</div>
            <div className="text-xs text-muted-foreground mt-2">1 {from} = {formatRate(rate)} {to}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
