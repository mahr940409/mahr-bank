import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBankData } from "@/hooks/useBankData";
import { useBankSettings, getCDTRates } from "@/hooks/useBankSettings";
import { supabase } from "@/integrations/supabase/client";
import { CDT, calculateCDTReturn, InterestPayoutFrequency } from "@/types/cdt";
import { Currency } from "@/types/bank";
import { formatCurrency, formatNumber, convertToPDH } from "@/lib/currencyUtils";
import { CreateCDTDialog } from "@/components/bank/CreateCDTDialog";
import { Loader2, Plus, TrendingUp, Calendar, Percent, Banknote, AlertCircle, Play } from "lucide-react";
const InfinityIcon = () => <span className="text-xs font-bold">∞</span>;
import { toast } from "sonner";
import { addWeeks, format, differenceInDays, isPast } from "date-fns";
import { es } from "date-fns/locale";

const FREQUENCY_LABELS: Record<InterestPayoutFrequency, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  at_maturity: 'Al vencimiento',
};

export default function CDTs() {
  const { accounts, loading: bankLoading } = useBankData();
  const { loading: settingsLoading } = useBankSettings();
  const [cdts, setCdts] = useState<CDT[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [processingInterest, setProcessingInterest] = useState(false);

  const handleProcessInterest = async () => {
    setProcessingInterest(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/process-cdt-interest`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
          body: JSON.stringify({ time: 'manual' }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      toast.success(`Intereses procesados: ${data.processed} CDT(s)`);
      loadCDTs();
    } catch (error: any) {
      toast.error(error?.message || 'Error al procesar intereses');
    } finally {
      setProcessingInterest(false);
    }
  };

  const loadCDTs = async () => {
    try {
      const { data, error } = await supabase
        .from('cdts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setCdts(data?.map(cdt => {
        const row = cdt as any;
        return {
          id: cdt.id,
          accountId: cdt.account_id,
          userId: cdt.user_id,
          amount: cdt.amount,
          currency: cdt.currency as Currency,
          interestRate: cdt.interest_rate,
          termWeeks: cdt.term_months,
          startDate: new Date(cdt.start_date),
          maturityDate: new Date(cdt.maturity_date),
          status: cdt.status as CDT['status'],
          finalAmount: cdt.final_amount,
          earlyWithdrawalPenalty: cdt.early_withdrawal_penalty,
          interestPayoutFrequency: (row.interest_payout_frequency || 'at_maturity') as InterestPayoutFrequency,
          isIndefinite: row.is_indefinite || false,
          createdAt: new Date(cdt.created_at),
        };
      }) || []);
    } catch (error) {
      console.error('Error loading CDTs:', error);
      toast.error('Error al cargar los CDTs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCDTs();
  }, []);

  const handleCreateCDT = async (accountId: string, amount: number, currency: string, termWeeks: number, frequency: InterestPayoutFrequency, isIndefinite: boolean) => {
    try {
      const account = accounts.find(a => a.id === accountId);
      if (!account) throw new Error('Cuenta no encontrada');

      if (account.balance < amount) {
        toast.error('Saldo insuficiente');
        return;
      }

      const rates = getCDTRates();
      const rate = isIndefinite ? (rates[8] || 0.06) : (rates[termWeeks] || 0.06);
      const finalAmount = isIndefinite ? amount : calculateCDTReturn(amount, rate, termWeeks);
      const startDate = new Date();
      const maturityDate = isIndefinite ? addWeeks(startDate, 9999) : addWeeks(startDate, termWeeks);

      const { error: cdtError } = await supabase.rpc('create_cdt_atomic' as any, {
        p_account_id: accountId, p_user_id: account.userId, p_amount: amount, p_currency: currency,
        p_interest_rate: rate, p_term_weeks: termWeeks, p_start_date: startDate.toISOString(),
        p_maturity_date: maturityDate.toISOString(), p_final_amount: finalAmount,
        p_penalty: 0.1, p_frequency: frequency, p_is_indefinite: isIndefinite,
      } as any);
      if (cdtError) throw new Error(`Error al crear CDT: ${cdtError.message}`);

      toast.success('CDT creado exitosamente');
      loadCDTs();
    } catch (error: any) {
      console.error('Error creating CDT:', error);
      toast.error(error?.message || 'Error al crear el CDT');
    }
  };

  const handleLiquidate = async (cdt: CDT, early: boolean = false) => {
    try {
      const { data: returnAmount, error } = await supabase.rpc('liquidate_cdt_atomic' as any, {
        p_cdt_id: cdt.id,
        p_early: early,
      } as any);
      if (error) throw error;

      const successMsg = cdt.isIndefinite
        ? `CDT cancelado. Devuelto: ${formatNumber(Number(returnAmount))} ${cdt.currency}`
        : early
          ? `CDT cancelado con penalización. Devuelto: ${formatNumber(Number(returnAmount))} ${cdt.currency} (de ${formatNumber(cdt.amount)} ${cdt.currency})`
          : `CDT liquidado. Recibido: ${formatNumber(Number(returnAmount))} ${cdt.currency}`;
      toast.success(successMsg);
      loadCDTs();
    } catch (error: any) {
      console.error('Error liquidating CDT:', error);
      toast.error(error?.message || 'Error al liquidar el CDT');
    }
  };

  const getStatusBadge = (cdt: CDT) => {
    if (cdt.status === 'liquidated') return <Badge variant="secondary">Liquidado</Badge>;
    if (cdt.status === 'cancelled') return <Badge variant="destructive">Cancelado</Badge>;
    if (cdt.isIndefinite) return <Badge className="bg-blue-600">Indefinido</Badge>;
    const isMatured = isPast(cdt.maturityDate);
    if (isMatured) return <Badge className="bg-green-600">Vencido</Badge>;
    return <Badge>Activo</Badge>;
  };

  const activeCdts = cdts.filter(c => c.status === 'active');
  const totalInvested = activeCdts.reduce((sum, c) => sum + convertToPDH(c.amount, c.currency), 0);
  const totalProjected = activeCdts.reduce((sum, c) => sum + convertToPDH(c.isIndefinite ? c.amount : c.finalAmount, c.currency), 0);

  if (loading || bankLoading || settingsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Certificados de Depósito</h1>
          <p className="text-muted-foreground">Gestiona tus inversiones a plazo fijo</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleProcessInterest} disabled={processingInterest || activeCdts.length === 0}>
            {processingInterest ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Procesar Intereses
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo CDT
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Banknote className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Invertido</p>
                <p className="text-xl font-bold">{formatNumber(totalInvested)} PDH</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">CDTs Activos</p>
                <p className="text-xl font-bold">{activeCdts.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Percent className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ganancia Esperada</p>
                <p className="text-xl font-bold text-green-600">+{formatNumber(totalProjected - totalInvested)} PDH</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        {cdts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">No hay CDTs</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Crea tu primer certificado de depósito para comenzar a ganar intereses
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Crear CDT
              </Button>
            </CardContent>
          </Card>
        ) : (
          cdts.map(cdt => {
            const account = accounts.find(a => a.id === cdt.accountId);
            const daysRemaining = cdt.isIndefinite ? null : differenceInDays(cdt.maturityDate, new Date());
            const isMatured = cdt.isIndefinite ? false : isPast(cdt.maturityDate);

            return (
              <Card key={cdt.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      {cdt.isIndefinite ? (
                        <span className="flex items-center gap-1">CDT Indefinido ∞</span>
                      ) : (
                        `CDT ${cdt.termWeeks} semanas`
                      )}
                    </CardTitle>
                    {getStatusBadge(cdt)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Capital</p>
                      <p className="font-semibold">{formatCurrency(cdt.amount, cdt.currency)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Tasa</p>
                      <p className="font-semibold">{(cdt.interestRate * 100).toFixed(1)}% anual</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Pago intereses</p>
                      <p className="font-semibold">{FREQUENCY_LABELS[cdt.interestPayoutFrequency]}</p>
                    </div>
                    {cdt.isIndefinite ? (
                      <div>
                        <p className="text-sm text-muted-foreground">Duración</p>
                        <p className="font-semibold flex items-center gap-1">
                          ∞ Indefinido
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-muted-foreground">Vencimiento</p>
                        <p className="font-semibold flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {format(cdt.maturityDate, "dd MMM yyyy", { locale: es })}
                        </p>
                      </div>
                    )}
                  </div>

                  {!cdt.isIndefinite && !isMatured && cdt.status === 'active' && (
                    <div className="text-sm text-muted-foreground mb-2">
                      Al vencimiento: <span className="text-green-600 font-medium">{formatCurrency(cdt.finalAmount, cdt.currency)}</span>
                    </div>
                  )}

                  {cdt.status === 'active' && (
                    <div className="flex items-center justify-between pt-3 border-t">
                      <div className="text-sm">
                        {cdt.isIndefinite ? (
                          <span className="text-muted-foreground">
                            Cancela cuando quieras para recuperar tu capital
                          </span>
                        ) : isMatured ? (
                          <span className="text-green-600 font-medium">¡Listo para liquidar!</span>
                        ) : (
                          <span className="text-muted-foreground">
                            Faltan {daysRemaining} días para el vencimiento
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {cdt.isIndefinite && (
                          <Button size="sm" onClick={() => handleLiquidate(cdt, false)}>
                            Cancelar CDT
                          </Button>
                        )}
                        {!cdt.isIndefinite && !isMatured && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleLiquidate(cdt, true)}
                          >
                            <AlertCircle className="h-4 w-4 mr-1" />
                            Retiro anticipado
                          </Button>
                        )}
                        {!cdt.isIndefinite && isMatured && (
                          <Button size="sm" onClick={() => handleLiquidate(cdt, false)}>
                            Liquidar
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground mt-2">
                    Cuenta: {account?.userName} ({account?.accountNumber})
                  </p>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <CreateCDTDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        accounts={accounts}
        onCreateCDT={handleCreateCDT}
      />
    </div>
  );
}
