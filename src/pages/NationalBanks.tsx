import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNationalBanks, NationalBankEnriched } from '@/hooks/useNationalBanks';
import { useCountriesData } from '@/hooks/useCountriesData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NumberInput } from '@/components/ui/number-input';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Building2, ArrowLeft, ArrowDownUp, Send, Wallet, Snowflake, History, Search } from 'lucide-react';
import { formatNumber } from '@/lib/currencyUtils';
import { BondsPanel } from '@/components/national/BondsPanel';
import { BanknotesPanel, NOTES_PER_BOX } from '@/components/national/BanknotesPanel';
import { CashWithdrawalPanel } from '@/components/national/CashWithdrawalPanel';
import { BackingCurrencySelect, BackingTable } from '@/components/bank/BackingUI';

export default function NationalBanks() {
  const {
    banks, txs, loading, reload,
    createBank, deleteBank, setStatus,
    createAccount, deleteAccount,
    addBacking, withdrawBacking,
    addIssuanceReserve, withdrawIssuanceReserve,
    nationalTransfer, nationalDeposit, nationalWithdraw,
    intlTransfer,
    nationalToMahrTransfer, mahrToNationalTransfer,
  } = useNationalBanks();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // dialogs
  const [openAccount, setOpenAccount] = useState(false);
  const [openBacking, setOpenBacking] = useState<null | 'add' | 'withdraw'>(null);
  const [openOp, setOpenOp] = useState<null | 'transfer' | 'deposit' | 'withdraw' | 'intl' | 'mahr_send' | 'mahr_receive'>(null);

  const selected = banks.find(b => b.id === selectedId) || null;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (selected) {
    return (
      <BankDetail
        bank={selected}
        allBanks={banks}
        txs={txs.filter(t => t.national_bank_id === selected.id)}
        onBack={() => setSelectedId(null)}
        onCreateAccount={() => setOpenAccount(true)}
        openBacking={openBacking} setOpenBacking={setOpenBacking}
        openOp={openOp} setOpenOp={setOpenOp}
        ops={{ reload, deleteAccount, addBacking, withdrawBacking, addIssuanceReserve, withdrawIssuanceReserve, nationalTransfer, nationalDeposit, nationalWithdraw, intlTransfer, nationalToMahrTransfer, mahrToNationalTransfer, setStatus, deleteBank: async (id: string) => { await deleteBank(id); setSelectedId(null); } }}
        openAccount={openAccount} setOpenAccount={setOpenAccount} createAccount={createAccount}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bancos Nacionales</h1>
          <p className="text-muted-foreground">Un Banco Nacional por país; es el emisor de su moneda.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> Crear Banco Nacional</Button>
      </div>

      {banks.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No hay Bancos Nacionales todavía. Crea el primero.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {banks.map(b => (
            <Card key={b.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => setSelectedId(b.id)}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" />{b.name}</CardTitle>
                  <Badge variant={b.status === 'active' ? 'default' : 'secondary'}>{b.status}</Badge>
                </div>
                <CardDescription>{b.country?.name || '—'} · {b.currency?.iso_symbol || '—'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Row label="Impreso" value={`${formatNumber(b.metrics.printed_total)} ${b.metrics.currency_iso}`} />
                <Row label="Comprometido real" value={`${formatNumber(b.metrics.committed_real)} ${b.metrics.currency_iso}`} />
                <Row label="Disponible real" value={`${formatNumber(b.metrics.available_real)} ${b.metrics.currency_iso}`} />
                <Row label="Simbólico" value={`${formatNumber(b.metrics.committed_symbolic)} ${b.metrics.currency_iso}`} />
                <Row label="Respaldo de la moneda" value={b.currency ? `${formatNumber(Number(b.currency.pdh_reserves))} PDH` : '—'} />
                <Row label="Respaldo internacional" value={`${formatNumber(b.metrics.backing_total)} PDH`} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateBankDialog open={showCreate} onOpenChange={setShowCreate} onCreate={async (countryId, name) => {
        try { await createBank(countryId, name); toast({ title: 'Banco Nacional creado' }); setShowCreate(false); }
        catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
      }} existingCountryIds={banks.map(b => b.country_id)} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums break-words">{value}</span>
    </div>
  );
}

function parseAmount(value: string): number {
  const normalized = value.trim().replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  return Number(normalized);
}

// ---------- Detail view ----------
function BankDetail({
  bank, allBanks, txs, onBack, openAccount, setOpenAccount, createAccount,
  openBacking, setOpenBacking, openOp, setOpenOp, ops,
}: any) {
  const { currencies } = useCountriesData();
  const [accountSearch, setAccountSearch] = useState('');
  const [prefillAccountId, setPrefillAccountId] = useState<string | null>(null);
  const [pickerAccountId, setPickerAccountId] = useState<string | null>(null);
  const [issuanceAmount, setIssuanceAmount] = useState('');
  const [issuanceCurrency, setIssuanceCurrency] = useState('PDH');

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    const list = q
      ? bank.accounts.filter((a: any) => (a.holder_name || '').toLowerCase().includes(q))
      : bank.accounts;
    return [...list].sort((a: any, b: any) => (a.holder_name || '').localeCompare(b.holder_name || ''));
  }, [accountSearch, bank.accounts]);

  const pickerAccount = bank.accounts.find((a: any) => a.id === pickerAccountId);

  const openOpWithAccount = (mode: 'transfer' | 'deposit' | 'withdraw' | 'intl' | 'mahr_send' | 'mahr_receive', accId: string) => {
    setPrefillAccountId(accId);
    setPickerAccountId(null);
    setOpenOp(mode);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{bank.name}</h1>
            <p className="text-muted-foreground">{bank.country?.name} · Moneda: <Badge variant="outline">{bank.metrics.currency_iso}</Badge></p>
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={bank.status} onValueChange={async (v) => { try { await ops.setStatus(bank.id, v); } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); } }}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Activo</SelectItem>
              <SelectItem value="inactive">Inactivo</SelectItem>
              <SelectItem value="blocked">Bloqueado</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="destructive" size="icon" onClick={async () => { if (confirm('Eliminar el Banco Nacional y todas sus cuentas?')) { try { await ops.deleteBank(bank.id); } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); } } }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <section className="space-y-3" aria-labelledby="currency-backing-title">
        <h2 id="currency-backing-title" className="text-lg font-semibold">Respaldo de la moneda · {bank.metrics.currency_iso}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric title="Respaldo de la moneda" value={bank.currency ? formatNumber(Number(bank.currency.pdh_reserves)) : '—'} suffix="PDH" />
          <Metric title="Dinero total impreso" value={bank.currency ? formatNumber(Number(bank.currency.printed_amount)) : '—'} suffix={bank.metrics.currency_iso} />
          <Metric title="Moneda quemada" value={bank.currency ? formatNumber(Number(bank.currency.burned_amount)) : '—'} suffix={bank.metrics.currency_iso} />
          <Metric title="Circulación neta" value={formatNumber(bank.metrics.printed_total)} suffix={bank.metrics.currency_iso} />
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
          <div>
            <h3 className="font-medium">Administrar respaldo de emisión</h3>
            <p className="text-sm text-muted-foreground">Este respaldo determina el valor de los billetes impresos y es independiente del respaldo internacional del banco.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-full max-w-xs space-y-1">
              <Label htmlFor="issuance-reserve-amount">Monto del respaldo</Label>
              <NumberInput id="issuance-reserve-amount" min={0} step="any" value={issuanceAmount} onChange={setIssuanceAmount} placeholder="Ej. 2" />
            </div>
            <div className="w-full max-w-xs space-y-1"><Label>Moneda entregada</Label><Select value={issuanceCurrency} onValueChange={setIssuanceCurrency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PDH">PDH · Pepita de Hierro</SelectItem>{currencies.filter((c: any) => c.iso_symbol !== 'PDH').map((c: any) => <SelectItem key={c.iso_symbol} value={c.iso_symbol}>{c.iso_symbol} · {c.name}</SelectItem>)}</SelectContent></Select></div>
            <Button onClick={async () => {
              try { await ops.addIssuanceReserve(bank.id, parseAmount(issuanceAmount), issuanceCurrency); setIssuanceAmount(''); toast({ title: 'Respaldo de emisión agregado' }); }
              catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
            }}>Agregar {issuanceCurrency}</Button>
            <Button variant="outline" onClick={async () => {
              try { await ops.withdrawIssuanceReserve(bank.id, parseAmount(issuanceAmount), issuanceCurrency); setIssuanceAmount(''); toast({ title: 'Respaldo de emisión retirado' }); }
              catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
            }}>Retirar {issuanceCurrency}</Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Valor actual: 1 {bank.metrics.currency_iso} = {Number(bank.metrics.currency_rate_to_pdh).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} PDH</p>
      </section>

      <section className="space-y-3" aria-labelledby="bank-backing-title">
        <h2 id="bank-backing-title" className="text-lg font-semibold">Fondos del banco y respaldo internacional</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Comprometido real (este banco)" value={formatNumber(bank.metrics.committed_real)} suffix={bank.metrics.currency_iso} hint={`Compartido total: ${formatNumber(bank.metrics.committed_real_shared)}`} />
        <Metric title="Disponible real" value={formatNumber(bank.metrics.available_real)} suffix={bank.metrics.currency_iso} hint="Pool compartido entre países con la misma moneda" />
        <Metric title="Simbólico no impreso" value={formatNumber(bank.metrics.committed_symbolic)} suffix={bank.metrics.currency_iso} />
        <Metric title="Total operativo" value={formatNumber(bank.metrics.total_operational)} suffix={bank.metrics.currency_iso} />
        <Metric title="Respaldo internacional total" value={formatNumber(bank.metrics.backing_total)} suffix="PDH" hint={`${bank.metrics.backings.length} moneda(s)`} />
        <Metric title="Respaldo internacional disponible" value={formatNumber(bank.metrics.backing_available)} suffix="PDH" hint={`Congelado: ${formatNumber(bank.metrics.backing_frozen)} PDH`} />
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="custody-title">
        <h2 id="custody-title" className="text-lg font-semibold">Custodias separadas</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ['own_resources', 'Recursos propios del Banco Nacional', 'Se conservan en el banco y no respaldan moneda ni operaciones internacionales.'],
            ['currency_backing', 'Respaldo de la moneda nacional en MAHR', 'Custodiado por MAHR y destinado al valor de la moneda.'],
            ['international_backing', 'Respaldo internacional en MAHR', 'Custodiado por MAHR para operaciones internacionales.'],
          ].map(([type, title, description]) => {
            const rows = (bank.custodyAccounts || []).filter((row: any) => row.custody_type === type);
            const treasury = (bank.accounts || []).find((account: any) => account.account_type === 'bank_treasury');
            const total = type === 'own_resources' && rows.length === 0
              ? Number(treasury?.balance_real || 0)
              : rows.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
            const frozen = type === 'international_backing'
              ? bank.metrics.committed_real
              : rows.reduce((sum: number, row: any) => sum + Number(row.frozen || 0), 0);
            const unit = type === 'own_resources' ? bank.metrics.currency_iso : 'custodia';
            return <Card key={type}><CardHeader><CardTitle className="text-base">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="text-sm"><p className="font-semibold">{formatNumber(total)} {unit}</p><p className="text-muted-foreground">Congelado: {formatNumber(frozen)}</p></CardContent></Card>;
          })}
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Cuentas del Banco Nacional</CardTitle><CardDescription>Los saldos reales de estas cuentas quedan comprometidos y reducen el efectivo propio disponible.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {(bank.accounts || []).length === 0 ? <p className="text-sm text-muted-foreground">No hay cuentas nacionales registradas.</p> : (bank.accounts || []).map((account: any) => <div key={account.id} className="flex justify-between border-b py-2 text-sm"><span>{account.holder_name} · {account.account_number}</span><span className="font-medium">{formatNumber(Number(account.balance_real))} {bank.metrics.currency_iso}</span></div>)}
          </CardContent>
        </Card>
      </section>

      <Tabs defaultValue="accounts">
        <TabsList className="h-auto flex flex-wrap justify-start gap-1">
          <TabsTrigger value="accounts">Cuentas</TabsTrigger>
          <TabsTrigger value="backing">Respaldo internacional</TabsTrigger>
          <TabsTrigger value="ops">Operaciones</TabsTrigger>
          <TabsTrigger value="notes">Billetes</TabsTrigger>
          <TabsTrigger value="cash-withdrawal">Retiro de efectivo</TabsTrigger>
          <TabsTrigger value="bonds">Bonos</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="notes">
          <BanknotesPanel bank={bank} onChanged={ops.reload} />
        </TabsContent>

        <TabsContent value="cash-withdrawal">
          <CashWithdrawalPanel bank={bank} onChanged={ops.reload} />
        </TabsContent>

        <TabsContent value="bonds">
          <BondsPanel bank={bank} />
        </TabsContent>


        <TabsContent value="accounts" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="Buscar por nombre del titular..."
                className="pl-8"
              />
            </div>
            <Button onClick={() => setOpenAccount(true)}><Plus className="h-4 w-4 mr-1" /> Nueva Cuenta</Button>
          </div>
          <p className="text-xs text-muted-foreground">Haz clic en una cuenta para realizar una operación desde ella.</p>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Titular</TableHead><TableHead>Número</TableHead><TableHead>Tipo</TableHead>
                <TableHead className="text-right">Saldo real</TableHead>
                <TableHead className="text-right">Saldo simbólico</TableHead>
                <TableHead className="text-right">Respaldo</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredAccounts.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">{bank.accounts.length === 0 ? 'Sin cuentas' : 'Sin coincidencias'}</TableCell></TableRow>
                ) : filteredAccounts.map((a: any) => (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => setPickerAccountId(a.id)}>
                    <TableCell className="font-medium">{a.holder_name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{a.account_number}</TableCell>
                    <TableCell><Badge variant="outline">{a.account_type}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(Number(a.balance_real))} {bank.metrics.currency_iso}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(Number(a.balance_symbolic))} {bank.metrics.currency_iso}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.backing_currency ? `${formatNumber(Number(a.backing_amount))} ${a.backing_currency}` : '—'}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={async () => { if (confirm('Eliminar cuenta?')) { try { await ops.deleteAccount(a.id); } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); } } }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="backing" className="space-y-3">
          <Card><CardHeader><CardTitle>Respaldo internacional</CardTitle><CardDescription>Deposita en el MAHR Bank cualquier moneda registrada como respaldo. Su valor cambia según el valor de esa moneda.</CardDescription></CardHeader>
            <CardContent className="flex gap-3 flex-wrap">
              <Button onClick={() => setOpenBacking('add')}><Wallet className="h-4 w-4 mr-1" /> Agregar Respaldo</Button>
              <Button variant="outline" onClick={() => setOpenBacking('withdraw')}><Snowflake className="h-4 w-4 mr-1" /> Retirar Respaldo</Button>
            </CardContent>
          </Card>
          <BackingTable lines={bank.metrics.backings} title="Respaldo internacional del banco" />
        </TabsContent>

        <TabsContent value="ops" className="space-y-3">
          <Card><CardContent className="pt-6 flex gap-3 flex-wrap">
            <Button onClick={() => { setPrefillAccountId(null); setOpenOp('deposit'); }}><Plus className="h-4 w-4 mr-1" /> Depósito nacional</Button>
            <Button onClick={() => { setPrefillAccountId(null); setOpenOp('withdraw'); }} variant="outline"><Plus className="h-4 w-4 mr-1 rotate-45" /> Retiro nacional</Button>
            <Button onClick={() => { setPrefillAccountId(null); setOpenOp('transfer'); }}><ArrowDownUp className="h-4 w-4 mr-1" /> Transferencia nacional</Button>
            <Button onClick={() => { setPrefillAccountId(null); setOpenOp('intl'); }} variant="default"><Send className="h-4 w-4 mr-1" /> Envío internacional (MAHR)</Button>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="history">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Fecha</TableHead><TableHead>Tipo</TableHead>
                <TableHead className="text-right">Monto local</TableHead>
                <TableHead className="text-right">Respaldo</TableHead>
                <TableHead>Simbólico</TableHead>
                <TableHead>Descripción</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {txs.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sin movimientos</TableCell></TableRow>
                ) : txs.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">{new Date(t.created_at).toLocaleString('es-ES')}</TableCell>
                    <TableCell><Badge variant="outline">{t.transaction_type}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{t.amount_local ? `${formatNumber(Number(t.amount_local))} ${t.currency_local || ''}` : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.backing_amount ? `${formatNumber(Number(t.backing_amount))} ${t.backing_currency || ''}` : '—'}</TableCell>
                    <TableCell>{t.is_symbolic ? <Badge variant="secondary">Sí</Badge> : '—'}</TableCell>
                    <TableCell className="text-sm">{t.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <CreateAccountDialog open={openAccount} onOpenChange={setOpenAccount} onCreate={async (holder, type) => {
        try { await createAccount(bank.id, holder, type); toast({ title: 'Cuenta creada' }); setOpenAccount(false); }
        catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
      }} />

      <BackingDialog mode={openBacking} onClose={() => setOpenBacking(null)} bank={bank}
        onSubmit={async (cur, amount) => {
          try {
            if (openBacking === 'add') await ops.addBacking(bank.id, cur, amount);
            else await ops.withdrawBacking(bank.id, cur, amount);
            toast({ title: 'Respaldo actualizado' });
            setOpenBacking(null);
          } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
        }} />

      <Dialog open={!!pickerAccountId} onOpenChange={(v) => !v && setPickerAccountId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Operar con {pickerAccount?.holder_name}</DialogTitle>
            <DialogDescription>
              Cuenta {pickerAccount?.account_number} · Saldo {formatNumber(Number(pickerAccount?.balance_real || 0))} {bank.metrics.currency_iso}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button onClick={() => openOpWithAccount('deposit', pickerAccountId!)}><Plus className="h-4 w-4 mr-1" /> Depósito</Button>
            <Button variant="outline" onClick={() => openOpWithAccount('withdraw', pickerAccountId!)}><Plus className="h-4 w-4 mr-1 rotate-45" /> Retiro</Button>
            <Button onClick={() => openOpWithAccount('transfer', pickerAccountId!)}><ArrowDownUp className="h-4 w-4 mr-1" /> Transferencia</Button>
            <Button onClick={() => openOpWithAccount('intl', pickerAccountId!)}><Send className="h-4 w-4 mr-1" /> Internacional</Button>
            <Button variant="secondary" onClick={() => openOpWithAccount('mahr_send', pickerAccountId!)}><Send className="h-4 w-4 mr-1" /> Enviar a MAHR</Button>
            <Button variant="secondary" onClick={() => openOpWithAccount('mahr_receive', pickerAccountId!)}><ArrowDownUp className="h-4 w-4 mr-1" /> Recibir de MAHR</Button>
          </div>
        </DialogContent>
      </Dialog>

      <OpDialog mode={openOp} onClose={() => { setOpenOp(null); setPrefillAccountId(null); }} bank={bank} allBanks={allBanks} ops={ops} initialAccountId={prefillAccountId} />
    </div>
  );
}

