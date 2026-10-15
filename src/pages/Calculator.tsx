import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadExchangeRates, convertCurrency, formatNumber } from "@/lib/currencyUtils";

export default function Calculator() {
  const [rates, setRates] = useState<Record<string, number>>({});
  const [amount, setAmount] = useState("1000");
  const [from, setFrom] = useState("PDH");
  const [to, setTo] = useState("KYD");

  useEffect(() => {
    loadExchangeRates().then(setRates);
  }, []);

  const currencies = useMemo(() => Object.keys(rates).sort(), [rates]);
  const parsed = useMemo(() => {
    const n = Number(amount.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }, [amount]);
  const result = useMemo(() => convertCurrency(parsed, from, to), [parsed, from, to, rates]);

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
            <div className="text-xs text-muted-foreground mt-2">1 {from} = {formatNumber(convertCurrency(1, from, to))} {to}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
