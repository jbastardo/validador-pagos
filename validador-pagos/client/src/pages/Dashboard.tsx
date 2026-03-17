import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useHashLocation } from "wouter/use-hash-location";
import { BarChart3, Clock, XCircle, DollarSign, ShieldCheck, ShieldX, Coins, FileX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Stats {
  total: number; pendientes: number; verificados: number; rechazados: number;
  pagoMovil: number; transferencias: number; montoTotal: number;
  megasoftSi: number; megasoftNo: number; megasoftPendiente: number; montoMegasoftSi: number;
  rechazadosMegasoft: number;
  sinFactura: number;
  montoPendientesBs: number;
  totalDivisas: number; pendientesDivisas: number; montoDivisas: number;
  montoPendientesDivisas: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, navigate] = useHashLocation();
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const queryKey = fechaDesde || fechaHasta
    ? [`/api/stats?${new URLSearchParams({ ...(fechaDesde && { fechaDesde }), ...(fechaHasta && { fechaHasta }) }).toString()}`]
    : ["/api/stats"];
  const { data: stats, isLoading: sL } = useQuery<Stats>({ queryKey });

  // ⚠️ WARNING: wouter pone query params en window.location.search, no en el hash.
  // Conciliacion.tsx debe leer de window.location.search para obtener los filtros.
  const irA = (filtro: string) => {
    navigate(`/conciliacion?estado=${encodeURIComponent(filtro)}`);
  };

  const fmt = (n: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(n);

  return (
    <div className="space-y-3">
      {/* ── Header compacto ── */}
      <div>
        <h1 className="text-xl font-bold leading-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{user?.nombre} · {new Date().toLocaleDateString("es-VE", { weekday: "short", day: "numeric", month: "short" })}</p>
      </div>

      {/* ── Selector de fechas ── */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground">Desde</label>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm" />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm" />
        </div>
      </div>

      {sL ? <Skeleton className="h-16 rounded-lg"/> : <>
        {/* ══════════════════════════════════════════════════════════
            BARRA PRINCIPAL — Total + Pendientes (HERO)
            ══════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 gap-2">
          <div
            className="rounded-lg bg-[#0A4083] text-white p-3 text-left"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide opacity-80">Total Operaciones</p>
                <p className="text-4xl font-extrabold leading-none mt-1">{stats?.total ?? 0}</p>
              </div>
              <BarChart3 className="w-7 h-7 opacity-40" />
            </div>
          </div>
          <button
            onClick={() => irA("Pendiente")}
            className="rounded-lg bg-amber-500 text-white p-3 text-left hover:bg-amber-500/90 active:scale-[0.99] transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide opacity-80">Pendientes</p>
                <p className="text-4xl font-extrabold leading-none mt-1">{stats?.pendientes ?? 0}</p>
                <p className="text-[11px] opacity-90 mt-1">Bs. {fmt(stats?.montoPendientesBs ?? 0)}</p>
                <p className="text-[11px] opacity-90">${fmt(stats?.montoPendientesDivisas ?? 0)}</p>
              </div>
              <Clock className="w-7 h-7 opacity-40" />
            </div>
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════
            CAJA / MONTO — segunda prioridad
            ══════════════════════════════════════════════════════════ */}
        <div className="rounded-lg border bg-card p-2.5">
          <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Caja</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-primary/5 rounded-md px-2.5 py-1.5">
              <p className="text-[12px] text-muted-foreground">Monto Total</p>
              <p className="text-base font-bold">Bs. {fmt(stats?.montoTotal ?? 0)}</p>
            </div>
            <div className="bg-green-50 dark:bg-green-950/20 rounded-md px-2.5 py-1.5">
              <p className="text-[12px] text-green-600">Verificados</p>
              <p className="text-base font-bold text-green-700">{stats?.verificados ?? 0}</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-md px-2.5 py-1.5">
              <p className="text-[12px] text-blue-600">Pago Móvil</p>
              <p className="text-base font-bold text-blue-700">{stats?.pagoMovil ?? 0}</p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-md px-2.5 py-1.5">
              <p className="text-[12px] text-emerald-600">Transferencias</p>
              <p className="text-base font-bold text-emerald-700">{stats?.transferencias ?? 0}</p>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            ESTADOS SECUNDARIOS — fila compacta
            ══════════════════════════════════════════════════════════ */}
        <div className="flex flex-wrap gap-1.5">
          <div className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm">
            <XCircle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-muted-foreground">Rechazados</span>
            <span className="font-bold text-red-600">{stats?.rechazados ?? 0}</span>
          </div>
          {(stats?.sinFactura ?? 0) > 0 && (
            <button onClick={() => irA("SinFactura")} className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50/50 px-2.5 py-1 text-sm hover:bg-rose-100 transition-colors">
              <FileX className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-rose-600">Sin factura</span>
              <span className="font-bold text-rose-700">{stats?.sinFactura}</span>
            </button>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════
            MEGASOFT — compacto en 1 card
            ══════════════════════════════════════════════════════════ */}
        <div className="rounded-lg border bg-card p-2.5">
          <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Validación Megasoft</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-green-50 dark:bg-green-950/20 rounded-md px-2.5 py-1.5 border border-green-200/50">
              <div className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-green-600" />
                <p className="text-[12px] text-green-600">Aprobados por Megasoft</p>
              </div>
              <p className="text-base font-bold text-green-700">{stats?.megasoftSi ?? 0}</p>
              <p className="text-[12px] text-green-500">Bs. {fmt(stats?.montoMegasoftSi ?? 0)}</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-md px-2.5 py-1.5 border border-blue-200/50">
              <div className="flex items-center gap-1">
                <ShieldX className="w-3 h-3 text-blue-600" />
                <p className="text-[12px] text-blue-600">Transferidos a contabilidad</p>
              </div>
              <p className="text-base font-bold text-blue-700">{stats?.megasoftNo ?? 0}</p>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            DIVISAS — fila compacta
            ══════════════════════════════════════════════════════════ */}
        <div className="rounded-lg border bg-card p-2.5">
          <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Divisas</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-violet-50 dark:bg-violet-950/20 rounded-md px-2.5 py-1.5">
              <div className="flex items-center gap-1">
                <Coins className="w-3 h-3 text-violet-600" />
                <p className="text-[12px] text-violet-600">Total</p>
              </div>
              <p className="text-base font-bold text-violet-700">{stats?.totalDivisas ?? 0}</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/20 rounded-md px-2.5 py-1.5">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-600" />
                <p className="text-[12px] text-amber-600">Pendientes</p>
              </div>
              <p className="text-base font-bold text-amber-700">{stats?.pendientesDivisas ?? 0}</p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-md px-2.5 py-1.5">
              <div className="flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-emerald-600" />
                <p className="text-[12px] text-emerald-600">Monto</p>
              </div>
              <p className="text-base font-bold text-emerald-700">${fmt(stats?.montoDivisas ?? 0)}</p>
            </div>
          </div>
        </div>
      </>}
    </div>
  );
}
