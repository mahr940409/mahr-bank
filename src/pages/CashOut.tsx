import { useEffect, useState } from "react";
import { Banknote } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { loadExchangeRates, convertToPDH, formatNumber } from "@/lib/currencyUtils";

type Row = { currency: string; out: number; back: number; mahr: number; national: number; priv: number };

export default function CashOut() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    await loadExchangeRates();
    const [m, n, p] = await Promise.all([
      supabase.from("transactions").select("transaction_type, amount, currency").in("transaction_type", ["withdrawal", "deposit"]),
      supabase.from("national_bank_transactions").select("transaction_type, amount_local, currency_local").in("transaction_type", ["national_withdrawal", "national_deposit"]),
      supabase.from("private_bank_transactions" as any).select("type, amount, currency_iso").in("type", ["withdrawal", "deposit"]),
    ]);
    const map: Record<string, Row> = {};
    const add = (cur: string | null, amt: number, isOut: boolean, src: "mahr" | "national" | "priv") => {
      const c = cur || "PDH";
      map[c] ??= { currency: c, out: 0, back: 0, mahr: 0, national: 0, priv: 0 };
      const v = Number(amt) || 0;
      if (isOut) map[c].out += v; else map[c].back += v;
      map[c][src] += isOut ? v : -v;
    };
    (m.data || []).forEach((t: any) => add(t.currency, t.amount, t.transaction_type === "withdrawal", "mahr"));
    (n.data || []).forEach((t: any) => add(t.currency_local, t.amount_local, t.transaction_type === "national_withdrawal", "national"));
    ((p.data as any[]) || []).forEach((t: any) => add(t.currency_iso, t.amount, t.type === "withdrawal", "priv"));
    setRows(Object.values(map).sort((a, b) => a.currency.localeCompare(b.currency)));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const totalPdh = rows.reduce((s, r) => s + convertToPDH(r.out - r.back, r.currency), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl">Efectivo en la calle</h1>
          <p className="text-sm text-muted-foreground">Dinero que salió físicamente de todos los bancos (retiros) menos el que volvió (depósitos).</p>
        </div>
        <Button variant="outline" onClick={load}>Recargar</Button>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Banknote className="h-5 w-5" />Total equivalente</CardTitle></CardHeader>
        <CardContent><p className="text-3xl font-bold text-primary">{formatNumber(totalPdh)} PDH</p></CardContent>
      </Card>
      {loading ? <p className="text-muted-foreground">Cargando…</p> : rows.length === 0 ? (
        <p className="text-muted-foreground">Aún no ha salido efectivo de ningún banco.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(r => {
            const net = r.out - r.back;
            return (
              <Card key={r.currency}>
                <CardHeader className="pb-2"><CardTitle>{r.currency}</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p className="text-2xl font-bold">{formatNumber(net)} {r.currency}</p>
                  <p className="text-muted-foreground">≈ {formatNumber(convertToPDH(net, r.currency))} PDH</p>
                  <div className="border-t pt-2 mt-2 space-y-1 text-xs">
                    <div className="flex justify-between"><span>MAHR Bank</span><span>{formatNumber(r.mahr)}</span></div>
                    <div className="flex justify-between"><span>Bancos nacionales</span><span>{formatNumber(r.national)}</span></div>
                    <div className="flex justify-between"><span>Bancos privados</span><span>{formatNumber(r.priv)}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>Salió / volvió</span><span>{formatNumber(r.out)} / {formatNumber(r.back)}</span></div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
