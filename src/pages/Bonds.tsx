import { useState } from 'react';
import { useBonds } from '@/hooks/useBonds';
import { useNationalBanks } from '@/hooks/useNationalBanks';
import { useBankData } from '@/hooks/useBankData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NumberInput } from '@/components/ui/number-input';
import { toast } from '@/hooks/use-toast';
import { formatNumber } from '@/lib/currencyUtils';
import { Loader2, ShoppingCart, RefreshCw, Tag } from 'lucide-react';
import { denomToPdh } from '@/lib/bondOperations';
import { getExchangeRates } from '@/lib/currencyUtils';
import { supabase } from '@/integrations/supabase/client';

export default function Bonds() {
  const { bonds, holdings, loading, buyBond, processCoupons, reload, publishBondForSale, executeBondMarketOrder, cancelBondMarketOrder, updateBondMarketOrderPrice } = useBonds();
  const { banks } = useNationalBanks();
  const { accounts } = useBankData();

  const [openBuy, setOpenBuy] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [marketOrders, setMarketOrders] = useState<any[]>([]);
  const [buyerAccounts, setBuyerAccounts] = useState<Record<string, string>>({});
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [publishingHolding, setPublishingHolding] = useState<any | null>(null);
  const [publishPrice, setPublishPrice] = useState('');

  const loadMarketOrders = async () => {
    const { data } = await supabase.from('bond_market_orders' as any).select('*').eq('status', 'open').order('created_at', { ascending: false });
    setMarketOrders((data as any[]) || []);
  };
  useState(() => { loadMarketOrders(); });

  const bankOf = (bondBankId: string) => banks.find(b => b.id === bondBankId);

  const activeBonds = bonds.filter(b => b.status === 'active' && Number(b.available_units) > 0);

  const handleProcessAll = async () => {
    setProcessing(true);
    try {
      const r = await processCoupons();
      toast({ title: 'Cupones procesados', description: `${r.paid} cupón(es), ${formatNumber(r.total)} PDH pagados.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setProcessing(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const selectedBond = bonds.find(b => b.id === openBuy);
  const selectedBank = selectedBond ? bankOf(selectedBond.national_bank_id) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bonos de Estado</h1>
          <p className="text-muted-foreground">Compra deuda soberana emitida por los Bancos Nacionales. Cupón semanal en PDH.</p>
        </div>
        <Button variant="outline" onClick={handleProcessAll} disabled={processing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${processing ? 'animate-spin' : ''}`} /> Procesar cupones
        </Button>
      </div>

      <Tabs defaultValue="market">
        <TabsList>
          <TabsTrigger value="market">Mercado</TabsTrigger>
          <TabsTrigger value="secondary">Mercado secundario ({marketOrders.length})</TabsTrigger>
          <TabsTrigger value="portfolio">Mi portafolio ({holdings.filter(h => h.status === 'active').length})</TabsTrigger>
        </TabsList>

        <TabsContent value="market">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Bono</TableHead>
                <TableHead>Emisor</TableHead>
                <TableHead>Denom</TableHead>
                <TableHead className="text-right">Precio u.</TableHead>
                <TableHead className="text-right">Disponibles</TableHead>
                <TableHead className="text-right">Tasa anual</TableHead>
                <TableHead className="text-right">Plazo</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {activeBonds.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Sin bonos disponibles.</TableCell></TableRow>
                ) : activeBonds.map(b => {
                  const bank = bankOf(b.national_bank_id);
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell>{bank?.name || '—'} <span className="text-muted-foreground text-xs">({bank?.country?.name})</span></TableCell>
                      <TableCell><Badge variant="outline">{b.denom_currency}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(Number(b.unit_price))}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(Number(b.available_units))}</TableCell>
                      <TableCell className="text-right tabular-nums">{(Number(b.annual_rate) * 100).toFixed(2)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{b.term_weeks}s</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => setOpenBuy(b.id)}><ShoppingCart className="h-3 w-3 mr-1" /> Comprar</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="secondary">
          <Card><CardHeader><CardTitle>Órdenes de venta</CardTitle><CardDescription>Compra bonos a otros titulares. El emisor no modifica su respaldo.</CardDescription></CardHeader><CardContent className="p-0">
            <Table><TableHeader><TableRow><TableHead>Bono</TableHead><TableHead>Unidades</TableHead><TableHead>Precio total</TableHead><TableHead>Cuenta compradora</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {marketOrders.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No hay órdenes abiertas.</TableCell></TableRow> : marketOrders.map((order) => {
                const holding = holdings.find(h => h.id === order.holding_id);
                const bond = holding ? bonds.find(b => b.id === holding.bond_id) : null;
                return <TableRow key={order.id}>
                  <TableCell>{bond?.name || order.holding_id}</TableCell>
                  <TableCell>{formatNumber(Number(order.units))}</TableCell>
                  <TableCell>{formatNumber(Number(order.units) * Number(order.ask_price_pdh))} PDH</TableCell>
                  <TableCell><Select value={buyerAccounts[order.id] || ''} onValueChange={(v) => setBuyerAccounts(a => ({ ...a, [order.id]: v }))}><SelectTrigger><SelectValue placeholder="Selecciona cuenta" /></SelectTrigger><SelectContent>{accounts.filter(a => a.id !== order.seller_account_id).map(a => <SelectItem key={a.id} value={a.id}>{a.userName} · {formatNumber(Number(a.balancePdh ?? a.balance))} PDH</SelectItem>)}</SelectContent></Select></TableCell>
                  <TableCell className="flex gap-2 justify-end">
                    {holding?.account_id === accounts.find(a => a.id === holding.account_id)?.id && <>
                      <Button size="sm" variant="outline" onClick={() => { setEditingOrder(order); setEditPrice(String(Number(order.units) * Number(order.ask_price_pdh))); }}>Cambiar precio</Button>
                      <Button size="sm" variant="ghost" onClick={async () => { try { await cancelBondMarketOrder(order.id, order.seller_account_id); toast({ title: 'Publicación cancelada' }); await loadMarketOrders(); } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); } }}>Cancelar</Button>
                    </>}
                    <Button size="sm" disabled={!buyerAccounts[order.id]} onClick={async () => { try { await executeBondMarketOrder(order.id, buyerAccounts[order.id]); toast({ title: 'Bono comprado en mercado secundario' }); await loadMarketOrders(); } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); } }}>Comprar</Button>
                  </TableCell>
                </TableRow>;
              })}
            </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="portfolio">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Bono</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                <TableHead className="text-right">Capital (PDH)</TableHead>
                <TableHead className="text-right">Intereses (PDH)</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {holdings.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No tienes bonos.</TableCell></TableRow>
                ) : holdings.map(h => {
                  const b = bonds.find(x => x.id === h.bond_id);
                  const acc = accounts.find(a => a.id === h.account_id);
                  const openOrder = marketOrders.find(o => o.holding_id === h.id && o.status === 'open');
                  return (
                    <TableRow key={h.id}>
                      <TableCell>{b?.name || '—'}</TableCell>
                      <TableCell>{acc?.userName || h.account_id} <span className="text-muted-foreground text-xs">{acc?.accountNumber}</span></TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(Number(h.units))}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(Number(h.principal_pdh))}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(Number(h.total_interest_pdh))}</TableCell>
                      <TableCell className="text-xs">{new Date(h.maturity_at).toLocaleDateString('es-ES')}</TableCell>
                      <TableCell><Badge variant={openOrder ? 'secondary' : h.status === 'active' ? 'default' : 'secondary'}>{openOrder ? 'En venta' : h.status}</Badge></TableCell>
                      <TableCell className="text-right">{h.status === 'active' && !openOrder && <Button size="sm" variant="outline" className="gap-1" onClick={() => { setPublishingHolding(h); setPublishPrice(String(Number(h.principal_pdh))); }}><Tag className="h-3 w-3" /> Publicar venta</Button>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar precio de venta</DialogTitle>
            <DialogDescription>Define el precio total de esta tenencia en PDH.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <Label>Precio total (PDH)</Label>
            <NumberInput value={editPrice} onChange={setEditPrice} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingOrder(null)}>Cancelar</Button>
            <Button onClick={async () => { const total = Number(editPrice); if (!editingOrder || total <= 0) return; try { await updateBondMarketOrderPrice(editingOrder.id, editingOrder.seller_account_id, total, Number(editingOrder.units)); toast({ title: 'Precio actualizado' }); setEditingOrder(null); await loadMarketOrders(); } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); } }}>Guardar precio</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!publishingHolding} onOpenChange={(open) => !open && setPublishingHolding(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Publicar bono para venta</DialogTitle><DialogDescription>Indica el precio total de la tenencia en PDH.</DialogDescription></DialogHeader>
          <div className="space-y-2 py-3"><Label>Precio total (PDH)</Label><NumberInput value={publishPrice} onChange={setPublishPrice} /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPublishingHolding(null)}>Cancelar</Button><Button onClick={async () => { const total = Number(publishPrice); if (!publishingHolding || total <= 0) return; try { await publishBondForSale({ holdingId: publishingHolding.id, sellerAccountId: publishingHolding.account_id, units: Number(publishingHolding.units), askPricePdh: total / Number(publishingHolding.units) }); toast({ title: 'Bono publicado en mercado secundario' }); setPublishingHolding(null); await loadMarketOrders(); } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); } }}>Publicar</Button></div>
        </DialogContent>
      </Dialog>

      <BuyBondDialog
        bond={selectedBond}
        bank={selectedBank}
        accounts={accounts}
        onClose={() => setOpenBuy(null)}
        onBuy={async (accountId, units) => {
          try {
            await buyBond({
              bondId: selectedBond!.id,
              accountId, units,
              rateToPdh: selectedBank?.metrics?.currency_rate_to_pdh ?? 1,
            });
            toast({ title: 'Bono comprado' });
            setOpenBuy(null);
            await reload();
          } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
        }}
      />
    </div>
  );
}

