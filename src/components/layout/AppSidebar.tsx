import { NavLink, useLocation } from "react-router-dom";
import {
  Building2,
  Users,
  CreditCard,
  FileText,
  Settings,
  TrendingUp,
  Globe,
  Gem,
  Building,
  Scroll,
  Wallet,
  Banknote,
  Calculator,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type Item = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; end?: boolean };

const overview: Item[] = [
  { to: "/", label: "Dashboard", icon: Building2, end: true },
  { to: "/transactions", label: "Transacciones", icon: Banknote },
  { to: "/calculator", label: "Calculadora", icon: Calculator },
  { to: "/cash-out", label: "Efectivo en la calle", icon: Wallet },
];

const banking: Item[] = [
  { to: "/accounts", label: "Cuentas", icon: Users },
  { to: "/loans", label: "Préstamos", icon: CreditCard },
  { to: "/cdts", label: "CDTs", icon: TrendingUp },
  { to: "/payroll", label: "Nóminas", icon: FileText },
  { to: "/negotiables", label: "Cheques y pagarés", icon: FileText },
];

const market: Item[] = [
  { to: "/commodities", label: "Commodities", icon: Gem },
  { to: "/bonds", label: "Bonos", icon: Scroll },
];

const geo: Item[] = [
  { to: "/countries", label: "Países", icon: Globe },
  { to: "/national-banks", label: "Bancos Nacionales", icon: Building },
  { to: "/private-banks", label: "Bancos Privados", icon: Building },
];

const system: Item[] = [{ to: "/admin", label: "Administración", icon: Settings }];

function Section({ label, items }: { label: string; items: Item[] }) {
  const { pathname } = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const isActive = (path: string, end?: boolean) =>
    end ? pathname === path : pathname === path || pathname.startsWith(path + "/");

  return (
    <SidebarGroup>
      {!collapsed && (
        <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/50 font-medium px-3">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isActive(item.to, item.end);
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  className={cn(
                    "h-9 rounded-md transition-colors",
                    "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
                    active &&
                      "bg-sidebar-accent text-sidebar-foreground font-medium relative before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:bg-sidebar-primary before:rounded-r"
                  )}
                >
                  <NavLink to={item.to} end={item.end}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="text-sm">{item.label}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border/60 py-4">
        <div className={cn("flex items-center gap-2.5 px-2", collapsed && "justify-center px-0")}>
          <div className="h-9 w-9 rounded-md bg-gradient-to-br from-sidebar-primary to-sidebar-primary/70 flex items-center justify-center shrink-0 shadow-sm">
            <img src="/mahr-bank-emblem.png" alt="MAHR Bank" className="h-full w-full rounded-md object-cover" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-serif text-base font-bold text-sidebar-foreground tracking-tight">
                MAHR Bank
              </span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/50">
                Private Banking
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0 py-2">
        <Section label="Vista General" items={overview} />
        <Section label="Banca" items={banking} />
        <Section label="Mercado" items={market} />
        <Section label="Geografía" items={geo} />
        <Section label="Sistema" items={system} />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60 py-3">
        {!collapsed ? (
          <div className="px-2 text-[10px] text-sidebar-foreground/40 uppercase tracking-widest">
            v1.0 · Est. 2024
          </div>
        ) : (
          <div className="flex justify-center">
            <Wallet className="h-4 w-4 text-sidebar-foreground/40" />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