function Metric({ title, value, suffix, hint }: any) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent>
        <p className="text-xl font-bold tabular-nums break-words">{value} <span className="text-xs text-muted-foreground font-normal">{suffix}</span></p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// ---------- Create bank dialog ----------
function CreateBankDialog({ open, onOpenChange, onCreate, existingCountryIds }: any) {
  const { countries } = useCountriesData();
  const [countryId, setCountryId] = useState('');
  const [name, setName] = useState('');
  const available = (countries || []).filter((c: any) => !existingCountryIds.includes(c.id));
  const selected = available.find((c: any) => c.id === countryId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo Banco Nacional</DialogTitle>
          <DialogDescription>Cada país solo puede tener uno. La moneda se toma automáticamente del país.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>País</Label>
            <Select value={countryId} onValueChange={setCountryId}>
              <SelectTrigger><SelectValue placeholder="Selecciona país..." /></SelectTrigger>
              <SelectContent>
                {available.length === 0 ? <SelectItem value="__none" disabled>Todos los países ya tienen banco</SelectItem> :
                  available.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.currency?.iso_symbol || '—'})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {selected && <p className="text-sm text-muted-foreground">Moneda automática: <Badge variant="outline">{selected.currency?.iso_symbol || '—'}</Badge></p>}
          <div className="space-y-2">
            <Label>Nombre del Banco Nacional</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={selected ? `Banco Nacional de ${selected.name}` : 'Nombre'} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!countryId || !name} onClick={() => onCreate(countryId, name)}>Crear</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Create account dialog ----------
