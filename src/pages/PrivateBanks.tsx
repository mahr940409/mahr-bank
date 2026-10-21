import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePrivateBanks, PrivateBankEnriched } from '@/hooks/usePrivateBanks';
import { useCountriesData } from '@/hooks/useCountriesData';
import { useNationalBanks } from '@/hooks/useNationalBanks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NumberInput } from '@/components/ui/number-input';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Building, ArrowLeft, Search } from 'lucide-react';
import { formatNumber } from '@/lib/currencyUtils';
import { GUARANTOR_KYD } from '@/lib/privateBankOperations';
import { BackingCurrencySelect, BackingTable } from '@/components/bank/BackingUI';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export default function PrivateBanks() {
  const pb = usePrivateBanks();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const selected = pb.banks.find(b => b.id === selectedId) || null;

  if (pb.loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (selected) return <BankDetail bank={selected} onBack={() => setSelectedId(null)} pb={pb} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bancos Privados</h1>
          <p className="text-muted-foreground">Bancos comerciales por país. Reserva mínima 10% (cualquier moneda, a su valor de hoy). Fiador 500.000 PDH.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> Crear Banco Privado</Button>
      </div>

      {pb.banks.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Aún no hay bancos privados.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pb.banks.map(b => (
            <Card key={b.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => setSelectedId(b.id)}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><Building className="h-5 w-5 text-primary" />{b.name}</CardTitle>
                  <Badge variant={b.status === 'active' ? 'default' : 'secondary'}>{b.status}</Badge>
                </div>
                <CardDescription>{b.country?.name || '—'} · {b.metrics.currency_iso}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Row label="Gestionado" value={`${formatNumber(b.metrics.total_client_local)} ${b.metrics.currency_iso}`} />
                <Row label="Reserva" value={`${formatNumber(b.metrics.reserves_pdh_eq)} PDH-eq (${(b.metrics.reserves_ratio * 100).toFixed(1)}%)`} />
                <Row label="Efectivo" value={`${formatNumber(Number((b as any).cash_on_hand || 0))} ${b.metrics.currency_iso}`} />
                <Row label="Cta. Principal" value={`${formatNumber(b.metrics.main_balance_local)} ${b.metrics.currency_iso}`} />
                <Row label="Fiador" value={b.guarantor_active ? `Congelado 500.000 PDH` : 'Liberado'} />
                {!b.metrics.reserves_ok && <div className="text-xs text-destructive">⚠ Reserva bajo 10%</div>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateBankDialog open={showCreate} onOpenChange={setShowCreate} onCreate={async (input) => {
        try { await pb.createBank(input); toast({ title: 'Banco privado creado' }); setShowCreate(false); }
        catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
      }} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between"><span className="text-muted-foreground">{label}</span><span className="font-medium tabular-nums">{value}</span></div>;
}

function Metric({ title, value, suffix, hint }: { title: string; value: string; suffix?: string; hint?: string }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="text-xl font-bold tabular-nums">{value} <span className="text-sm font-normal text-muted-foreground">{suffix}</span></div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </CardContent></Card>
  );
}

// ---------- Create dialog ----------
function CreateBankDialog({ open, onOpenChange, onCreate }: any) {
  const { countries } = useCountriesData();
  const { banks: nationalBanks } = useNationalBanks();
  const [mahrAccounts, setMahrAccounts] = useState<any[]>([]);
  const [mahrMain, setMahrMain] = useState<any | null>(null);
  const [name, setName] = useState('');
  const [countryId, setCountryId] = useState('');
  const [feeW, setFeeW] = useState('2');
  const [feeT, setFeeT] = useState('1');
  const [feeD, setFeeD] = useState('0');
  const [pdhRes, setPdhRes] = useState('0');
  const [kydRes, setKydRes] = useState('0');
  const [gSource, setGSource] = useState<'mahr' | 'national'>('mahr');
  const [gAccountId, setGAccountId] = useState('');

  const country = countries.find(c => c.id === countryId);
  const nationalBank = nationalBanks.find(b => b.country_id === countryId);
  const rateToPdh = Number(country?.currency?.exchange_rate_to_pdh ?? 1);
  const nationalAccounts = nationalBank?.accounts || [];

  // Load MAHR accounts (accounts table + bank-main) when dialog opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: accs }, { data: bm }] = await Promise.all([
        supabase.from('accounts').select('id, user_name, account_number, balance_pdh').order('user_name'),
        supabase.from('bank_main_account').select('id, account_number, balance_pdh').eq('id', 'bank-main').maybeSingle(),
      ]);
      setMahrAccounts(accs || []);
      setMahrMain(bm || null);
    })();
  }, [open]);

  const reset = () => { setName(''); setCountryId(''); setFeeW('2'); setFeeT('1'); setFeeD('0'); setPdhRes('0'); setKydRes('0'); setGSource('mahr'); setGAccountId(''); };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>

      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Banco Privado</DialogTitle>
          <DialogDescription>Se congelarán 500.000 PDH como fiador y se creará la cuenta principal.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Nombre</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Banco de los Andes" /></div>
          <div><Label>País</Label>
            <Select value={countryId} onValueChange={setCountryId}>
              <SelectTrigger><SelectValue placeholder="Selecciona país" /></SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.currency?.iso_symbol})</SelectItem>)}
              </SelectContent>
            </Select>
            {countryId && !nationalBank && <p className="text-xs text-destructive mt-1">Este país no tiene Banco Nacional. Créalo primero.</p>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Fee retiro %</Label><NumberInput value={feeW} onChange={setFeeW} /></div>
            <div><Label>Fee traspaso %</Label><NumberInput value={feeT} onChange={setFeeT} /></div>
            <div><Label>Fee depósito %</Label><NumberInput value={feeD} onChange={setFeeD} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Reserva inicial PDH</Label><NumberInput value={pdhRes} onChange={setPdhRes} /></div>
            <div><Label>Reserva inicial KYD</Label><NumberInput value={kydRes} onChange={setKydRes} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Las reservas se descuentan de MAHR Bank (bank-main).</p>
          <div>
            <Label>Origen del fiador (500.000 PDH)</Label>
            <Select value={gSource} onValueChange={(v: any) => { setGSource(v); setGAccountId(''); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mahr">MAHR Bank</SelectItem>
                <SelectItem value="national">Cuenta del Banco Nacional</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {gSource === 'mahr' && (
            <div>
              <Label>Cuenta fiadora (MAHR Bank)</Label>
              <Select value={gAccountId} onValueChange={setGAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecciona cuenta" /></SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {mahrMain && (
                    <SelectItem value="bank-main">
                      Cuenta Principal MAHR ({mahrMain.account_number}) · {formatNumber(Number(mahrMain.balance_pdh))} PDH
                    </SelectItem>
                  )}
                  {mahrAccounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.user_name} ({a.account_number}) · {formatNumber(Number(a.balance_pdh))} PDH
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Se congelarán 500.000 PDH de esta cuenta hasta que la cuenta principal del banco privado alcance el equivalente.</p>
            </div>
          )}
          {gSource === 'national' && (
            <div>
              <Label>Cuenta fiadora (Banco Nacional)</Label>
              <Select value={gAccountId} onValueChange={setGAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecciona cuenta" /></SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {nationalAccounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.holder_name} ({a.account_number}) · {formatNumber(Number(a.balance_real))} {country?.currency?.iso_symbol}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Se congelará el equivalente en la moneda local ({rateToPdh > 0 ? (GUARANTOR_KYD / rateToPdh).toFixed(2) : '—'} {country?.currency?.iso_symbol}).</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!name.trim() || !countryId || !nationalBank || !gAccountId}
            onClick={() => onCreate({
              name, countryId, nationalBankId: nationalBank?.id,
              feeWithdrawal: parseFloat(feeW) || 0, feeTransfer: parseFloat(feeT) || 0, feeDeposit: parseFloat(feeD) || 0,
              pdhReserve: parseFloat(pdhRes) || 0, kydReserve: parseFloat(kydRes) || 0,
              guarantorSource: gSource, guarantorSourceAccountId: gAccountId,
              rateToPdh,
            })}>Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Detail ----------
function BankDetail({ bank, onBack, pb }: { bank: PrivateBankEnriched; onBack: () => void; pb: ReturnType<typeof usePrivateBanks> }) {
  const { banks: nationalBanks } = useNationalBanks();
  const nationalBank = nationalBanks.find(b => b.id === bank.national_bank_id);
  const nationalAccounts = nationalBank?.accounts || [];
  const [search, setSearch] = useState('');
  const [openNew, setOpenNew] = useState(false);
  const [newHolder, setNewHolder] = useState('');
  const [openOp, setOpenOp] = useState<null | 'deposit' | 'withdraw' | 'transfer'>(null);
  const [prefillAccId, setPrefillAccId] = useState<string | null>(null);
  const [openReserve, setOpenReserve] = useState<null | 'add' | 'withdraw'>(null);
  const [confirmation, setConfirmation] = useState<{ title: string; description: string; onConfirm: () => Promise<void> } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? bank.accounts.filter(a => a.holder.toLowerCase().includes(q)) : bank.accounts;
    return [...list].sort((a, b) => (a.type === 'main' ? -1 : b.type === 'main' ? 1 : a.holder.localeCompare(b.holder)));
  }, [search, bank.accounts]);

  const iso = bank.metrics.currency_iso;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{bank.name}</h1>
            <p className="text-muted-foreground">{bank.country?.name} · {iso}</p>
          </div>
        </div>
        <Button variant="destructive" size="icon" onClick={() => setConfirmation({ title: 'Eliminar banco privado', description: 'Se devolverá el fiador si sigue congelado.', onConfirm: async () => { try { await pb.deleteBank(bank.id); onBack(); } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); } } })}><Trash2 className="h-4 w-4" /></Button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <Metric title="Total gestionado" value={formatNumber(bank.metrics.total_client_local)} suffix={iso} hint={`${formatNumber(bank.metrics.total_client_pdh)} PDH-eq`} />
        <Metric title="Reserva PDH+KYD" value={formatNumber(bank.metrics.reserves_pdh_eq)} suffix="PDH-eq" hint={`Requerido: ${formatNumber(bank.metrics.reserves_required)} (${(bank.metrics.reserves_ratio * 100).toFixed(1)}%)`} />
        <Metric title="Efectivo en bóveda" value={formatNumber(Number((bank as any).cash_on_hand || 0))} suffix={iso} hint="Dinero impreso físico disponible para retiros" />
        <Metric title="Cuenta principal" value={formatNumber(bank.metrics.main_balance_local)} suffix={iso} hint={`${formatNumber(bank.metrics.main_balance_kyd_eq)} PDH-eq`} />
        <Metric title="Fiador" value={bank.guarantor_active ? '500.000' : '0'} suffix="PDH congelados" hint={bank.guarantor_active ? `Origen: ${bank.guarantor_source_type}` : 'Liberado (cta. principal cubre)'} />
      </div>

      <CashVaultCard bank={bank} pb={pb} nationalAccounts={nationalAccounts} />


      {!bank.metrics.reserves_ok && (
        <Card className="border-destructive"><CardContent className="pt-6 text-sm text-destructive">
          ⚠ Reservas por debajo del 10%. Las operaciones que aumenten el total gestionado quedarán bloqueadas hasta que agregues reservas.
        </CardContent></Card>
      )}

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Cuentas</TabsTrigger>
          <TabsTrigger value="ops">Operaciones</TabsTrigger>
          <TabsTrigger value="reserves">Reservas</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar titular..." className="pl-8" />
            </div>
            <Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4 mr-1" /> Nueva Cuenta</Button>
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Titular</TableHead><TableHead>Número</TableHead><TableHead>Tipo</TableHead>
                <TableHead className="text-right">Real</TableHead><TableHead className="text-right">Simbólico</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sin cuentas</TableCell></TableRow>
                ) : filtered.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.holder}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{a.account_number}</TableCell>
                    <TableCell><Badge variant={a.type === 'main' ? 'default' : 'outline'}>{a.type}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(Number(a.balance_real))} {iso}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(Number(a.balance_symbolic))} {iso}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => { setPrefillAccId(a.id); setOpenOp('deposit'); }}>Depósito</Button>
                      <Button variant="ghost" size="sm" onClick={() => { setPrefillAccId(a.id); setOpenOp('withdraw'); }}>Retiro</Button>
                      <Button variant="ghost" size="sm" onClick={() => { setPrefillAccId(a.id); setOpenOp('transfer'); }}>Traspaso</Button>
                      {a.type !== 'main' && (
                        <Button variant="ghost" size="icon" onClick={() => setConfirmation({ title: 'Eliminar cuenta', description: 'La cuenta debe estar vacía y no ser la cuenta principal.', onConfirm: async () => { try { await pb.deleteAccount(a.id); } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); } } })}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ops">
          <Card><CardContent className="pt-6 flex gap-3 flex-wrap">
            <Button onClick={() => { setPrefillAccId(null); setOpenOp('deposit'); }}>Depósito</Button>
            <Button onClick={() => { setPrefillAccId(null); setOpenOp('withdraw'); }} variant="outline">Retiro</Button>
            <Button onClick={() => { setPrefillAccId(null); setOpenOp('transfer'); }}>Traspaso interno</Button>
          </CardContent></Card>
          <p className="text-xs text-muted-foreground mt-3">Comisiones actuales — Depósito: {bank.fee_deposit}% · Retiro: {bank.fee_withdrawal}% · Traspaso: {bank.fee_transfer}%. Se acreditan a la cuenta principal.</p>
        </TabsContent>

        <TabsContent value="reserves">
          <Card><CardHeader><CardTitle>Reservas</CardTitle><CardDescription>Mueve reservas en cualquier moneda registrada entre MAHR Bank y este banco privado.</CardDescription></CardHeader>
            <CardContent className="flex gap-3 flex-wrap">
              <Button onClick={() => setOpenReserve('add')}>Agregar reserva</Button>
              <Button variant="outline" onClick={() => setOpenReserve('withdraw')}>Retirar reserva</Button>
            </CardContent>
          </Card>
          <div className="mt-3"><BackingTable lines={bank.backings || []} title="Reservas actuales" /></div>
        </TabsContent>

        <TabsContent value="history">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Descripción</TableHead>
                <TableHead className="text-right">Monto</TableHead><TableHead className="text-right">Fee</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {pb.txs.filter(t => t.private_bank_id === bank.id).slice(0, 100).map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline">{t.type}</Badge></TableCell>
                    <TableCell className="text-xs">{t.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(Number(t.amount))} {t.currency_iso || ''}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(Number(t.fee))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* New account dialog */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva cuenta</DialogTitle></DialogHeader>
          <div><Label>Titular</Label><Input value={newHolder} onChange={e => setNewHolder(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button disabled={!newHolder.trim()} onClick={async () => {
              try { await pb.createAccount(bank.id, newHolder); setNewHolder(''); setOpenNew(false); }
              catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
            }}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reserve dialog */}
      <ReserveDialog mode={openReserve} onClose={() => setOpenReserve(null)} bank={bank} pb={pb} />

      {/* Op dialog */}
      <OpDialog mode={openOp} onClose={() => setOpenOp(null)} bank={bank} pb={pb} prefillAccId={prefillAccId} nationalAccounts={nationalAccounts} />
      {confirmation && <ConfirmDialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setConfirmation(null); }} title={confirmation.title} description={confirmation.description} destructive onConfirm={async () => { await confirmation.onConfirm(); setConfirmation(null); }} />}
    </div>
  );
}

