import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PASS_HASH = "a]Xk9#Lm2$vQ";

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

const EXPECTED_HASH = simpleHash("Kardelen0911*");

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const session = sessionStorage.getItem("mahr_auth");
    if (session === EXPECTED_HASH) {
      setAuthenticated(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (simpleHash(password) === EXPECTED_HASH) {
      sessionStorage.setItem("mahr_auth", EXPECTED_HASH);
      setAuthenticated(true);
    } else {
      toast({
        title: "Contraseña incorrecta",
        description: "Intente de nuevo.",
        variant: "destructive",
      });
      setPassword("");
    }
  };

  if (authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[hsl(220_42%_6%)] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,hsl(39_58%_55%_/_0.12),transparent_28rem)]" />
      <Card className="relative w-full max-w-sm border-[hsl(39_45%_45%_/_0.45)] bg-[hsl(220_35%_10%_/_0.96)] text-[hsl(42_35%_94%)] shadow-2xl shadow-black/40">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto h-16 w-16 rounded-xl overflow-hidden border border-[hsl(39_64%_62%_/_0.6)] shadow-lg shadow-[hsl(39_58%_55%_/_0.15)]">
            <img src="/mahr-bank-emblem.png" alt="MAHR Bank" className="h-full w-full object-cover" />
          </div>
          <CardTitle className="text-2xl">MAHR Bank</CardTitle>
          <p className="text-sm text-[hsl(42_25%_70%)]">Ingrese la contraseña para acceder</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10 border-[hsl(39_45%_45%_/_0.7)] bg-[hsl(220_28%_15%)] text-[hsl(42_35%_94%)] placeholder:text-[hsl(42_20%_60%)] focus-visible:ring-[hsl(39_64%_62%)]"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(42_25%_70%)] hover:text-[hsl(39_64%_62%)]"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button type="submit" className="w-full bg-[hsl(39_58%_52%)] text-[hsl(220_42%_8%)] hover:bg-[hsl(44_78%_65%)]">
              Ingresar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
