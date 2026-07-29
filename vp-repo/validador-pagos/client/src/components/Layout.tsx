import { type ReactNode } from "react";
import { Link } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import {
  LayoutDashboard,
  PlusCircle,
  ClipboardCheck,
  Users,
  LogOut,
  ShieldCheck,
  Menu,
  X,
  DollarSign,
  FileSpreadsheet,
  ClipboardList,
  BarChart3,
  KeyRound,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// pagina: null = visible para todos los roles autenticados
// adminOnly: true = solo admin, sin pasar por hasPermission
const navItems = [
  { href: "/",                      label: "Dashboard",             icon: LayoutDashboard, pagina: null       as string | null, adminOnly: false },
  { href: "/registrar",             label: "Pagos en Bs",           icon: PlusCircle,      pagina: "registrar",               adminOnly: false },
  { href: "/registrar-divisas",     label: "Pago en Divisas",       icon: DollarSign,      pagina: "registrar-divisas",       adminOnly: false },
  { href: "/upload-cashea",         label: "Importar Cashea",       icon: FileSpreadsheet, pagina: "upload-cashea",           adminOnly: false },
  { href: "/conciliacion",          label: "Resumen de Pagos",      icon: ClipboardCheck,  pagina: "conciliacion",            adminOnly: false },
  { href: "/solicitudes",           label: "Solicitudes",           icon: ClipboardList,   pagina: "solicitudes",             adminOnly: false },
  { href: "/dashboard-solicitudes", label: "Dashboard Solicitudes", icon: BarChart3,       pagina: "dashboard-solicitudes",   adminOnly: false },
  { href: "/usuarios",              label: "Usuarios",              icon: Users,           pagina: "usuarios",                adminOnly: false },
  { href: "/permisos",              label: "Permisos de Roles",     icon: KeyRound,        pagina: null,                      adminOnly: true  },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, hasPermission } = useAuth();
  const [location] = useHashLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const allowedNav = navItems.filter(item => {
    if (!user) return false;
    if (item.adminOnly) return user.rol === "admin";
    if (item.pagina === null) return true;
    return hasPermission(item.pagina);
  });

  const rolLabel: Record<string, string> = {
    admin: "Administrador",
    contabilidad: "Contabilidad",
    vendedor: "Vendedor",
    cajero: "Cajero",
    compras: "Compras",
    supervisor_caja: "Supervisor de Caja",
  };

  const rolColor: Record<string, string> = {
    admin: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    contabilidad: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    vendedor: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    cajero: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
    compras: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
    supervisor_caja: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  };

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <>
      {allowedNav.map(item => {
        const Icon = item.icon;
        const isActive = location === item.href;
        return (
          <Link key={item.href} href={item.href}>
            <a
              data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
              onClick={onClick}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </a>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-sidebar">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary">
            <ShieldCheck className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <div className="text-sm font-bold text-sidebar-foreground leading-tight">Validador</div>
            <div className="text-xs text-muted-foreground leading-tight">de Pagos</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <NavLinks />
        </nav>

        <div className="px-4 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">
                {user?.nombre?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-sidebar-foreground truncate">{user?.nombre}</div>
              <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
            </div>
          </div>
          <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mb-3 ${rolColor[user?.rol ?? "vendedor"]}`}>
            {rolLabel[user?.rol ?? "vendedor"]}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={logout}
            data-testid="button-logout"
          >
            <LogOut className="w-3 h-3" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex flex-col w-64 h-full bg-sidebar border-r border-sidebar-border">
            <div className="flex items-center justify-between px-5 py-5 border-b border-sidebar-border">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary">
                  <ShieldCheck className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <div className="text-sm font-bold text-sidebar-foreground">Validador de Pagos</div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setMobileOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              <NavLinks onClick={() => setMobileOpen(false)} />
            </nav>
            <div className="px-4 py-4 border-t border-sidebar-border">
              <Button variant="outline" size="sm" className="w-full gap-2" onClick={logout}>
                <LogOut className="w-3 h-3" />
                Cerrar sesión
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-background">
          <Button variant="ghost" size="sm" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <span className="text-sm font-bold">Validador de Pagos</span>
          </div>
          <div className="w-8" />
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
