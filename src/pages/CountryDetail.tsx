import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBankData } from "@/hooks/useBankData";
import { AccountCard } from "@/components/bank/AccountCard";
import { CreateAccountDialog } from "@/components/bank/CreateAccountDialog";
import { Account } from "@/types/bank";
import { Loader2, Plus, Search, Globe, ArrowLeft } from "lucide-react";
import { convertToPDH, formatNumber } from "@/lib/currencyUtils";

export default function CountryDetail() {
  const { country } = useParams<{ country: string }>();
  const decodedCountry = decodeURIComponent(country || "");
  const navigate = useNavigate();
  const { accounts, loading, createAccount, updateAccountName, deleteAccount } = useBankData();
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const countryAccounts = useMemo(
    () =>
      accounts
        .filter((a) => (a.countryName || "Sin país asignado") === decodedCountry)
        .filter(
          (a) =>
            a.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.accountNumber.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => a.userName.localeCompare(b.userName)),
    [accounts, decodedCountry, searchTerm]
  );

  const localCurrency = countryAccounts[0]?.currency || "PDH";
  // account.balance is stored in the account's local currency
  const totalLocal = useMemo(
    () => countryAccounts.reduce((sum, a) => sum + a.balance, 0),
    [countryAccounts]
  );
  const totalPdh = convertToPDH(totalLocal, localCurrency);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/accounts")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Globe className="h-7 w-7 text-primary" />
              {decodedCountry}
            </h1>
            <p className="text-muted-foreground">
              {countryAccounts.length} {countryAccounts.length === 1 ? "cuenta" : "cuentas"} · Moneda local: {localCurrency}
            </p>
          </div>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Cuenta
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>Total del país</CardDescription>
          <CardTitle className="text-4xl">
            {formatNumber(totalLocal)} <span className="text-xl text-muted-foreground">{localCurrency}</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">≈ {formatNumber(totalPdh)} PDH</p>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Cuentas</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o número..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {countryAccounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? "No se encontraron cuentas" : "No hay cuentas en este país"}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {countryAccounts.map((account: Account) => (
                <div key={account.id} className="relative group">
                  <AccountCard
                    account={account}
                    onClick={() => navigate(`/accounts/${account.id}`)}
                    onEditName={updateAccountName}
                    onDelete={deleteAccount}
                  />
                  <Link
                    to={`/accounts/${account.id}`}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Button size="sm" variant="secondary">
                      Ver detalles
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateAccountDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreateAccount={createAccount}
      />
    </div>
  );
}
