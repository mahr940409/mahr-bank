import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

const routeTitles: Record<string, string> = {
  "/": "Dashboard",
  "/accounts": "Cuentas",
  "/loans": "Préstamos",
  "/cdts": "Certificados de Depósito",
  "/payroll": "Nóminas",
  "/transactions": "Transacciones",
  "/commodities": "Commodities",
  "/bonds": "Bonos",
  "/countries": "Países",
  "/national-banks": "Bancos Nacionales",
  "/private-banks": "Bancos Privados",
  "/admin": "Administración",
  "/calculator": "Calculadora",
};

function getTitle(pathname: string) {
  if (routeTitles[pathname]) return routeTitles[pathname];
  const base = "/" + pathname.split("/")[1];
  return routeTitles[base] ?? "";
}

export function MainLayout() {
  const { pathname } = useLocation();
  const title = getTitle(pathname);

  const handleLogout = () => {
    sessionStorage.removeItem("mahr_auth");
    window.location.reload();
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-40 h-14 flex items-center justify-between gap-3 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 px-4 md:px-6">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div className="h-5 w-px bg-border" />
              {title && (
                <h1 className="font-serif text-base md:text-lg font-bold text-foreground truncate">
                  {title}
                </h1>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="text-muted-foreground hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <main className="flex-1 px-4 md:px-8 py-6 md:py-8 max-w-[1600px] w-full mx-auto">
            <Outlet />
          </main>

          <footer className="border-t border-border/60 py-4 px-6 text-xs text-muted-foreground flex items-center justify-between">
            <span className="font-serif italic">MAHR Bank · Private Banking</span>
            <span className="tracking-wider uppercase">Confidencial</span>
          </footer>
        </div>
      </div>
      <Toaster />
    </SidebarProvider>
  );
}
