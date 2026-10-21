import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { FileText, Plus, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { issueCheque, issuePromissoryNote, presentPersonalCheque, presentBankCheque, cancelCheque, payPromissoryNote } from '@/lib/negotiableOperations';
import { useBankData } from '@/hooks/useBankData';
import { formatNumber } from '@/lib/currencyUtils';
import { toast } from '@/hooks/use-toast';

const statusLabel: Record<string, string> = { issued: 'Emitido', presented: 'Presentado', paid: 'Pagado', rejected: 'Rechazado', cancelled: 'Cancelado', accepted: 'Aceptado', defaulted: 'Incumplido' };

export default function Negotiables() {
  const { accounts } = useBankData();
  const [cheques, setCheques] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('PDH');
  const [memo, setMemo] = useState('');
  const [noteRate, setNoteRate] = useState('0');
  const [dueAt, setDueAt] = useState('');

  const load = useCallback(async () => {
    const [{ data: chequeRows }, { data: noteRows }] = await Promise.all([
      supabase.from('cheques' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('promissory_notes' as any).select('*').order('created_at', { ascending: false }),
    ]);
    setCheques((chequeRows as any[]) || []);
    setNotes((noteRows as any[]) || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const issuePersonal = async () => {
    try {
      await issueCheque({ chequeType: 'personal', issuerAccountId: accountId, payeeName: payee, currencyIso: currency, amount: Number(amount), memo });
      toast({ title: 'Cheque emitido', description: 'El cheque personal no congela saldo hasta su presentación.' });
      setPayee(''); setAmount(''); setMemo(''); await load();
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const issueBank = async () => {
    try {
      await issueCheque({
        chequeType: 'bank',
        issuerAccountId: 'bank-main',
        issuerBankType: 'mahr',
        issuerBankId: 'mahr-bank',
        payeeName: payee,
        currencyIso: 'PDH',
        amount: Number(amount),
        memo,
      });
      toast({ title: 'Cheque bancario emitido', description: 'El importe quedó congelado en la cuenta operativa MAHR.' });
      setPayee(''); setAmount(''); setMemo(''); await load();
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const issueNote = async () => {
    try {
      await issuePromissoryNote({ issuerAccountId: accountId, beneficiaryName: payee, currencyIso: currency, principal: Number(amount), interestRate: Number(noteRate) / 100, dueAt: dueAt || undefined, memo });
      toast({ title: 'Pagaré emitido' });
      setPayee(''); setAmount(''); setMemo(''); setDueAt(''); await load();
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const present = async (id: string) => {
    try {
      const cheque = cheques.find(c => c.id === id);
      if (cheque?.cheque_type === 'bank') await presentBankCheque(id);
      else await presentPersonalCheque(id, 'mahr-bank');
      toast({ title: 'Cheque pagado' }); await load();
    }
    catch (e: any) { toast({ title: 'Cheque rechazado', description: e.message, variant: 'destructive' }); await load(); }
  };

  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold tracking-tight">Cheques y pagarés</h1><p className="text-muted-foreground">Obligaciones negociables y documentos de pago del banco.</p></div>
    <Card><CardHeader><CardTitle><Plus className="mr-2 inline h-4 w-4" />Emitir documento</CardTitle><CardDescription>Los cheques personales se cobran únicamente contra su banco emisor. El pagaré representa una obligación futura.</CardDescription></CardHeader><CardContent>
      <Tabs defaultValue="cheque"><TabsList><TabsTrigger value="cheque">Cheque personal</TabsTrigger><TabsTrigger value="bank-cheque">Cheque bancario MAHR</TabsTrigger><TabsTrigger value="note">Pagaré</TabsTrigger></TabsList>
        <div className="grid gap-3 pt-4 md:grid-cols-2">
          <div><Label>Cuenta emisora</Label><Select value={accountId} onValueChange={setAccountId}><SelectTrigger><SelectValue placeholder="Selecciona cuenta" /></SelectTrigger><SelectContent>{accounts.filter(a => a.id !== 'bank-main').map(a => <SelectItem key={a.id} value={a.id}>{a.userName} · {a.accountNumber}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Beneficiario</Label><Input value={payee} onChange={e => setPayee(e.target.value)} placeholder="Nombre del beneficiario" /></div>
          <div><Label>Monto</Label><Input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><Label>Moneda</Label><Input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} /></div>
          <TabsContent value="note" className="contents"><div><Label>Interés (%)</Label><Input type="number" min="0" value={noteRate} onChange={e => setNoteRate(e.target.value)} /></div><div><Label>Vencimiento</Label><Input type="date" value={dueAt} onChange={e => setDueAt(e.target.value)} /></div></TabsContent>
          <div className="md:col-span-2"><Label>Concepto</Label><Textarea value={memo} onChange={e => setMemo(e.target.value)} /></div>
        </div>
        <TabsContent value="cheque"><Button className="mt-4" disabled={!accountId || !payee || Number(amount) <= 0} onClick={issuePersonal}><FileText className="mr-2 h-4 w-4" />Emitir cheque</Button></TabsContent>
        <TabsContent value="bank-cheque" className="space-y-2"><p className="text-sm text-muted-foreground">Se emite en PDH contra la cuenta operativa del MAHR Bank y congela el importe hasta su cobro o cancelación.</p><Button className="mt-2" disabled={!payee || Number(amount) <= 0} onClick={issueBank}><FileText className="mr-2 h-4 w-4" />Emitir cheque bancario</Button></TabsContent>
        <TabsContent value="note"><Button className="mt-4" disabled={!accountId || !payee || Number(amount) <= 0} onClick={issueNote}><FileText className="mr-2 h-4 w-4" />Emitir pagaré</Button></TabsContent>
      </Tabs>
    </CardContent></Card>
    <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>Cheques</CardTitle></CardHeader><CardContent className="space-y-3">{cheques.length === 0 && <p className="text-sm text-muted-foreground">No hay cheques.</p>}{cheques.map(c => <div key={c.id} className="rounded border p-3"><div className="flex justify-between"><span className="font-medium">{c.cheque_number}</span><Badge>{statusLabel[c.status] || c.status}</Badge></div><p className="text-sm">{c.payee_name} · {formatNumber(Number(c.amount))} {c.currency_iso}</p><div className="mt-2 flex gap-2">{c.status === 'issued' && <><Button size="sm" onClick={() => present(c.id)}><CheckCircle className="mr-1 h-3 w-3" />Presentar</Button><Button size="sm" variant="outline" onClick={async () => { await cancelCheque(c.id); await load(); }}><XCircle className="mr-1 h-3 w-3" />Cancelar</Button></>}</div></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Pagarés</CardTitle></CardHeader><CardContent className="space-y-3">{notes.length === 0 && <p className="text-sm text-muted-foreground">No hay pagarés.</p>}{notes.map(n => <div key={n.id} className="rounded border p-3"><div className="flex justify-between"><span className="font-medium">{n.note_number}</span><Badge>{statusLabel[n.status] || n.status}</Badge></div><p className="text-sm">{n.beneficiary_name} · Pendiente {formatNumber(Number(n.outstanding))} {n.currency_iso}</p><p className="text-xs text-muted-foreground">Interés: {(Number(n.interest_rate) * 100).toFixed(2)}%{n.due_at ? ` · Vence ${new Date(n.due_at).toLocaleDateString('es-CO')}` : ''}</p>{['issued', 'accepted'].includes(n.status) && <Button size="sm" className="mt-2" onClick={async () => { try { await payPromissoryNote(n.id); toast({ title: 'Pagaré pagado' }); await load(); } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); } }}>Pagar pagaré</Button>}</div>)}</CardContent></Card></div>
  </div>;
}