function CashVaultCard({ bank, pb, nationalAccounts }: any) {
  const [accId, setAccId] = useState('');
  const [amt, setAmt] = useState('0');
  const amtN = parseFloat(amt) || 0;
  const iso = bank.metrics.currency_iso;
  const go = async (dir: 'in' | 'out') => {
    try { await pb.moveCash(bank.id, accId, amtN, dir, iso); setAmt('0'); toast({ title: dir === 'in' ? 'Efectivo recibido' : 'Efectivo devuelto' }); }
    catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Efectivo físico en bóveda</CardTitle>
        <CardDescription>Los depósitos virtuales, extranjeros o desde el Banco Nacional no traen efectivo. Para poder pagar retiros, el Banco Nacional debe enviar billetes impresos a la bóveda.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1"><Label>Cuenta del Banco Nacional</Label>
          <Select value={accId} onValueChange={setAccId}>
            <SelectTrigger><SelectValue placeholder="Seleccionar cuenta" /></SelectTrigger>
            <SelectContent className="max-h-[200px]">
              {[...nationalAccounts].sort((a: any, b: any) => a.holder_name.localeCompare(b.holder_name)).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.holder_name} · {formatNumber(Number(a.balance_real))} {iso}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48"><Label>Monto ({iso})</Label><NumberInput value={amt} onChange={setAmt} /></div>
        <Button disabled={!accId || amtN <= 0} onClick={() => go('in')}>Recibir efectivo</Button>
        <Button variant="outline" disabled={!accId || amtN <= 0} onClick={() => go('out')}>Devolver efectivo</Button>
      </CardContent>
    </Card>
  );
}

