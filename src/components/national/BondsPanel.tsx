import { useState } from 'react';
import { useBonds } from '@/hooks/useBonds';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NumberInput } from '@/components/ui/number-input';
import { toast } from '@/hooks/use-toast';
import { formatNumber } from '@/lib/currencyUtils';
import { Plus, Trash2, RefreshCw, PauseCircle, PlayCircle, RotateCcw } from 'lucide-react';

interface Props {
  bank: any; // NationalBankEnriched
}

export function BondsPanel({ bank }: Props) {
  const { bonds, holdings, loading, createBond, deleteBond, setBondStatus, processCoupons, repurchaseHolding } = useBonds();
  const [openCreate, setOpenCreate] = useState(false);
  const [processing, setProcessing] = useState(false);

  const myBonds = bonds.filter(b => b.national_bank_id === bank.id);
  const myHoldings = holdings.filter(h => myBonds.some(b => b.id === h.bond_id));

  const handleProcess = async () => {
    setProcessing(true);
    try {
      const r = await processCoupons(bank.id);
      toast({ title: 'Cupones procesados', description: `${r.paid} cupón(es), ${formatNumber(r.total)} PDH pagados.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setProcessing(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Bonos de Estado</CardTitle>
              <CardDescription>Emite deuda para captar PDH/KYD desde MAHR Bank. Cupón semanal + recompra discrecional.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleProcess} disabled={processing}>
                <RefreshCw className={`h-4 w-4 mr-1 ${processing ? 'animate-spin' : ''}`} /> Pagar cupones pendientes
              </Button>
              <Button onClick={() => setOpenCreate(true)}><Plus className="h-4 w-4 mr-1" /> Emitir Bono</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-6 text-center text-muted-foreground">Cargando...</div>
          ) : myBonds.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">Sin bonos emitidos.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Denom</TableHead>
                <TableHead className="text-right">Precio u.</TableHead>
                <TableHead className="text-right">Disponibles</TableHead>
                <TableHead className="text-right">Tasa anual</TableHead>
                <TableHead className="text-right">Plazo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {myBonds.map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell><Badge variant="outline">{b.denom_currency}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(Number(b.unit_price))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(Number(b.available_units))} / {formatNumber(Number(b.total_units))}</TableCell>
                    <TableCell className="text-right tabular-nums">{(Number(b.annual_rate) * 100).toFixed(2)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{b.term_weeks}s</TableCell>
                    <TableCell><Badge variant={b.status === 'active' ? 'default' : 'secondary'}>{b.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {b.status === 'active' ? (
                          <Button variant="ghost" size="icon" title="Cerrar emisión" onClick={async () => { try { await setBondStatus(b.id, 'closed'); toast({ title: 'Bono cerrado' }); } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); } }}>
                            <PauseCircle className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" title="Reabrir" onClick={async () => { try { await setBondStatus(b.id, 'active'); } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); } }}>
                            <PlayCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={async () => { if (confirm('Eliminar bono?')) { try { await deleteBond(b.id); toast({ title: 'Bono eliminado' }); } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); } } }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Tenedores</CardTitle><CardDescription>Inversores con bonos de este banco. Recompra anticipada disponible.</CardDescription></CardHeader>
        <CardContent className="p-0">
          {myHoldings.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">Sin tenedores aún.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Bono</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                <TableHead className="text-right">Capital (PDH)</TableHead>
                <TableHead className="text-right">Cupones</TableHead>
                <TableHead className="text-right">Intereses (PDH)</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {myHoldings.map(h => {
                  const b = myBonds.find(x => x.id === h.bond_id);
                  return (
                    <TableRow key={h.id}>
                      <TableCell>{b?.name || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(Number(h.units))}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(Number(h.principal_pdh))}</TableCell>
                      <TableCell className="text-right tabular-nums">{h.coupons_paid}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(Number(h.total_interest_pdh))}</TableCell>
                      <TableCell className="text-xs">{new Date(h.maturity_at).toLocaleDateString('es-ES')}</TableCell>
                      <TableCell><Badge variant={h.status === 'active' ? 'default' : 'secondary'}>{h.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        {h.status === 'active' && (
                          <Button variant="outline" size="sm" onClick={async () => { if (confirm('Recomprar (devolver capital + cupones pendientes)?')) { try { await repurchaseHolding(h.id); toast({ title: 'Recompra realizada' }); } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); } } }}>
                            <RotateCcw className="h-3 w-3 mr-1" /> Recomprar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateBondDialog open={openCreate} onOpenChange={setOpenCreate} bank={bank} onCreate={async (args) => {
        try { await createBond(args); toast({ title: 'Bono emitido' }); setOpenCreate(false); }
        catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
      }} />
    </div>
  );
}

function CreateBondDialog({ open, onOpenChange, bank, onCreate }: any) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [denomMode, setDenomMode] = useState<'local' | 'pdh' | 'kyd'>('local');
  const [unitPrice, setUnitPrice] = useState('');
  const [totalUnits, setTotalUnits] = useState('');
  const [annualRatePct, setAnnualRatePct] = useState('');
  const [termWeeks, setTermWeeks] = useState('');

  const localIso = bank?.metrics?.currency_iso || 'PDH';
  const denomCurrency = denomMode === 'local' ? localIso : denomMode.toUpperCase();

  const reset = () => { setName(''); setDescription(''); setDenomMode('local'); setUnitPrice(''); setTotalUnits(''); setAnnualRatePct(''); setTermWeeks(''); };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Emitir Bono de Estado</DialogTitle>
          <DialogDescription>El comprador paga el equivalente en PDH desde su cuenta MAHR. El respaldo ingresa al Banco Nacional.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2"><Label>Nombre</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Bono Soberano 2027" /></div>
          <div className="space-y-2"><Label>Descripción (opcional)</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Denominación</Label>
              <Select value={denomMode} onValueChange={(v: any) => setDenomMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Moneda local ({localIso})</SelectItem>
                  <SelectItem value="pdh">PDH</SelectItem>
                  <SelectItem value="kyd">KYD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Precio por unidad ({denomCurrency})</Label><NumberInput value={unitPrice} onChange={setUnitPrice} /></div>
            <div className="space-y-2"><Label>Total unidades</Label><NumberInput value={totalUnits} onChange={setTotalUnits} /></div>
            <div className="space-y-2"><Label>Tasa anual (%)</Label><NumberInput value={annualRatePct} onChange={setAnnualRatePct} /></div>
            <div className="space-y-2 col-span-2"><Label>Plazo (semanas)</Label><NumberInput value={termWeeks} onChange={setTermWeeks} /></div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!name || !parseFloat(unitPrice) || !parseFloat(totalUnits) || !parseInt(termWeeks)}
            onClick={() => onCreate({
              nationalBankId: bank.id, name, description,
              denomMode, denomCurrency,
              unitPrice: parseFloat(unitPrice),
              totalUnits: parseFloat(totalUnits),
              annualRate: (parseFloat(annualRatePct) || 0) / 100,
              termWeeks: parseInt(termWeeks),
            })}
          >Emitir</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