function BuyBondDialog({ bond, bank, accounts, onClose, onBuy }: any) {
  const [accountId, setAccountId] = useState('');
  const [units, setUnits] = useState('');

  if (!bond) return null;
  const u = parseFloat(units) || 0;
  const principalDenom = u * Number(bond.unit_price);
  const principalPdh = denomToPdh(principalDenom, bond.denom_mode, bond.denom_mode === 'kyd' ? (getExchangeRates()['KYD'] ?? 1) : (bank?.metrics?.currency_rate_to_pdh ?? 1));

  return (
    <Dialog open={!!bond} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Comprar bono: {bond.name}</DialogTitle>
          <DialogDescription>Emisor: {bank?.name || '—'} · Tasa {(Number(bond.annual_rate) * 100).toFixed(2)}% anual · {bond.term_weeks} semanas</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2"><Label>Cuenta MAHR (paga en PDH)</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
              <SelectContent>
                {accounts.filter((a: any) => a.id !== 'bank-main').map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.userName} · {a.accountNumber} ({formatNumber(a.balance)} PDH)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Unidades (disponibles: {formatNumber(Number(bond.available_units))})</Label>
            <NumberInput value={units} onChange={setUnits} />
          </div>
          <div className="rounded-md border p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Capital ({bond.denom_currency})</span><span className="tabular-nums font-medium">{formatNumber(principalDenom)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Equivalente PDH a pagar</span><span className="tabular-nums font-medium">{formatNumber(principalPdh)} PDH</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cupón semanal estimado</span><span className="tabular-nums font-medium">{formatNumber(principalPdh * Number(bond.annual_rate) / 52)} PDH</span></div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!accountId || !u || u > Number(bond.available_units)} onClick={() => onBuy(accountId, u)}>Confirmar compra</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