function ReserveDialog({ mode, onClose, bank, pb }: any) {
  const [cur, setCur] = useState<string>('PDH');
  const [amt, setAmt] = useState('0');
  const amtN = parseFloat(amt) || 0;
  const submit = async () => {
    try {
      if (mode === 'add') await pb.addReserve(bank.id, cur, amtN);
      else await pb.withdrawReserve(bank.id, cur, amtN);
      setAmt('0'); onClose();
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };
  return (
    <Dialog open={!!mode} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{mode === 'add' ? 'Agregar' : 'Retirar'} reserva</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Moneda</Label>
            <BackingCurrencySelect value={cur} onChange={setCur} exclude={bank.metrics?.currency_iso} />
            <p className="text-xs text-muted-foreground">No se puede respaldar con la moneda propia del banco ({bank.metrics?.currency_iso}).</p>
          </div>
          <div><Label>Monto</Label><NumberInput value={amt} onChange={setAmt} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={amtN <= 0}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OpDialog({ mode, onClose, bank, pb, prefillAccId, nationalAccounts }: any) {
  const [accId, setAccId] = useState<string>('');
  const [toAccId, setToAccId] = useState<string>('');
  const [amt, setAmt] = useState('0');
  const amtN = parseFloat(amt) || 0;
  const [moneySource, setMoneySource] = useState<'printed' | 'symbolic'>('printed');
  const [nationalAccId, setNationalAccId] = useState<string>('');
  const [backingCur, setBackingCur] = useState<string>('PDH');
  const [depositCurrency, setDepositCurrency] = useState<string>(bank.metrics.currency_iso);
  const [withdrawCurrency, setWithdrawCurrency] = useState<string>(bank.metrics.currency_iso);
  const [currencyOptions, setCurrencyOptions] = useState<string[]>([]);
  const [currencyRates, setCurrencyRates] = useState<Record<string, number>>({ PDH: 1, LDH: 9, BDH: 81 });
  const [denoms, setDenoms] = useState<any[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const denominationTotal = denoms.reduce((s, d) => s + Number(d.value) * Number(notes[d.id] || 0), 0);
  const isResourceDeposit = ['PDH', 'LDH', 'BDH'].includes(depositCurrency);
  const effectiveAmount = mode === 'deposit' && !isResourceDeposit ? denominationTotal : amtN;
  const effectiveWithdrawalAmount = mode === 'withdraw'
    ? amtN * (currencyRates[withdrawCurrency] || 1) / (bank.metrics.rate_to_pdh || 1)
    : amtN;

  useEffect(() => {
    if (mode !== 'deposit' || moneySource !== 'printed') return;
    supabase.from('banknote_denominations' as any)
      .select('id, value, currency_iso, boxes_printed, bundles_withdrawn')
      .eq('national_bank_id', bank.national_bank_id)
      .eq('currency_iso', depositCurrency)
      .order('value', { ascending: true })
      .then(({ data }) => setDenoms((data as any[]) || []));
  }, [mode, moneySource, bank.national_bank_id, depositCurrency]);

  useMemo(() => { if (prefillAccId) setAccId(prefillAccId); }, [prefillAccId, mode]);

  useEffect(() => {
    supabase.from('currencies').select('iso_symbol').then(({ data }) => {
      const foreign = (data || []).map((c: any) => c.iso_symbol).filter(Boolean);
      setCurrencyRates((data || []).reduce((out: Record<string, number>, c: any) => {
        out[c.iso_symbol] = Number(c.exchange_rate_to_pdh) || 0;
        return out;
      }, { PDH: 1, LDH: 9, BDH: 81 }));
      setCurrencyOptions(Array.from(new Set([bank.metrics.currency_iso, 'PDH', 'LDH', 'BDH', ...foreign])));
    });
  }, [bank.metrics.currency_iso]);

  const reset = () => { setAccId(''); setToAccId(''); setAmt('0'); setMoneySource('printed'); setNationalAccId(''); setBackingCur('PDH'); setNotes({}); setDepositCurrency(bank.metrics.currency_iso); setWithdrawCurrency(bank.metrics.currency_iso); };

  const submit = async () => {
    try {
      if (mode === 'deposit') {
        const denominationBreakdown = Object.fromEntries(
          denoms.map((d) => [String(d.value), Math.max(0, Number(notes[d.id] || 0))]).filter(([, count]) => count > 0),
        );
        await pb.deposit({
          bankId: bank.id, toAccountId: accId, amount: effectiveAmount,
          currencyIso: depositCurrency, rateToPdh: bank.metrics.rate_to_pdh,
          sourceRateToPdh: currencyRates[depositCurrency] || 0,
          moneySource: 'printed', backingCurrency: backingCur,
          denominationBreakdown,
        });
      } else if (mode === 'withdraw') {
        await pb.withdraw({
          bankId: bank.id, fromAccountId: accId, amount: effectiveWithdrawalAmount,
          currencyIso: withdrawCurrency, rateToPdh: bank.metrics.rate_to_pdh,
          destinationNationalAccountId: nationalAccId || undefined,
        });
      } else if (mode === 'transfer') {
        await pb.transfer({
          bankId: bank.id, fromAccountId: accId, toAccountId: toAccId, amount: amtN,
          currencyIso: bank.metrics.currency_iso, rateToPdh: bank.metrics.rate_to_pdh,
        });
      }
      reset(); onClose();
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  return (
    <Dialog open={!!mode} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'deposit' ? 'Depósito' : mode === 'withdraw' ? 'Retiro' : 'Traspaso interno'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>{mode === 'transfer' ? 'Cuenta origen' : 'Cuenta'}</Label>
            <Select value={accId} onValueChange={setAccId}>
              <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {bank.accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.holder} ({a.account_number})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {mode === 'transfer' && (
            <div><Label>Cuenta destino</Label>
              <Select value={toAccId} onValueChange={setToAccId}>
                <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {bank.accounts.filter((a: any) => a.id !== accId).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.holder} ({a.account_number})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {mode !== 'deposit' || isResourceDeposit ? (
            <div><Label>Monto ({mode === 'deposit' ? depositCurrency : withdrawCurrency})</Label><NumberInput value={amt} onChange={setAmt} /></div>
          ) : (
            <div><Label>Monto calculado ({depositCurrency})</Label><Input value={formatNumber(denominationTotal)} readOnly /></div>
          )}
          {mode === 'withdraw' && (
            <div><Label>Moneda solicitada</Label>
              <Select value={withdrawCurrency} onValueChange={setWithdrawCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{currencyOptions.map((iso) => <SelectItem key={iso} value={iso}>{iso}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Se descontarán {formatNumber(effectiveWithdrawalAmount)} {bank.metrics.currency_iso} de la cuenta.</p>
            </div>
          )}

          {mode === 'deposit' && (
            <>
              <div><Label>Moneda depositada</Label>
                <Select value={depositCurrency} onValueChange={(v) => { setDepositCurrency(v); setNotes({}); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{currencyOptions.map((iso) => <SelectItem key={iso} value={iso}>{iso}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {depositCurrency === bank.metrics.currency_iso && (
                <div className="space-y-2 rounded-md border p-3">
                  <Label>Billetes recibidos por denominación</Label>
                  {denoms.length === 0 ? <p className="text-xs text-muted-foreground">Este Banco Nacional aún no tiene denominaciones.</p> : denoms.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-3">
                      <span className="text-sm">{formatNumber(Number(d.value))}</span>
                      <Input type="number" min="0" step="1" value={notes[d.id] || ''} onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))} placeholder="0" className="w-28" />
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">Total calculado: {formatNumber(denoms.reduce((s, d) => s + Number(d.value) * Number(notes[d.id] || 0), 0))} {bank.metrics.currency_iso}</p>
                </div>
              )}
            </>
          )}

          {mode === 'withdraw' && (
            <div><Label>Cuenta destino (Banco Nacional, para dinero impreso)</Label>
              <Select value={nationalAccId} onValueChange={setNationalAccId}>
                <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {nationalAccounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.holder_name} · {a.account_number}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
          <Button onClick={submit} disabled={(mode === 'deposit' ? effectiveAmount <= 0 : effectiveWithdrawalAmount <= 0) || !accId || (mode === 'transfer' && !toAccId)}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
