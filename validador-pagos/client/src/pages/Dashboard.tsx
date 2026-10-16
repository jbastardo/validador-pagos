import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useHashLocation } from "wouter/use-hash-location";
import { BarChart3, Clock, XCircle, DollarSign, ShieldCheck, ShieldX, Coins, FileX, KeyRound, Zap, UserCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Stats {
  total: number; pendientes: number; verificados: number; rechazados: number;
  pagoMovil: number; transferencias: number; montoTotal: number;
  megasoftSi: number; megasoftNo: number; megasoftPendiente: number; montoMegasoftSi: number;
  rechazadosMegasoft: number;
  sinFactura: number;
  montoPendientesBs: number;
  validadosManual?: number;
  montoValidadosManual?: number;
  totalDivisas: number; pendientesDivisas: number; montoDivisas: number;
  montoPendientesDivisas: number;
  odooPos?: {
    totalPagosPos: number;
    megasoft: { cant: number; monto: number };
    pabilo: {
      cant: number;
      monto: number;
      bs: { cant: number; monto: number };
      crypto: { cant: number; monto: number };
    };
  };
}

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useHashLocation();
  
  // Fecha actual en formato YYYY-MM-DD
  const hoy = new Date().toISOString().split("T")[0];
  
  const [fechaDesde, setFechaDesde] = useState(hoy);
  const [fechaHasta, setFechaHasta] = useState(hoy);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdActual, setPwdActual] = useState("");
  const [pwdNueva, setPwdNueva] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const queryKey = ["/api/stats", fechaDesde, fechaHasta];
  const { data: stats, isLoading: sL } = useQuery<Stats>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fechaDesde) params.append("fechaDesde", fechaDesde);
      if (fechaHasta) params.append("fechaHasta", fechaHasta);
      const res = await fetch(`/api/stats?${params.toString()}`);
      if (!res.ok) throw new Error("Error al cargar estadísticas");
      return res.json();
    },
  });

  // ⚠️ WARNING: wouter pone query params en window.location.search, no en el hash.
  // Conciliacion.tsx debe leer de window.location.search para obtener los filtros.
  const irA = (filtro: string) => {
    navigate(`/conciliacion?estado=${encodeURIComponent(filtro)}`);
  };

  const handleCambiarPassword = async () => {
    if (!pwdActual || !pwdNueva) return;
    setPwdLoading(true);
    try {
      const res = await apiRequest("POST", "/api/usuarios/cambiar-password", {
        email: user?.email,
        passwordActual: pwdActual,
        passwordNueva: pwdNueva,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "Error");
      toast({ title: "Contraseña actualizada correctamente" });
      setPwdOpen(false);
      setPwdActual("");
      setPwdNueva("");
    } catch (err: any) {
      toast({ title: err.message ?? "Error al cambiar contraseña", variant: "destructive" });
    } finally {
      setPwdLoading(false);
    }
  };

  const fmt = (n: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(n);

  return (
    <div className="space-y-3">
      {/* ── Header compacto ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold leading-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{user?.nombre} · {new Date().toLocaleDateString("es-VE", { weekday: "short", day: "numeric", month: "short" })}</p>
        </div>
        <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <KeyRound className="h-4 w-4" /> Cambiar Clave
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Cambiar Contraseña</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Contraseña Actual</Label>
                <Input type="password" value={pwdActual} onChange={e => setPwdActual(e.target.value)} className="mt-1" placeholder="Ingresa tu contraseña actual" />
              </div>
              <div>
                <Label>Nueva Contraseña</Label>
                <Input type="password" value={pwdNueva} onChange={e => setPwdNueva(e.target.value)} className="mt-1" placeholder="Mínimo 4 caracteres" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPwdOpen(false)}>Cancelar</Button>
              <Button onClick={handleCambiarPassword} disabled={!pwdActual || !pwdNueva || pwdLoading}>
                {pwdLoading ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
            VALIDACIÓN AUTOMÁTICA Y PASARELAS (ODOO POS + WEB)
            ══════════════════════════════════════════════════════════ */}
        <div className="rounded-lg border bg-card p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Pasarelas y Validación Automática</p>
            {stats?.odooPos?.totalPagosPos ? (
              <span className="text-[11px] text-muted-foreground font-medium bg-muted/60 px-2 py-0.5 rounded">
                Sincronizado Odoo POS: {stats.odooPos.totalPagosPos} pagos
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* PABILO */}
            <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-md p-2 border border-emerald-200/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-600" />
                  <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Pabilo (Odoo POS)</p>
                </div>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 px-1.5 py-0.5 rounded font-medium">Auto</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <div>
                  <p className="text-xl font-black text-emerald-700 leading-tight">
                    {stats?.odooPos?.pabilo?.cant ?? 0} <span className="text-xs font-normal text-muted-foreground">pagos</span>
                  </p>
                  <p className="text-xs font-semibold text-emerald-600">
                    ${fmt(stats?.odooPos?.pabilo?.monto ?? 0)}
                  </p>
                </div>
                <div className="text-right text-[11px] text-emerald-700/80">
                  <p>{stats?.odooPos?.pabilo?.bs?.cant ?? 0} Venezuela (${fmt(stats?.odooPos?.pabilo?.bs?.monto ?? 0)})</p>
                  <p>{stats?.odooPos?.pabilo?.crypto?.cant ?? 0} Binance (${fmt(stats?.odooPos?.pabilo?.crypto?.monto ?? 0)})</p>
                </div>
              </div>
            </div>

            {/* MEGASOFT */}
            <div className="bg-sky-50 dark:bg-sky-950/20 rounded-md p-2 border border-sky-200/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                  <p className="text-xs font-bold text-sky-800 dark:text-sky-300">Megasoft (Odoo POS + Web)</p>
                </div>
                <span className="text-[10px] bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200 px-1.5 py-0.5 rounded font-medium">Auto</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <div>
                  <p className="text-xl font-black text-sky-700 leading-tight">
                    {((stats?.odooPos?.megasoft?.cant ?? 0) + (stats?.megasoftSi ?? 0))} <span className="text-xs font-normal text-muted-foreground">pagos</span>
                  </p>
                  <p className="text-xs font-semibold text-sky-600">
                    ${fmt(stats?.odooPos?.megasoft?.monto ?? 0)}
                    {(stats?.montoMegasoftSi ?? 0) > 0 ? ` + Bs. ${fmt(stats?.montoMegasoftSi ?? 0)}` : ""}
                  </p>
                </div>
                <div className="text-right text-[11px] text-sky-700/80">
                  <p>{stats?.odooPos?.megasoft?.cant ?? 0} Odoo POS</p>
                  <p>{stats?.megasoftSi ?? 0} Web</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            VALIDACIONES MANUALES & CONTABILIDAD (WEB)
            ══════════════════════════════════════════════════════════ */}
        <div className="rounded-lg border bg-card p-2.5">
          <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Verificaciones Manuales (Caja / Contabilidad)</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => irA("Verificado")}
              className="bg-teal-50 dark:bg-teal-950/20 rounded-md px-2.5 py-1.5 border border-teal-200/50 text-left hover:bg-teal-100/60 transition-colors"
            >
              <div className="flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-teal-600" />
                <p className="text-[12px] text-teal-700 font-medium">Verificados en Banco</p>
              </div>
              <p className="text-base font-bold text-teal-800">{stats?.validadosManual ?? stats?.verificados ?? 0}</p>
              <p className="text-[12px] text-teal-600">Bs. {fmt(stats?.montoValidadosManual ?? 0)}</p>
            </button>
            <button
              onClick={() => irA("MegasoftNo")}
              className="bg-blue-50 dark:bg-blue-950/20 rounded-md px-2.5 py-1.5 border border-blue-200/50 text-left hover:bg-blue-100/60 transition-colors"
            >
              <div className="flex items-center gap-1">
                <ShieldX className="w-3 h-3 text-blue-600" />
                <p className="text-[12px] text-blue-700 font-medium">Transferidos a contabilidad</p>
              </div>
              <p className="text-base font-bold text-blue-800">{stats?.megasoftNo ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">Transferencias directas (No Megasoft)</p>
            </button>
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
