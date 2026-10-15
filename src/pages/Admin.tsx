import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { useBankData } from "@/hooks/useBankData";
import { useBankSettings } from "@/hooks/useBankSettings";
import { CapitalInjectionDialog } from "@/components/bank/CapitalInjectionDialog";
import { convertFromPDH, formatNumber } from "@/lib/currencyUtils";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, Settings, Wallet, Percent, Building2, TrendingUp,
  Pencil, Check, X, Coins, Users, Briefcase, User, Receipt,
  PiggyBank, Landmark, ArrowRightLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Admin() {
  const { bankMainAccount, accounts, loading: bankLoading, injectCapital } = useBankData();
  const { settings, loading: settingsLoading, updateSettings } = useBankSettings();
  const { toast } = useToast();
  const [isCapitalDialogOpen, setIsCapitalDialogOpen] = useState(false);
  const [processingSavings, setProcessingSavings] = useState(false);

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const loading = bankLoading || settingsLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-muted-foreground">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  const bankBalancePDH = bankMainAccount?.balance ?? 0;

  const startEdit = (field: string, currentValue: number) => {
    setEditingField(field);
    setEditValue(String(currentValue));
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const saveEdit = async (field: string) => {
    const val = parseFloat(editValue);
    if (isNaN(val) || val < 0) {
      toast({ title: 'Error', description: 'Valor inválido', variant: 'destructive' });
      return;
    }

    const fieldMap: Record<string, string> = {
      depositCommission: 'depositCommission',
      businessTransferCommission: 'businessTransferCommission',
      internationalTransferCommission: 'internationalTransferCommission',
      personalLoanInterestRate: 'personalLoanInterestRate',
      businessLoanInterestRate: 'businessLoanInterestRate',
      latePaymentPenaltyRate: 'latePaymentPenaltyRate',
      cdtRate4w: 'cdtRate4w',
      cdtRate8w: 'cdtRate8w',
      cdtRate12w: 'cdtRate12w',
      cdtRate24w: 'cdtRate24w',
      savingsWeeklyInterestRate: 'savingsWeeklyInterestRate',
    };

    const isPercentageField = field.includes('Interest');
    const valueToSave = isPercentageField ? val : val / 100;

    const success = await updateSettings({ [fieldMap[field]]: valueToSave });
    if (success) {
      toast({ title: 'Actualizado', description: 'Configuración guardada exitosamente' });
    } else {
      toast({ title: 'Error', description: 'No se pudo guardar', variant: 'destructive' });
    }
    setEditingField(null);
    setEditValue('');
  };

  const RateRow = ({
    field, icon: Icon, label, description, currentValue, isPercentage,
  }: {
    field: string;
    icon: any;
    label: string;
    description: string;
    currentValue: number;
    isPercentage: boolean;
  }) => {
    const displayValue = isPercentage ? currentValue : currentValue * 100;
    const isEditing = editingField === field;

    return (
      <div className="group flex items-center justify-between gap-4 p-4 rounded-lg border bg-card hover:bg-muted/40 transition-colors">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-medium leading-tight">{label}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        {isEditing ? (
          <div className="flex items-center gap-1 shrink-0">
            <NumberInput value={editValue} onChange={setEditValue} className="w-24 text-right" />
            <span className="text-sm text-muted-foreground px-1">%</span>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => saveEdit(field)}>
              <Check className="h-4 w-4 text-primary" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}>
              <X className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="text-base font-bold px-3 py-1 tabular-nums">
              {displayValue.toFixed(2)}%
            </Badge>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => startEdit(field, displayValue)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  const StatTile = ({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) => (
    <div className="p-4 rounded-lg border bg-card">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Administración</h1>
          <p className="text-muted-foreground">Configuración y gestión del sistema bancario</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIsCapitalDialogOpen(true)}>
            <TrendingUp className="h-4 w-4 mr-2" />
            Inyectar Capital
          </Button>
          <Button
            variant="outline"
            disabled={processingSavings}
            onClick={async () => {
              setProcessingSavings(true);
              try {
                const { data, error } = await supabase.functions.invoke('process-savings-interest');
                if (error) throw error;
                toast({ title: 'Intereses procesados', description: data?.message || 'Completado' });
              } catch (e: any) {
                toast({ title: 'Error', description: e.message, variant: 'destructive' });
              } finally {
                setProcessingSavings(false);
              }
            }}
          >
            {processingSavings ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Coins className="h-4 w-4 mr-2" />}
            Procesar Intereses
          </Button>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={Users} label="Cuentas totales" value={accounts.length} />
        <StatTile icon={Briefcase} label="Cuentas empresa" value={accounts.filter(a => a.type === 'business').length} />
        <StatTile icon={User} label="Cuentas personales" value={accounts.filter(a => a.type === 'personal').length} />
        <StatTile icon={Receipt} label="Cuotas mensuales (PDH)" value={formatNumber(accounts.reduce((s, a) => s + a.monthlyFee, 0))} />
      </div>

      <Tabs defaultValue="treasury" className="space-y-4">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full">
          <TabsTrigger value="treasury" className="gap-2">
            <Building2 className="h-4 w-4" /> <span className="hidden sm:inline">Tesorería</span>
          </TabsTrigger>
          <TabsTrigger value="rates" className="gap-2">
            <Percent className="h-4 w-4" /> <span className="hidden sm:inline">Tasas</span>
          </TabsTrigger>
          <TabsTrigger value="cdt" className="gap-2">
            <TrendingUp className="h-4 w-4" /> <span className="hidden sm:inline">CDT</span>
          </TabsTrigger>
          <TabsTrigger value="commissions" className="gap-2">
            <ArrowRightLeft className="h-4 w-4" /> <span className="hidden sm:inline">Comisiones</span>
          </TabsTrigger>
        </TabsList>

        {/* Treasury */}
        <TabsContent value="treasury">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" /> Cuenta Principal del Banco
              </CardTitle>
              <CardDescription>{bankMainAccount?.accountNumber}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="p-4 rounded-lg border bg-card">
                  <p className="text-sm text-muted-foreground">KYD</p>
                  <p className="text-xl font-semibold tabular-nums mt-1">{formatNumber(convertFromPDH(bankBalancePDH, 'KYD'))}</p>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <p className="text-sm text-muted-foreground">PDH</p>
                  <p className="text-xl font-semibold tabular-nums mt-1">{formatNumber(bankBalancePDH)}</p>
                </div>
                <div className="p-4 rounded-lg border border-primary/30 bg-primary/10">
                  <p className="text-sm text-primary/80">Total (PDH)</p>
                  <p className="text-xl font-bold text-primary tabular-nums mt-1">{formatNumber(bankBalancePDH)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rates */}
        <TabsContent value="rates">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5" /> Tasas de Interés
              </CardTitle>
              <CardDescription>Pasa el cursor sobre una fila y haz clic en el lápiz para editar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <RateRow field="savingsWeeklyInterestRate" icon={PiggyBank}
                label="Interés de Ahorro Semanal"
                description="Se paga semanalmente sobre el saldo de cada cuenta"
                currentValue={settings.savingsWeeklyInterestRate} isPercentage={false} />
              <RateRow field="personalLoanInterestRate" icon={User}
                label="Préstamo Personal" description="Tasa anual para préstamos personales"
                currentValue={settings.personalLoanInterestRate} isPercentage={true} />
              <RateRow field="businessLoanInterestRate" icon={Briefcase}
                label="Préstamo Empresarial" description="Tasa anual para préstamos empresariales"
                currentValue={settings.businessLoanInterestRate} isPercentage={true} />
              <RateRow field="latePaymentPenaltyRate" icon={Receipt}
                label="Penalización por Mora" description="Aplicada sobre pagos atrasados (por semana)"
                currentValue={settings.latePaymentPenaltyRate} isPercentage={false} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* CDT */}
        <TabsContent value="cdt">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" /> Tasas CDT
              </CardTitle>
              <CardDescription>Tasas anuales según el plazo del certificado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <RateRow field="cdtRate4w" icon={TrendingUp} label="4 Semanas"
                description="Tasa anual para CDTs de 4 semanas"
                currentValue={settings.cdtRate4w} isPercentage={false} />
              <RateRow field="cdtRate8w" icon={TrendingUp} label="8 Semanas"
                description="Tasa anual para CDTs de 8 semanas"
                currentValue={settings.cdtRate8w} isPercentage={false} />
              <RateRow field="cdtRate12w" icon={TrendingUp} label="12 Semanas"
                description="Tasa anual para CDTs de 12 semanas"
                currentValue={settings.cdtRate12w} isPercentage={false} />
              <RateRow field="cdtRate24w" icon={TrendingUp} label="24 Semanas"
                description="Tasa anual para CDTs de 24 semanas"
                currentValue={settings.cdtRate24w} isPercentage={false} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Commissions */}
        <TabsContent value="commissions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" /> Comisiones
              </CardTitle>
              <CardDescription>Cargos aplicados automáticamente en cada operación.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <RateRow field="depositCommission" icon={Wallet}
                label="Depósitos" description="Comisión sobre cada depósito"
                currentValue={settings.depositCommission} isPercentage={false} />
              <RateRow field="businessTransferCommission" icon={Briefcase}
                label="Transferencias Empresariales" description="Cuando el origen es cuenta empresa"
                currentValue={settings.businessTransferCommission} isPercentage={false} />
              <RateRow field="internationalTransferCommission" icon={Landmark}
                label="Transferencias Internacionales" description="Cuando origen y destino son de distinto país"
                currentValue={settings.internationalTransferCommission} isPercentage={false} />
              <Separator />
              <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-dashed bg-muted/30">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-md bg-muted text-muted-foreground flex items-center justify-center">
                    <ArrowRightLeft className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium leading-tight">Transferencias Personales Locales</p>
                    <p className="text-sm text-muted-foreground mt-0.5">Entre cuentas personales del mismo país</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-base font-bold px-3 py-1">Sin cargo</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CapitalInjectionDialog
        open={isCapitalDialogOpen}
        onOpenChange={setIsCapitalDialogOpen}
        onInject={injectCapital}
      />
    </div>
  );
}
