import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Landmark, Plus, ShieldCheck } from 'lucide-react';

export default function MonetaryAuthorities() {
  const [authorities, setAuthorities] = useState<any[]>([]);
  const [currencies, setCurrencies] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('regional_central_bank');
  const [currencyId, setCurrencyId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: a }, { data: c }] = await Promise.all([
      supabase.from('monetary_authorities' as any).select('*').order('name'),
      supabase.from('currencies').select('id, name, iso_symbol, issuer_authority_id').order('name'),
    ]);
    setAuthorities((a as any[]) || []);
    setCurrencies((c as any[]) || []);
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('monetary_authorities' as any)
        .insert({ name: name.trim(), authority_type: type }).select('id').single();
      if (error) throw error;
      if (currencyId) {
        const { error: currencyError } = await supabase.from('currencies').update({ issuer_authority_id: (data as any).id } as any).eq('id', currencyId);
        if (currencyError) throw currencyError;
      }
      setName(''); setCurrencyId(''); await load();
      toast({ title: 'Autoridad creada', description: 'La autoridad monetaria quedó registrada sin crear ningún país.' });
    } catch (error: any) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const assignCurrency = async (authorityId: string, value: string) => {
    const { error } = await supabase.from('currencies').update({ issuer_authority_id: value === 'none' ? null : authorityId } as any).eq('id', value);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' }); else await load();
  };

  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold tracking-tight">Autoridades monetarias</h1><p className="text-muted-foreground">Bancos centrales que emiten monedas compartidas, separados de los países.</p></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" />Nueva autoridad emisora</CardTitle><CardDescription>Crea primero la autoridad. Luego puedes vincularle una moneda existente.</CardDescription></CardHeader><CardContent><form onSubmit={create} className="grid gap-4 md:grid-cols-4 items-end">
      <div className="space-y-2 md:col-span-2"><Label>Nombre</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del banco central" /></div>
      <div className="space-y-2"><Label>Tipo de autoridad</Label><Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="regional_central_bank">Regional</SelectItem><SelectItem value="supranational_central_bank">Supranacional</SelectItem></SelectContent></Select></div>
      <div className="space-y-2"><Label>Moneda emisora (opcional)</Label><Select value={currencyId} onValueChange={setCurrencyId}><SelectTrigger><SelectValue placeholder="Vincular después" /></SelectTrigger><SelectContent>{currencies.filter(c => !c.issuer_authority_id).map(c => <SelectItem key={c.id} value={c.id}>{c.iso_symbol} · {c.name}</SelectItem>)}</SelectContent></Select></div>
      <Button type="submit" disabled={busy || !name.trim()} className="md:col-span-4 w-fit">Crear autoridad</Button>
    </form></CardContent></Card>
    <Card><CardHeader><CardTitle>Autoridades registradas</CardTitle><CardDescription>Solo la autoridad asignada a una moneda puede imprimirla.</CardDescription></CardHeader><CardContent className="space-y-3">{authorities.length === 0 ? <p className="text-sm text-muted-foreground">No hay autoridades registradas.</p> : authorities.map(a => { const issued = currencies.filter(c => c.issuer_authority_id === a.id); return <div key={a.id} className="rounded-lg border p-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Landmark className="h-5 w-5 text-primary" /><div><p className="font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{a.authority_type}</p></div></div><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" />{issued.length ? issued.map(c => <Badge key={c.id}>{c.iso_symbol}</Badge>) : <span className="text-sm text-muted-foreground">Sin moneda asignada</span>}</div></div>; })}</CardContent></Card>
  </div>;
}