function CreateAccountDialog({ open, onOpenChange, onCreate }: any) {
  const [holder, setHolder] = useState('');
  const [type, setType] = useState('personal');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nueva Cuenta</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2"><Label>Titular</Label><Input value={holder} onChange={e => setHolder(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="business">Empresarial</SelectItem>
                <SelectItem value="gov">Gobierno</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!holder} onClick={() => { onCreate(holder, type); setHolder(''); setType('personal'); }}>Crear</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Backing dialog ----------
function BackingDialog({ mode, onClose, bank, onSubmit }: any) {
  const [cur, setCur] = useState<string>('PDH');
  const [amount, setAmount] = useState('');
  return (
    <Dialog open={!!mode} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{mode === 'add' ? 'Agregar Respaldo' : 'Retirar Respaldo'}</DialogTitle>
          <DialogDescription>{mode === 'add' ? 'Deposita respaldo en el MAHR Bank en cualquier moneda registrada.' : 'Devuelve respaldo desde el MAHR Bank. La parte congelada no puede retirarse.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2"><Label>Moneda</Label>
            <BackingCurrencySelect value={cur} onChange={setCur} exclude={bank.metrics?.currency_iso} />
            <p className="text-xs text-muted-foreground">No se puede respaldar con la moneda propia del banco ({bank.metrics?.currency_iso}).</p>
          </div>
          <div className="space-y-2"><Label>Monto</Label><NumberInput value={amount} onChange={setAmount} /></div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!parseFloat(amount)} onClick={() => onSubmit(cur, parseFloat(amount))}>Confirmar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Operations dialog ----------
function OpDialog({ mode, onClose, bank, allBanks, ops, initialAccountId }: any) {
  const [fromAcc, setFromAcc] = useState('');
  const [toAcc, setToAcc] = useState('');
  const [amount, setAmount] = useState('');
  const [backingCur, setBackingCur] = useState<string>('PDH');
  const [moneySource, setMoneySource] = useState<'printed' | 'symbolic'>('printed');
  const [toBankId, setToBankId] = useState('');
  const [mahrAccountId, setMahrAccountId] = useState('');
  const [mahrAccounts, setMahrAccounts] = useState<any[]>([]);
  const [intlDestination, setIntlDestination] = useState<'national' | 'mahr'>('national');
  const [availableDenoms, setAvailableDenoms] = useState<any[]>([]);

  const sortedAccounts = useMemo(
    () => [...bank.accounts].sort((a: any, b: any) => (a.holder_name || '').localeCompare(b.holder_name || '')),
    [bank.accounts]
  );

  // Pre-fill account when dialog opens with an initial account
  useEffect(() => {
    if (!mode || !initialAccountId) return;
    if (mode === 'deposit' || mode === 'mahr_receive') setToAcc(initialAccountId);
    else setFromAcc(initialAccountId);
  }, [mode, initialAccountId]);

  // Load MAHR accounts when needed
  useEffect(() => {
    if (mode !== 'mahr_send' && mode !== 'mahr_receive' && !(mode === 'intl' && intlDestination === 'mahr')) return;
    supabase.from('accounts')
      .select('id, account_number, user_name, currency, balance_pdh')
      .neq('id', 'bank-main')
      .order('user_name')
      .then(({ data }) => { if (data) setMahrAccounts(data as any[]); });
  }, [mode, intlDestination]);

  useEffect(() => {
    if (mode !== 'withdraw') return;
    supabase.from('banknote_denominations' as any)
      .select('value, boxes_printed')
      .eq('national_bank_id', bank.id)
      .order('value', { ascending: false })
      .then(({ data }) => setAvailableDenoms((data as any[]) || []));
  }, [mode, bank.id]);

  const otherBanks = (allBanks || []).filter((b: any) => b.id !== bank.id);
  const toBank = otherBanks.find((b: any) => b.id === toBankId);

  const reset = () => { setFromAcc(''); setToAcc(''); setAmount(''); setBackingCur('PDH'); setMoneySource('printed'); setToBankId(''); setMahrAccountId(''); setIntlDestination('national'); };

  const handle = async () => {
    try {
      const amt = parseFloat(amount);
      if (!amt) return;
      if (mode === 'transfer') {
        await ops.nationalTransfer({ bankId: bank.id, fromAccountId: fromAcc, toAccountId: toAcc, amount: amt, currencyIso: bank.metrics.currency_iso });
      } else if (mode === 'deposit') {
        await ops.nationalDeposit({ bankId: bank.id, toAccountId: toAcc, amount: amt, currencyIso: bank.metrics.currency_iso, availableReal: bank.metrics.available_real, rateToPdh: bank.metrics.currency_rate_to_pdh, moneySource, backingCurrency: backingCur });
      } else if (mode === 'withdraw') {
        await ops.nationalWithdraw({ bankId: bank.id, fromAccountId: fromAcc, amount: amt, currencyIso: bank.metrics.currency_iso, rateToPdh: bank.metrics.currency_rate_to_pdh });
      } else if (mode === 'intl') {
        if (intlDestination === 'mahr') {
          if (!mahrAccountId) throw new Error('Selecciona cuenta MAHR destino.');
          await ops.nationalToMahrTransfer({ bankId: bank.id, fromNationalAccountId: fromAcc, toMahrAccountId: mahrAccountId, amountLocal: amt, currencyLocalIso: bank.metrics.currency_iso, rateToPdh: bank.metrics.currency_rate_to_pdh, backingCurrency: backingCur });
        } else {
          if (!toBank) throw new Error('Selecciona banco destino.');
          await ops.intlTransfer({ fromBankId: bank.id, fromAccountId: fromAcc, toBankId: toBank.id, toAccountId: toAcc, amountLocalFrom: amt, backingCurrency: backingCur, fromCurrencyIso: bank.metrics.currency_iso, fromRateToPdh: bank.metrics.currency_rate_to_pdh, toCurrencyIso: toBank.metrics.currency_iso, toRateToPdh: toBank.metrics.currency_rate_to_pdh, toAvailableReal: toBank.metrics.available_real, receiverMoneySource: moneySource });
        }
      } else if (mode === 'mahr_send') {
        if (!mahrAccountId) throw new Error('Selecciona cuenta MAHR destino.');
        await ops.nationalToMahrTransfer({
          bankId: bank.id,
          fromNationalAccountId: fromAcc,
          toMahrAccountId: mahrAccountId,
          amountLocal: amt,
          currencyLocalIso: bank.metrics.currency_iso,
          rateToPdh: bank.metrics.currency_rate_to_pdh,
          backingCurrency: backingCur,
        });
      } else if (mode === 'mahr_receive') {
        if (!mahrAccountId) throw new Error('Selecciona cuenta MAHR origen.');
        await ops.mahrToNationalTransfer({
          bankId: bank.id,
          fromMahrAccountId: mahrAccountId,
          toNationalAccountId: toAcc,
          amountMahr: amt,
          currencyLocalIso: bank.metrics.currency_iso,
          rateToPdh: bank.metrics.currency_rate_to_pdh,
          availableReal: bank.metrics.available_real,
          moneySource,
        });
      }
      toast({ title: 'Operación realizada' });
      reset(); onClose();
    } catch (e: any) {
      toast({ title: 'Operación bloqueada', description: e.message, variant: 'destructive' });
    }
  };

  const selectedMahr = mahrAccounts.find(a => a.id === mahrAccountId);
  const amountLabel =
    mode === 'mahr_receive'
      ? `Monto (${selectedMahr?.currency || 'moneda MAHR'})`
      : `Monto (${bank.metrics.currency_iso})`;

  const withdrawalBreakdown = useMemo(() => {
    if (mode !== 'withdraw') return null;
    let remaining = parseFloat(amount) || 0;
    const parts: string[] = [];
    for (const denom of availableDenoms) {
      const value = Number(denom.value) || 0;
      const available = Number(denom.boxes_printed || 0) * NOTES_PER_BOX;
      const count = value > 0 ? Math.min(available, Math.floor((remaining + 1e-9) / value)) : 0;
      if (count > 0) {
        parts.push(`${count} × ${formatNumber(value)}`);
        remaining = Math.round((remaining - count * value) * 100) / 100;
      }
    }
    return { parts, remaining };
  }, [mode, amount, availableDenoms]);

  return (
    <Dialog open={!!mode} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'transfer' && 'Transferencia nacional'}
            {mode === 'deposit' && 'Depósito nacional'}
            {mode === 'withdraw' && 'Retiro nacional'}
            {mode === 'intl' && 'Envío internacional (vía MAHR Bank)'}
            {mode === 'mahr_send' && 'Enviar a cuenta MAHR'}
            {mode === 'mahr_receive' && 'Recibir desde cuenta MAHR'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'mahr_send' && 'Debita la cuenta nacional y acredita a una cuenta del MAHR Bank (convertida a su moneda). Usa respaldo PDH del banco.'}
            {mode === 'mahr_receive' && 'Debita una cuenta del MAHR Bank y acredita a la cuenta nacional (convertida a moneda local). El respaldo PDH sube; el excedente se marca como simbólico.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {(mode === 'transfer' || mode === 'withdraw' || mode === 'intl' || mode === 'mahr_send') && (
            <div className="space-y-2"><Label>Cuenta nacional origen</Label>
              <Select value={fromAcc} onValueChange={setFromAcc}>
                <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                <SelectContent>{sortedAccounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.holder_name} ({formatNumber(Number(a.balance_real))})</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {mode === 'intl' && (
            <div className="space-y-2"><Label>Banco destino</Label>
              <Select value={intlDestination} onValueChange={(v: 'national' | 'mahr') => { setIntlDestination(v); setToBankId(''); setToAcc(''); setMahrAccountId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="national">Banco Nacional / minibanco</SelectItem>
                  <SelectItem value="mahr">MAHR Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {mode === 'intl' && intlDestination === 'national' && (
            <div className="space-y-2"><Label>Banco Nacional destino</Label>
              <Select value={toBankId} onValueChange={setToBankId}>
                <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                <SelectContent>{otherBanks.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.metrics.currency_iso})</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {mode === 'intl' && intlDestination === 'mahr' && (
            <div className="space-y-2"><Label>Cuenta MAHR destino</Label>
              <Select value={mahrAccountId} onValueChange={setMahrAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecciona cuenta MAHR..." /></SelectTrigger>
                <SelectContent className="max-h-[240px]">{mahrAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.user_name} · {a.currency} ({formatNumber(Number(a.balance_pdh))})</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {(mode === 'transfer' || mode === 'deposit' || (mode === 'intl' && intlDestination === 'national') || mode === 'mahr_receive') && (
            <div className="space-y-2"><Label>Cuenta nacional destino</Label>
              <Select value={toAcc} onValueChange={setToAcc}>
                <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                <SelectContent>
                  {(mode === 'intl' ? [...(toBank?.accounts || [])].sort((a: any, b: any) => (a.holder_name || '').localeCompare(b.holder_name || '')) : sortedAccounts).map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.holder_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {(mode === 'mahr_send' || mode === 'mahr_receive') && (
            <div className="space-y-2"><Label>Cuenta MAHR {mode === 'mahr_send' ? 'destino' : 'origen'}</Label>
              <Select value={mahrAccountId} onValueChange={setMahrAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecciona cuenta MAHR..." /></SelectTrigger>
                <SelectContent className="max-h-[240px]">
                  {mahrAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.user_name} · {a.currency} ({formatNumber(Number(a.balance_pdh))})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2"><Label>{amountLabel}</Label>
            <NumberInput value={amount} onChange={setAmount} /></div>
          {mode === 'withdraw' && withdrawalBreakdown && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Entrega sugerida en billetes</p>
              {withdrawalBreakdown.parts.length > 0 ? (
                <p className="text-muted-foreground">{withdrawalBreakdown.parts.join(' + ')} {bank.metrics.currency_iso}</p>
              ) : <p className="text-muted-foreground">No hay billetes disponibles para este monto.</p>}
              {withdrawalBreakdown.remaining > 0 && <p className="mt-1 text-destructive">Faltan {formatNumber(withdrawalBreakdown.remaining)} {bank.metrics.currency_iso}; no existe una combinación exacta con los billetes disponibles.</p>}
            </div>
          )}
          {(mode === 'deposit' || (mode === 'intl' && intlDestination === 'national') || mode === 'mahr_receive') && (
            <>
              <div className="space-y-2">
                <Label>Origen del dinero</Label>
                <Select value={moneySource} onValueChange={(v: any) => setMoneySource(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="printed">
                      Dinero impreso ({formatNumber(bank.metrics.available_real)} {bank.metrics.currency_iso} disponibles)
                    </SelectItem>
                    <SelectItem value="symbolic">
                      Dinero simbólico (respaldado)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {moneySource === 'printed'
                    ? 'Se descontará del dinero impreso disponible del país.'
                    : 'No aumenta el dinero impreso. Se congela respaldo equivalente en la moneda elegida, según su valor de hoy.'}
                </p>
              </div>
              {moneySource === 'symbolic' && mode !== 'mahr_receive' && (
                <div className="space-y-2"><Label>Respaldo para dinero simbólico</Label>
                  <BackingCurrencySelect value={backingCur} onChange={setBackingCur} exclude={bank.metrics?.currency_iso} />
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
          <Button onClick={handle}>Ejecutar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
