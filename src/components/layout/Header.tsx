import { NavLink } from "@/components/NavLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLocation, Link } from "react-router-dom";
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
  ChevronDown,
  Wallet,
  Banknote,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Item = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };

const linkBase =
  "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors hover:bg-muted whitespace-nowrap";
const linkActive = "bg-primary text-primary-foreground hover:bg-primary/90";

function NavGroup({
  label,
  icon: Icon,
  items,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Item[];
}) {
  const { pathname } = useLocation();
  const isActive = items.some((i) => pathname.startsWith(i.to));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(linkBase, "outline-none", isActive && linkActive)}
      >
        <Icon className="h-4 w-4" />
        {label}
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {items.map((item) => {
          const ItemIcon = item.icon;
          return (
            <DropdownMenuItem key={item.to} asChild>
              <Link to={item.to} className="flex items-center gap-2 cursor-pointer">
                <ItemIcon className="h-4 w-4" />
                {item.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header() {
  const bankingItems: Item[] = [
    { to: "/accounts", label: "Cuentas", icon: Users },
    { to: "/loans", label: "Préstamos", icon: CreditCard },
    { to: "/cdts", label: "CDTs", icon: TrendingUp },
    { to: "/payroll", label: "Nóminas", icon: FileText },
  ];

  const marketItems: Item[] = [
    { to: "/commodities", label: "Commodities", icon: Gem },
    { to: "/bonds", label: "Bonos", icon: Scroll },
  ];

  const geoItems: Item[] = [
    { to: "/countries", label: "Países", icon: Globe },
    { to: "/national-banks", label: "Bancos Nacionales", icon: Building },
    { to: "/private-banks", label: "Bancos Privados", icon: Building },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <img src="/mahr-bank-emblem.png" alt="MAHR Bank" className="h-8 w-8 rounded-md object-cover" />
          <span className="text-lg font-bold tracking-tight">MAHR Bank</span>
        </div>

        <nav className="flex items-center gap-1 flex-wrap justify-end">
          <NavLink
            to="/"
            end
            className={linkBase}
            activeClassName={linkActive}
          >
            <Building2 className="h-4 w-4" />
            Dashboard
          </NavLink>

          <NavGroup label="Banca" icon={Wallet} items={bankingItems} />

          <NavLink to="/transactions" className={linkBase} activeClassName={linkActive}>
            <Banknote className="h-4 w-4" />
            Transacciones
          </NavLink>

          <NavGroup label="Mercado" icon={Gem} items={marketItems} />

          <NavGroup label="Geografía" icon={Globe} items={geoItems} />

          <NavLink to="/admin" className={linkBase} activeClassName={linkActive}>
            <Settings className="h-4 w-4" />
            Admin
          </NavLink>

          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
