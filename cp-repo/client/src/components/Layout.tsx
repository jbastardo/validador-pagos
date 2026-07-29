import { Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import type { Usuario } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  FileSpreadsheet,
  ArrowDownToLine,
  LogOut,
  Menu,
  History,
  Users,
} from "lucide-react";
import { useState } from "react";
import PerplexityAttribution from "./PerplexityAttribution";

interface Props {
  user: Usuario;
  onLogout: () => void;
  children: React.ReactNode;
}

const navItems = [
  { href: "/",          label: "Dashboard",     icon: LayoutDashboard, roles: null },
  { href: "/extractos", label: "Extractos",      icon: FileSpreadsheet, roles: null },
  { href: "/importar",  label: "Importar Pagos", icon: ArrowDownToLine, roles: null },
  { href: "/historial", label: "Historial",      icon: History,         roles: null },
  { href: "/usuarios",  label: "Usuarios",       icon: Users,           roles: ["admin"] },
];

export default function Layout({ user, onLogout, children }: Props) {
  const [location] = useHashLocation();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col w-60 bg-sidebar-background border-r border-sidebar-border shrink-0">
        <SidebarContent location={location} user={user} onLogout={onLogout} />
      </aside>

      {/* Sidebar mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative w-60 bg-sidebar-background border-r border-sidebar-border flex flex-col z-10">
            <SidebarContent location={location} user={user} onLogout={() => { setOpen(false); onLogout(); }} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar mobile */}
        <header className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-border bg-card shrink-0">
          <button onClick={() => setOpen(true)} className="p-1 rounded hover:bg-muted">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-sm text-foreground">Conciliador de Pagos</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-4 overflow-x-hidden">
          {children}
        </main>

        <PerplexityAttribution />
      </div>
    </div>
  );
}

function SidebarContent({
  location,
  user,
  onLogout,
}: {
  location: string;
  user: Usuario;
  onLogout: () => void;
}) {
  return (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <svg
            aria-label="Conciliador de Pagos"
            viewBox="0 0 32 32"
            fill="none"
            className="w-8 h-8 shrink-0"
          >
            {/* Dos flechas circulares = conciliación */}
            <circle cx="16" cy="16" r="14" stroke="hsl(175 55% 50%)" strokeWidth="2.5" />
            <path
              d="M10 12 Q16 8 22 12"
              stroke="hsl(175 55% 50%)"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M22 20 Q16 24 10 20"
              stroke="hsl(220 65% 60%)"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
            <path d="M22 9 L22 13 L18 13" stroke="hsl(175 55% 50%)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M10 23 L10 19 L14 19" stroke="hsl(220 65% 60%)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <div>
            <p className="text-sidebar-foreground font-semibold text-sm leading-tight">Conciliador</p>
            <p className="text-sidebar-foreground/50 text-xs">de Pagos</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {navItems
          .filter((item) => !item.roles || item.roles.includes(user.rol))
          .map((item) => {
            const Icon = item.icon;
            const isActive = item.href === "/" ? location === "/" || location === "" : location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <a
                  data-testid={`nav-${item.href.replace("/", "") || "dashboard"}`}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </a>
              </Link>
            );
          })}
      </nav>

      {/* User + logout */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2 rounded-md bg-sidebar-accent/40 mb-2">
          <div className="w-7 h-7 rounded-full bg-sidebar-primary flex items-center justify-center text-xs font-bold text-white shrink-0">
            {(user.nombre || user.username)[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sidebar-foreground text-xs font-medium truncate">{user.nombre || user.username}</p>
            <p className="text-sidebar-foreground/50 text-xs capitalize">{user.rol}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 text-xs"
          onClick={onLogout}
          data-testid="button-logout"
        >
          <LogOut className="w-3.5 h-3.5 mr-2" />
          Cerrar sesión
        </Button>
      </div>
    </>
  );
}
