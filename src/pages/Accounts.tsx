import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBankData } from "@/hooks/useBankData";
import { CreateAccountDialog } from "@/components/bank/CreateAccountDialog";
import { AccountCard } from "@/components/bank/AccountCard";
import { Account } from "@/types/bank";
import { Loader2, Plus, Search, Globe, ChevronRight, Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { convertToPDH, formatNumber } from "@/lib/currencyUtils";
import { supabase } from "@/integrations/supabase/client";

interface CountryGroup {
  country: string;
  currency: string;
  accounts: Account[];
  totalPdh: number;
  totalLocal: number;
}

export default function Accounts() {
  const { accounts, bankMainAccount, loading, createAccount } = useBankData();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [mahrCustody, setMahrCustody] = useState({ currencyDefensePdh: 0, internationalPdh: 0 });
  const [mahrChequeFrozenPdh, setMahrChequeFrozenPdh] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      supabase.from('bank_backings' as any).select('amount, currency_iso').eq('bank_type', 'national'),
      supabase.from('mahr_reserve_custody' as any).select('reserve_type, amount, currency_iso'),
      supabase.from('bank_main_account' as any).select('balance_frozen_pdh').eq('id', 'bank-main').maybeSingle(),
    ]).then(async ([backing, custody, main]) => {
      const rows = (backing.data as any[]) || [];
      const custodyRows = (custody.data as any[]) || [];
      const currencies = await supabase.from('currencies').select('iso_symbol, exchange_rate_to_pdh');
      const rates = Object.fromEntries(((currencies.data as any[]) || []).map(c => [c.iso_symbol, Number(c.exchange_rate_to_pdh) || 0]));
      const internationalPdh = rows.reduce((sum, row) => sum + Number(row.amount || 0) * (row.currency_iso === 'PDH' ? 1 : (rates[row.currency_iso] || 0)), 0);
      const currencyDefensePdh = custodyRows
        .filter(row => row.reserve_type === 'currency_defense')
        .reduce((sum, row) => sum + Number(row.amount || 0) * (row.currency_iso === 'PDH' ? 1 : (rates[row.currency_iso] || 0)), 0);
      setMahrCustody({ currencyDefensePdh, internationalPdh });
      setMahrChequeFrozenPdh(Number((main.data as any)?.balance_frozen_pdh || 0));
    });
  }, []);

  const countryGroups = useMemo<CountryGroup[]>(() => {
    const map = new Map<string, Account[]>();
    for (const account of accounts) {
      const country = account.countryName || "Sin país asignado";
      if (!map.has(country)) map.set(country, []);
      map.get(country)!.push(account);
    }
    const groups: CountryGroup[] = Array.from(map.entries()).map(([country, accs]) => {
      const currency = accs[0]?.currency || "PDH";
      // account.balance is stored in the account's local currency (despite the column name balance_pdh)
      const totalLocal = accs.reduce((sum, a) => sum + a.balance, 0);
      const totalPdh = convertToPDH(totalLocal, currency);
      return { country, currency, accounts: accs, totalPdh, totalLocal };
    });
    return groups
      .filter((g) => g.country.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => a.country.localeCompare(b.country));
  }, [accounts, searchTerm]);

  const committedUsersPdh = useMemo(
    () => accounts.reduce((sum, account) => sum + convertToPDH(account.balance, account.currency || 'PDH'), 0),
    [accounts],
  );
  // The main account includes operational and international-transaction custody.
  // Currency-defense custody is a separate physical reserve and must be added
  // to gross assets even when it is committed and not freely available.
  const grossMahrCustodyPdh = Number(bankMainAccount?.balance || 0) + mahrCustody.currencyDefensePdh;
  const committedMahrReservesPdh = mahrCustody.currencyDefensePdh + mahrCustody.internationalPdh;
  const totalCommittedPdh = committedUsersPdh + committedMahrReservesPdh + mahrChequeFrozenPdh;
  const availableAfterCommitmentsPdh = Math.max(0, grossMahrCustodyPdh - totalCommittedPdh);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-muted-foreground">Cargando cuentas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cuentas por país</h1>
          <p className="text-muted-foreground">
            {accounts.length} cuentas en {countryGroups.length} países
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Cuenta
        </Button>
      </div>

      {bankMainAccount && (
        <Card className="border-accent">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-accent" />
              <CardTitle>Cuenta del Banco</CardTitle>
            </div>
            <CardDescription>Cuenta principal de MAHR Bank — saldo contable y reservas custodiadas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <AccountCard
                account={{
                  ...bankMainAccount,
                  userId: 'bank',
                  userName: 'MAHR Bank - Cuenta Principal',
                  type: 'business' as const,
                  monthlyFee: 0,
                  createdAt: new Date(),
                  currency: 'PDH',
                }}
                availableForWithdrawal={availableAfterCommitmentsPdh}
                withdrawalRestriction={availableAfterCommitmentsPdh <= 0 ? 'El saldo está comprometido como reserva.' : undefined}
                onClick={() => navigate(`/accounts/${bankMainAccount.id}`)}
              />
              <div className="md:col-span-2 rounded-lg border bg-muted/30 p-4 grid gap-3 sm:grid-cols-2">
                <div><p className="text-sm text-muted-foreground">Defensa monetaria en MAHR</p><p className="text-xl font-semibold">{formatNumber(mahrCustody.currencyDefensePdh)} PDH-eq</p></div>
                <div><p className="text-sm text-muted-foreground">Respaldo internacional en MAHR</p><p className="text-xl font-semibold">{formatNumber(mahrCustody.internationalPdh)} PDH</p></div>
                <div><p className="text-sm text-muted-foreground">Cheques bancarios congelados</p><p className="text-xl font-semibold">{formatNumber(mahrChequeFrozenPdh)} PDH</p></div>
              </div>
              <div className="md:col-span-3 rounded-lg border border-primary/30 bg-primary/5 p-4 grid gap-3 sm:grid-cols-3">
                <div><p className="text-sm text-muted-foreground">Arcas brutas registradas</p><p className="text-xl font-semibold">{formatNumber(grossMahrCustodyPdh)} PDH</p><p className="text-xs text-muted-foreground">Saldo contable consolidado de MAHR Bank</p></div>
                <div><p className="text-sm text-muted-foreground">Comprometido total</p><p className="text-xl font-semibold">{formatNumber(totalCommittedPdh)} PDH</p><p className="text-xs text-muted-foreground">Reservas: {formatNumber(committedMahrReservesPdh)} · Cheques: {formatNumber(mahrChequeFrozenPdh)} · Usuarios: {formatNumber(committedUsersPdh)}</p></div>
                <div><p className="text-sm text-muted-foreground">Disponible después de compromisos</p><p className="text-xl font-semibold">{formatNumber(availableAfterCommitmentsPdh)} PDH</p></div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Países</CardTitle>
              <CardDescription>Selecciona un país para ver sus cuentas</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar país..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {countryGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? "No se encontraron países" : "No hay cuentas registradas"}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {countryGroups.map((group) => (
                <Card
                  key={group.country}
                  onClick={() => navigate(`/countries/${encodeURIComponent(group.country)}`)}
                  className="cursor-pointer transition-all hover:shadow-lg hover:border-primary group"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Globe className="h-5 w-5 text-primary shrink-0" />
                        <CardTitle className="text-lg truncate">{group.country}</CardTitle>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                    <CardDescription className="flex items-center gap-2 pt-1">
                      <span className="px-2 py-0.5 rounded-full bg-muted text-xs font-medium">
                        {group.currency}
                      </span>
                      <span className="text-xs">
                        {group.accounts.length}{" "}
                        {group.accounts.length === 1 ? "cuenta" : "cuentas"}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <p className="text-xs text-muted-foreground">Total del país</p>
                    <p className="text-2xl font-bold text-foreground leading-tight">
                      {formatNumber(group.totalLocal)}{" "}
                      <span className="text-sm text-muted-foreground font-normal">
                        {group.currency}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ≈ {formatNumber(group.totalPdh)} PDH
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateAccountDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onCreateAccount={createAccount}
      />
    </div>
  );
}
