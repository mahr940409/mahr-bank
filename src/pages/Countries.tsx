import { useState } from 'react';
import { useCountriesData, CurrencyRecord, computeExchangeRate } from '@/hooks/useCountriesData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { NumberInput } from '@/components/ui/number-input';
import { toast } from '@/hooks/use-toast';
import { Loader2, Globe, Coins, Plus, Pencil, Trash2, Lock, RefreshCw, Download, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { loadExchangeRates } from '@/lib/currencyUtils';
import { formatNumber } from '@/lib/currencyUtils';

export default function Countries() {
  const {
    currencies, countries, loading,
    createCurrency, updateExchangeRate, updateCurrencyEconomy,
    createCountry, deleteCountry, deleteCurrency, reload,
  } = useCountriesData();

  const [showCurrencyDialog, setShowCurrencyDialog] = useState(false);
  const [showCountryDialog, setShowCountryDialog] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<CurrencyRecord | null>(null);
  const [economyCurrency, setEconomyCurrency] = useState<CurrencyRecord | null>(null);

  // Currency form
  const [curName, setCurName] = useState('');
  const [curSymbol, setCurSymbol] = useState('');
  const [curRate, setCurRate] = useState('1');
  const [curFixed, setCurFixed] = useState(false);

  // Country form
  const [countryName, setCountryName] = useState('');
  const [countryCurrencyId, setCountryCurrencyId] = useState('');

  // Edit rate
  const [editRate, setEditRate] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);

  // Economy form
  const [ecoReserves, setEcoReserves] = useState('0');
  const [ecoPrinted, setEcoPrinted] = useState('0');
  const [ecoBurned, setEcoBurned] = useState('0');
  const [ecoInitial, setEcoInitial] = useState('1');
  const [savingEconomy, setSavingEconomy] = useState(false);
  const [reserveDelta, setReserveDelta] = useState('');
  const [printDelta, setPrintDelta] = useState('');

  const adjustReserves = (sign: 1 | -1) => {
    const amt = parseFloat(reserveDelta) || 0;
    if (amt <= 0) return;
    const current = parseFloat(ecoReserves) || 0;
    const next = Math.max(0, current + sign * amt);
    setEcoReserves(String(next));
    setReserveDelta('');
  };

  const adjustPrinted = (sign: 1 | -1) => {
    const amt = parseFloat(printDelta) || 0;
    if (amt <= 0) return;
    if (sign === 1) {
      const current = parseFloat(ecoPrinted) || 0;
      setEcoPrinted(String(current + amt));
    } else {
      const current = parseFloat(ecoBurned) || 0;
      setEcoBurned(String(current + amt));
    }
    setPrintDelta('');
  };

  const openEconomyDialog = (cur: CurrencyRecord) => {
    setEconomyCurrency(cur);
    setEcoReserves(String(cur.pdh_reserves ?? 0));
    setEcoPrinted(String(cur.printed_amount ?? 0));
    setEcoBurned(String(cur.burned_amount ?? 0));
    setEcoInitial(String(cur.initial_units_per_pdh ?? 1));
  };

  const handleSaveEconomy = async () => {
    if (!economyCurrency) return;
    setSavingEconomy(true);
    try {
      await updateCurrencyEconomy(economyCurrency.id, {
        pdh_reserves: parseFloat(ecoReserves) || 0,
        printed_amount: parseFloat(ecoPrinted) || 0,
        burned_amount: parseFloat(ecoBurned) || 0,
        initial_units_per_pdh: parseFloat(ecoInitial) || 1,
      });
      await loadExchangeRates();
      toast({ title: 'Economía actualizada', description: `${economyCurrency.iso_symbol} recalculada según reservas y circulación.` });
      setEconomyCurrency(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSavingEconomy(false);
    }
  };

  const handleSyncRates = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-exchange-rates');
      if (error) throw error;
      if (data?.success) {
        await loadExchangeRates();
        await reload();
        toast({
          title: 'Tasas sincronizadas',
          description: `${data.ratesUpdated} moneda(s) actualizada(s) desde la API externa.`,
        });
      } else {
        throw new Error(data?.error || 'Error desconocido');
      }
    } catch (e: any) {
      toast({ title: 'Error al sincronizar', description: e.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const handleImportFromAPI = async () => {
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-exchange-rates', {
        body: { action: 'import' },
      });
      if (error) throw error;
      if (data?.success) {
        await loadExchangeRates();
        await reload();
        const parts = [];
        if (data.imported?.currencies > 0) parts.push(`${data.imported.currencies} moneda(s)`);
        if (data.imported?.countries > 0) parts.push(`${data.imported.countries} país(es)`);
        if (data.ratesUpdated > 0) parts.push(`${data.ratesUpdated} tasa(s) actualizada(s)`);
        toast({
          title: 'Importación completada',
          description: parts.length > 0 ? `Importados: ${parts.join(', ')}` : 'Todo ya estaba actualizado.',
        });
      } else {
        throw new Error(data?.error || 'Error desconocido');
      }
    } catch (e: any) {
      toast({ title: 'Error al importar', description: e.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleCreateCurrency = async () => {
    try {
      await createCurrency(curName, curSymbol.toUpperCase(), parseFloat(curRate), curFixed);
      toast({ title: 'Moneda creada', description: `${curName} (${curSymbol.toUpperCase()}) registrada exitosamente.` });
      setCurName(''); setCurSymbol(''); setCurRate('1'); setCurFixed(false);
      setShowCurrencyDialog(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleCreateCountry = async () => {
    try {
      await createCountry(countryName, countryCurrencyId);
      toast({ title: 'País creado', description: `${countryName} registrado exitosamente.` });
      setCountryName(''); setCountryCurrencyId('');
      setShowCountryDialog(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleUpdateRate = async () => {
    if (!editingCurrency) return;
    try {
      await updateExchangeRate(editingCurrency.id, parseFloat(editRate));
      toast({ title: 'Tasa actualizada', description: `${editingCurrency.iso_symbol} actualizada a ${editRate} PDH.` });
      setEditingCurrency(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleDeleteCountry = async (id: string, name: string) => {
    try {
      await deleteCountry(id);
      toast({ title: 'País eliminado', description: `${name} eliminado.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleDeleteCurrency = async (id: string, name: string) => {
    const usedByCountry = countries.some(c => c.currency_id === id);
    if (usedByCountry) {
      toast({ title: 'Error', description: 'Esta moneda está en uso por un país.', variant: 'destructive' });
      return;
    }
    try {
      await deleteCurrency(id);
      toast({ title: 'Moneda eliminada', description: `${name} eliminada.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Países y Monedas</h1>
          <p className="text-muted-foreground">Gestión de países, monedas y tasas de cambio</p>
        </div>
        <Button onClick={handleImportFromAPI} disabled={importing}>
          {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
          Importar desde API
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monedas Registradas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{currencies.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Países Registrados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{countries.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tasas Fijas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{currencies.filter(c => c.is_fixed_rate).length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Currencies Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-primary" />
              Monedas
            </CardTitle>
            <CardDescription>Monedas FIAT registradas en el sistema</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSyncRates} size="sm" variant="outline" disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? 'animate-spin' : ''}`} /> Sincronizar Tasas
            </Button>
            <Button onClick={() => setShowCurrencyDialog(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Nueva Moneda
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Símbolo ISO</TableHead>
                <TableHead>Paridad (1 moneda = X PDH)</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currencies.map(cur => (
                <TableRow key={cur.id}>
                  <TableCell className="font-medium">{cur.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{cur.iso_symbol}</Badge>
                  </TableCell>
                  <TableCell>{formatNumber(cur.exchange_rate_to_pdh)} PDH</TableCell>
                  <TableCell>
                    {cur.is_fixed_rate ? (
                      <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" /> Fija</Badge>
                    ) : (
                      <Badge>Variable</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {!cur.is_fixed_rate && (
                      <>
                        <Button
                          variant="ghost" size="icon"
                          title="Gestionar economía"
                          onClick={() => openEconomyDialog(cur)}
                        >
                          <TrendingUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          title="Editar tasa manual"
                          onClick={() => { setEditingCurrency(cur); setEditRate(String(cur.exchange_rate_to_pdh)); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => handleDeleteCurrency(cur.id, cur.name)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Countries Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Países
            </CardTitle>
            <CardDescription>Países registrados y su moneda asociada</CardDescription>
          </div>
          <Button onClick={() => setShowCountryDialog(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Nuevo País
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>País</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead>Símbolo ISO</TableHead>
                <TableHead>Paridad PDH</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {countries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No hay países registrados
                  </TableCell>
                </TableRow>
              ) : (
                countries.map(country => (
                  <TableRow key={country.id}>
                    <TableCell className="font-medium">{country.name}</TableCell>
                    <TableCell>{country.currency?.name || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{country.currency?.iso_symbol || '—'}</Badge>
                    </TableCell>
                    <TableCell>
                      {country.currency ? formatNumber(country.currency.exchange_rate_to_pdh) + ' PDH' : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => handleDeleteCountry(country.id, country.name)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Currency Dialog */}
      <Dialog open={showCurrencyDialog} onOpenChange={setShowCurrencyDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Moneda</DialogTitle>
            <DialogDescription>Registrar una nueva moneda FIAT en el sistema</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre de la moneda</Label>
              <Input placeholder="Ej: Dólar Estadounidense" value={curName} onChange={e => setCurName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Símbolo ISO</Label>
              <Input placeholder="Ej: USD" value={curSymbol} onChange={e => setCurSymbol(e.target.value)} maxLength={5} />
            </div>
            <div className="space-y-2">
              <Label>Paridad inicial (1 unidad = X PDH)</Label>
              <Input type="number" placeholder="1" value={curRate} onChange={e => setCurRate(e.target.value)} min="0" step="0.01" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={curFixed} onCheckedChange={setCurFixed} />
              <Label>Tasa fija (no cambia con eventos)</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCurrencyDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateCurrency} disabled={!curName || !curSymbol || !curRate}>Crear Moneda</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Country Dialog */}
      <Dialog open={showCountryDialog} onOpenChange={setShowCountryDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo País</DialogTitle>
            <DialogDescription>Registrar un nuevo país y asignar su moneda</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre del país</Label>
              <Input placeholder="Ej: Venezuela" value={countryName} onChange={e => setCountryName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Moneda</Label>
              <Select value={countryCurrencyId} onValueChange={setCountryCurrencyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar moneda" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map(cur => (
                    <SelectItem key={cur.id} value={cur.id}>
                      {cur.name} ({cur.iso_symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCountryDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateCountry} disabled={!countryName || !countryCurrencyId}>Crear País</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Exchange Rate Dialog */}
      <Dialog open={!!editingCurrency} onOpenChange={(open) => !open && setEditingCurrency(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modificar Tasa de Cambio</DialogTitle>
            <DialogDescription>
              {editingCurrency?.name} ({editingCurrency?.iso_symbol})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nueva paridad (1 {editingCurrency?.iso_symbol} = X PDH)</Label>
              <Input type="number" value={editRate} onChange={e => setEditRate(e.target.value)} min="0" step="0.01" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingCurrency(null)}>Cancelar</Button>
            <Button onClick={handleUpdateRate} disabled={!editRate || parseFloat(editRate) <= 0}>Actualizar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Economy Dialog */}
      <Dialog open={!!economyCurrency} onOpenChange={(open) => !open && setEconomyCurrency(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Economía interna
            </DialogTitle>
            <DialogDescription>
              {economyCurrency?.name} ({economyCurrency?.iso_symbol}) — Calcula el valor de la moneda según reservas y circulación.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Valor inicial (1 PDH = X {economyCurrency?.iso_symbol})</Label>
              <NumberInput value={ecoInitial} onChange={setEcoInitial} placeholder="1000" />
              <p className="text-xs text-muted-foreground">Paridad base usada si no hay reservas o circulación.</p>
            </div>
            <div className="space-y-2 rounded-md border p-3">
              <Label>Reservas en PDH</Label>
              <NumberInput value={ecoReserves} onChange={setEcoReserves} placeholder="0" />
              <div className="flex gap-2 items-end pt-1">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Cantidad a agregar/sacar</Label>
                  <NumberInput value={reserveDelta} onChange={setReserveDelta} placeholder="0" />
                </div>
                <Button type="button" size="sm" onClick={() => adjustReserves(1)} disabled={!reserveDelta || parseFloat(reserveDelta) <= 0}>Agregar</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => adjustReserves(-1)} disabled={!reserveDelta || parseFloat(reserveDelta) <= 0}>Sacar</Button>
              </div>
            </div>
            <div className="space-y-2 rounded-md border p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Moneda impresa</Label>
                  <NumberInput value={ecoPrinted} onChange={setEcoPrinted} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label>Moneda quemada</Label>
                  <NumberInput value={ecoBurned} onChange={setEcoBurned} placeholder="0" />
                </div>
              </div>
              <div className="flex gap-2 items-end pt-1">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Cantidad a imprimir/quemar</Label>
                  <NumberInput value={printDelta} onChange={setPrintDelta} placeholder="0" />
                </div>
                <Button type="button" size="sm" onClick={() => adjustPrinted(1)} disabled={!printDelta || parseFloat(printDelta) <= 0}>Imprimir</Button>
                <Button type="button" size="sm" variant="destructive" onClick={() => adjustPrinted(-1)} disabled={!printDelta || parseFloat(printDelta) <= 0}>Quemar</Button>
              </div>
            </div>

            {(() => {
              const printed = parseFloat(ecoPrinted) || 0;
              const burned = parseFloat(ecoBurned) || 0;
              const reserves = parseFloat(ecoReserves) || 0;
              const initial = parseFloat(ecoInitial) || 1;
              const circulation = Math.max(0, printed - burned);
              const rate = computeExchangeRate({
                pdh_reserves: reserves,
                printed_amount: printed,
                burned_amount: burned,
                initial_units_per_pdh: initial,
              });
              const unitsPerPdh = rate > 0 ? 1 / rate : 0;
              const prevRate = economyCurrency?.exchange_rate_to_pdh || 0;
              const delta = prevRate > 0 ? ((rate - prevRate) / prevRate) * 100 : 0;
              return (
                <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Circulación</span>
                    <span className="font-medium">{formatNumber(circulation)} {economyCurrency?.iso_symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">1 PDH equivale a</span>
                    <span className="font-medium">{formatNumber(unitsPerPdh)} {economyCurrency?.iso_symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">1 {economyCurrency?.iso_symbol} equivale a</span>
                    <span className="font-medium">{formatNumber(rate)} PDH</span>
                  </div>
                  {prevRate > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Variación vs. tasa actual</span>
                      <span className={`font-medium ${delta >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {delta >= 0 ? '+' : ''}{delta.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEconomyCurrency(null)}>Cancelar</Button>
            <Button onClick={handleSaveEconomy} disabled={savingEconomy}>
              {savingEconomy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Guardar y recalcular
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
