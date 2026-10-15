import { useState } from 'react';
import { useCommoditiesData } from '@/hooks/useCommoditiesData';
import { useBankData } from '@/hooks/useBankData';
import { formatNumber } from '@/lib/currencyUtils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { RefreshCw, TrendingUp, TrendingDown, Minus, Gem, ShoppingCart, DollarSign, ArrowDownToLine } from 'lucide-react';
import { NumberInput } from '@/components/ui/number-input';
import { Skeleton } from '@/components/ui/skeleton';

type DialogMode = 'deposit' | 'buy' | null;

export default function Commodities() {
  const { commodities, deposits, loading, syncPrices, updatePrice, depositCommodity, buyCommodity, liquidateDeposit } = useCommoditiesData();
  const { accounts } = useBankData();
  const [syncing, setSyncing] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedCommodity, setSelectedCommodity] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [units, setUnits] = useState('');
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});

  const handleSync = async () => {
    setSyncing(true);
    await syncPrices();
    setSyncing(false);
  };

  const handleSubmit = async () => {
    if (!selectedCommodity || !selectedAccount || !units || Number(units) <= 0) return;
    const account = accounts.find((a) => a.id === selectedAccount);
    if (dialogMode === 'deposit') {
      await depositCommodity(selectedAccount, selectedCommodity, Number(units), account?.currency || 'PDH');
    } else {
      await buyCommodity(selectedAccount, selectedCommodity, Number(units), account?.currency || 'PDH');
    }
    closeDialog();
  };

  const closeDialog = () => {
    setDialogMode(null);
    setUnits('');
    setSelectedCommodity('');
    setSelectedAccount('');
  };

  const trendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const activeDeposits = deposits.filter((d) => d.status === 'active');

  const selectedCommodityObj = commodities.find((c) => c.id === selectedCommodity);
  const estimatedTotal = selectedCommodityObj && units ? Number(units) * selectedCommodityObj.priceInKyd : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Commodities</h1>
          <p className="text-muted-foreground">Depósitos e inversiones en recursos valiosos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Recargar
          </Button>
          <Button variant="outline" onClick={() => setDialogMode('deposit')}>
            <ArrowDownToLine className="h-4 w-4 mr-2" />
            Depositar
          </Button>
          <Button onClick={() => setDialogMode('buy')}>
            <ShoppingCart className="h-4 w-4 mr-2" />
            Comprar
          </Button>
        </div>
      </div>

      {/* Commodity Prices */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {commodities.map((c) => (
          <Card key={c.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{c.name}</CardTitle>
              <Badge variant="outline">{c.code}</Badge>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Gem className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{formatNumber(c.priceInKyd)}</span>
                <span className="text-sm text-muted-foreground">PDH</span>
                {trendIcon(c.trend)}
              </div>
              <div className="flex gap-2 mt-3">
                <NumberInput
                  value={priceDraft[c.id] ?? String(c.priceInKyd)}
                  onChange={(v: string) => setPriceDraft((d) => ({ ...d, [c.id]: v }))}
                />
                <Button size="sm" onClick={async () => { await updatePrice(c.id, Number(priceDraft[c.id] ?? c.priceInKyd)); setPriceDraft((d) => { const n = { ...d }; delete n[c.id]; return n; }); }}>
                  Actualizar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Active Deposits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Depósitos Activos
          </CardTitle>
          <CardDescription>Tus commodities depositados en el banco</CardDescription>
        </CardHeader>
        <CardContent>
          {activeDeposits.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No tienes depósitos de commodities activos</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Commodity</TableHead>
                  <TableHead>Unidades</TableHead>
                  <TableHead>Precio Compra</TableHead>
                  <TableHead>Precio Actual</TableHead>
                  <TableHead>Valor Total</TableHead>
                  <TableHead>Ganancia/Pérdida</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeDeposits.map((d) => {
                  const currentPrice = d.commodity?.priceInKyd ?? 0;
                  const currentValue = d.units * currentPrice;
                  const profit = currentValue - d.totalValueAtDeposit;
                  const profitPercent = d.totalValueAtDeposit > 0 ? (profit / d.totalValueAtDeposit) * 100 : 0;
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        {d.commodity?.name ?? 'N/A'} ({d.commodity?.code})
                      </TableCell>
                      <TableCell>{formatNumber(d.units)}</TableCell>
                      <TableCell>{formatNumber(d.priceAtDeposit)} PDH</TableCell>
                      <TableCell>{formatNumber(currentPrice)} PDH</TableCell>
                      <TableCell className="font-semibold">{formatNumber(currentValue)} PDH</TableCell>
                      <TableCell>
                        <span className={profit >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                          {profit >= 0 ? '+' : ''}{formatNumber(profit)} PDH ({profitPercent.toFixed(1)}%)
                        </span>
                      </TableCell>
                      <TableCell>{new Date(d.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => liquidateDeposit(d.id)}>
                          Liquidar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Deposit / Buy Dialog */}
      <Dialog open={dialogMode !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'deposit' ? 'Depositar Commodity' : 'Comprar Commodity'}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'deposit'
                ? 'Deposita un recurso valioso en el banco. El valor se acredita a tu cuenta.'
                : 'Compra un recurso valioso como inversión. El valor se deduce de tu cuenta.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Cuenta</label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger><SelectValue placeholder="Selecciona cuenta" /></SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {[...accounts].sort((a, b) => a.userName.localeCompare(b.userName)).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="truncate block max-w-[280px]">{a.userName} ({formatNumber(a.balance)} {a.currency})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Commodity</label>
              <Select value={selectedCommodity} onValueChange={setSelectedCommodity}>
                <SelectTrigger><SelectValue placeholder="Selecciona recurso" /></SelectTrigger>
                <SelectContent>
                  {commodities.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.code}) - {formatNumber(c.priceInKyd)} PDH
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Unidades</label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                placeholder="Cantidad de unidades"
              />
            </div>
            {estimatedTotal > 0 && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <p>
                  {dialogMode === 'deposit'
                    ? <>Valor a acreditar: <strong className="text-green-600">+{formatNumber(estimatedTotal)} PDH</strong></>
                    : <>Costo a deducir: <strong className="text-red-600">-{formatNumber(estimatedTotal)} PDH</strong></>}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!selectedCommodity || !selectedAccount || !units || Number(units) <= 0}>
              {dialogMode === 'deposit' ? 'Depositar' : 'Comprar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
