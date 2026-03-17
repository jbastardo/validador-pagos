import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useHashLocation } from "wouter/use-hash-location";
import { BarChart3, CheckCircle2, Clock, XCircle, Smartphone, ArrowRightLeft, DollarSign, ShieldCheck, ShieldX, Coins, ShieldOff, CalendarDays, FileX, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { BANCOS_RECEPTOR, extractBancoCode } from "@shared/schema";

interface Pago { id: string; fechaPago: string; tipoPago: string; bancoEmisor: string; bancoReceptor: string; monto: string; estado: string; megasoft?: string; factura?: string; cliente?: string; }
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

const estadoColor: Record<string, string> = { Pendiente: "bg-amber-100 text-amber-700", Verificado: "bg-green-100 text-green-700", Rechazado: "bg-red-100 text-red-700", "Rechazado Megasoft": "bg-orange-100 text-orange-700" };

export default function Dashboard() {
  const { user } = useAuth();
  const [, navigate] = useHashLocation();
  const { data: rawStats, isLoading: sL } = useQuery<Stats>({ queryKey: ["/api/stats"] });
  const { data: allPagos, isLoading: pL } = useQuery<Pago[]>({ queryKey: ["/api/pagos"] });

  const today = new Date().toISOString().split("T")[0];
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [showCharts, setShowCharts] = useState(false);

  const pagos = useMemo(() => {
    if (!allPagos) return [];
    return allPagos.filter(p => {
      if (fechaDesde && p.fechaPago < fechaDesde) return false;
      if (fechaHasta && p.fechaPago > fechaHasta) return false;
      return true;
    });
  }, [allPagos, fechaDesde, fechaHasta]);

  const hayFiltro = !!(fechaDesde || fechaHasta);

  const stats = useMemo<Stats | undefined>(() => {
    if (!hayFiltro) return rawStats;
    if (!allPagos) return rawStats;
    const verificados = pagos.filter(p => p.estado === "Verificado");
    return {
      total:             pagos.length,
      pendientes:        pagos.filter(p => p.estado === "Pendiente").length,
      verificados:       verificados.length,
      rechazados:        pagos.filter(p => p.estado === "Rechazado").length,
      rechazadosMegasoft: pagos.filter(p => p.estado === "Rechazado Megasoft").length,
      pagoMovil:         pagos.filter(p => p.tipoPago === "PagoMovil").length,
      transferencias:    pagos.filter(p => p.tipoPago === "Transferencia").length,
      montoTotal:        pagos.filter(p => p.estado !== "Rechazado" && p.estado !== "Rechazado Megasoft").reduce((s, p) => s + parseFloat(p.monto || "0"), 0),
      megasoftSi:        verificados.filter(p => p.megasoft === "Sí").length,
      megasoftNo:        verificados.filter(p => p.megasoft === "No").length,
      megasoftPendiente: verificados.filter(p => !p.megasoft || p.megasoft === "").length,
      montoMegasoftSi:   verificados.filter(p => p.megasoft === "Sí").reduce((s, p) => s + parseFloat(p.monto || "0"), 0),
      sinFactura:        pagos.filter(p => p.estado !== "Rechazado" && p.estado !== "Rechazado Megasoft" && (!p.factura || p.factura.trim() === "")).length,
      montoPendientesBs: pagos.filter(p => p.estado === "Pendiente").reduce((s, p) => s + parseFloat(p.monto || "0"), 0),
      totalDivisas:      rawStats?.totalDivisas ?? 0,
      pendientesDivisas: rawStats?.pendientesDivisas ?? 0,
      montoDivisas:      rawStats?.montoDivisas ?? 0,
      montoPendientesDivisas: rawStats?.montoPendientesDivisas ?? 0,
    };
  }, [hayFiltro, rawStats, pagos, allPagos]);

  const fmt = (n: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(n);

  const irAConciliacion = (estado: string) => {
    navigate(`/conciliacion?estado=${encodeURIComponent(estado)}${fechaDesde ? `&desde=${fechaDesde}` : ""}${fechaHasta ? `&hasta=${fechaHasta}` : ""}`);
  };

  const porBanco: Record<string, number> = {};
  pagos.forEach(p => { const code = extractBancoCode(p.bancoReceptor); const label = BANCOS_RECEPTOR.find(b => extractBancoCode(b) === code) || p.bancoReceptor; if (code) porBanco[label] = (porBanco[label] || 0) + 1; });
  const bancoData = Object.entries(porBanco).map(([name, count]) => ({ name, count })).sort((a,b)=>b.count-a.count).slice(0,6);
  const pieData = [{ name: "Pago Móvil", value: stats?.pagoMovil ?? 0, color: "#3b82f6" }, { name: "Transferencia", value: stats?.transferencias ?? 0, color: "#10b981" }];

  return (
    <div className="space-y-3">
      {/* ── Header compacto con filtro ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold leading-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{user?.nombre} · {new Date().toLocaleDateString("es-VE", { weekday: "short", day: "numeric", month: "short" })}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <div className="flex items-center gap-1">
            <Label className="text-[12px] text-muted-foreground">Desde</Label>
            <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="h-6 text-[13px] w-32 px-1.5"/>
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-[12px] text-muted-foreground">Hasta</Label>
            <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="h-6 text-[13px] w-32 px-1.5"/>
          </div>
          {hayFiltro && (
            <Button variant="ghost" size="sm" className="h-6 text-[12px] px-1.5" onClick={() => { setFechaDesde(""); setFechaHasta(""); }}>
              Limpiar
            </Button>
          )}
          {hayFiltro && <span className="text-[12px] text-primary font-medium">{pagos.length}/{allPagos?.length ?? 0}</span>}
        </div>
      </div>

      {sL ? <Skeleton className="h-16 rounded-lg"/> : <>
        {/* ══════════════════════════════════════════════════════════
            BARRA PRINCIPAL — Total + Pendientes (HERO)
            ══════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => irAConciliacion("todos")}
            className="rounded-lg bg-[#0A4083] text-white p-3 text-left hover:bg-[#0A4083]/90 active:scale-[0.99] transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide opacity-80">Total Operaciones</p>
                <p className="text-4xl font-extrabold leading-none mt-1">{stats?.total ?? 0}</p>
              </div>
              <BarChart3 className="w-7 h-7 opacity-40" />
            </div>
          </button>
          <button
            onClick={() => irAConciliacion("Pendiente")}
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
            <button onClick={() => irAConciliacion("Verificado")} className="bg-green-50 dark:bg-green-950/20 rounded-md px-2.5 py-1.5 text-left hover:bg-green-100 transition-colors">
              <p className="text-[12px] text-green-600">Verificados</p>
              <p className="text-base font-bold text-green-700">{stats?.verificados ?? 0}</p>
            </button>
            <button onClick={() => irAConciliacion("PagoMovil")} className="bg-blue-50 dark:bg-blue-950/20 rounded-md px-2.5 py-1.5 text-left hover:bg-blue-100 transition-colors">
              <p className="text-[12px] text-blue-600">Pago Móvil</p>
              <p className="text-base font-bold text-blue-700">{stats?.pagoMovil ?? 0}</p>
            </button>
            <button onClick={() => irAConciliacion("Transferencia")} className="bg-emerald-50 dark:bg-emerald-950/20 rounded-md px-2.5 py-1.5 text-left hover:bg-emerald-100 transition-colors">
              <p className="text-[12px] text-emerald-600">Transferencias</p>
              <p className="text-base font-bold text-emerald-700">{stats?.transferencias ?? 0}</p>
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            ESTADOS SECUNDARIOS — fila compacta
            ══════════════════════════════════════════════════════════ */}
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => irAConciliacion("Rechazado")} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm hover:bg-red-50 transition-colors">
            <XCircle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-muted-foreground">Rechazados</span>
            <span className="font-bold text-red-600">{stats?.rechazados ?? 0}</span>
          </button>
          {(stats?.sinFactura ?? 0) > 0 && (
            <button onClick={() => irAConciliacion("SinFactura")} className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50/50 px-2.5 py-1 text-sm hover:bg-rose-100 transition-colors">
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
            <button onClick={() => irAConciliacion("MegasoftSi")} className="bg-green-50 dark:bg-green-950/20 rounded-md px-2.5 py-1.5 border border-green-200/50 text-left hover:bg-green-100 transition-colors">
              <div className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-green-600" />
                <p className="text-[12px] text-green-600">Aprobados por Megasoft</p>
              </div>
              <p className="text-base font-bold text-green-700">{stats?.megasoftSi ?? 0}</p>
              <p className="text-[12px] text-green-500">Bs. {fmt(stats?.montoMegasoftSi ?? 0)}</p>
            </button>
            <button onClick={() => irAConciliacion("MegasoftNo")} className="bg-blue-50 dark:bg-blue-950/20 rounded-md px-2.5 py-1.5 border border-blue-200/50 text-left hover:bg-blue-100 transition-colors">
              <div className="flex items-center gap-1">
                <ShieldX className="w-3 h-3 text-blue-600" />
                <p className="text-[12px] text-blue-600">Transferidos a contabilidad</p>
              </div>
              <p className="text-base font-bold text-blue-700">{stats?.megasoftNo ?? 0}</p>
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            DIVISAS — fila compacta
            ══════════════════════════════════════════════════════════ */}
        <div className="rounded-lg border bg-card p-2.5">
          <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Divisas</p>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => navigate("/conciliacion?tab=divisas")} className="bg-violet-50 dark:bg-violet-950/20 rounded-md px-2.5 py-1.5 text-left hover:bg-violet-100 transition-colors">
              <div className="flex items-center gap-1">
                <Coins className="w-3 h-3 text-violet-600" />
                <p className="text-[12px] text-violet-600">Total</p>
              </div>
              <p className="text-base font-bold text-violet-700">{stats?.totalDivisas ?? 0}</p>
            </button>
            <button onClick={() => navigate("/conciliacion?tab=divisas&estado=Pendiente")} className="bg-amber-50 dark:bg-amber-950/20 rounded-md px-2.5 py-1.5 text-left hover:bg-amber-100 transition-colors">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-600" />
                <p className="text-[12px] text-amber-600">Pendientes</p>
              </div>
              <p className="text-base font-bold text-amber-700">{stats?.pendientesDivisas ?? 0}</p>
            </button>
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

      {/* ══════════════════════════════════════════════════════════
          GRÁFICOS — colapsables
          ══════════════════════════════════════════════════════════ */}
      <div>
        <button
          onClick={() => setShowCharts(!showCharts)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          {showCharts ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span className="font-medium">{showCharts ? "Ocultar gráficos" : "Ver gráficos"}</span>
        </button>
        {showCharts && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="shadow-none">
              <CardHeader className="pb-1 pt-3 px-3"><CardTitle className="text-sm font-semibold">Pagos por Banco Receptor</CardTitle></CardHeader>
              <CardContent className="px-3 pb-3">{pL ? <Skeleton className="h-36"/> : <ResponsiveContainer width="100%" height={160}><BarChart data={bancoData} margin={{top:5,right:5,left:-20,bottom:45}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" tick={{fontSize:11}} angle={-30} textAnchor="end"/><YAxis tick={{fontSize:11}}/><Tooltip formatter={v=>[v,"Pagos"]}/><Bar dataKey="count" fill="#0A4083" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer>}</CardContent>
            </Card>
            <Card className="shadow-none">
              <CardHeader className="pb-1 pt-3 px-3"><CardTitle className="text-sm font-semibold">Tipo de Pago</CardTitle></CardHeader>
              <CardContent className="px-3 pb-3">{sL ? <Skeleton className="h-36"/> : <ResponsiveContainer width="100%" height={160}><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={4} dataKey="value">{pieData.map((e,i)=><Cell key={i} fill={e.color}/>)}</Pie><Legend formatter={v=><span className="text-[12px]">{v}</span>}/><Tooltip formatter={v=>[v,"Pagos"]}/></PieChart></ResponsiveContainer>}</CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          TABLA — compacta
          ══════════════════════════════════════════════════════════ */}
      <Card className="shadow-none">
        <CardHeader className="pb-1 pt-3 px-3"><CardTitle className="text-sm font-semibold">Últimos Registros{hayFiltro ? ` (filtrados)` : ""}</CardTitle></CardHeader>
        <CardContent className="px-3 pb-3">
          {pL ? <div className="space-y-1.5">{[...Array(3)].map((_,i)=><Skeleton key={i} className="h-8"/>)}</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-border">
                  <th className="text-left py-1.5 px-1.5 text-muted-foreground font-medium">Fecha</th>
                  <th className="text-left py-1.5 px-1.5 text-muted-foreground font-medium">Tipo</th>
                  <th className="text-left py-1.5 px-1.5 text-muted-foreground font-medium">Monto (Bs.)</th>
                  <th className="text-left py-1.5 px-1.5 text-muted-foreground font-medium hidden md:table-cell">Banco Emisor</th>
                  <th className="text-left py-1.5 px-1.5 text-muted-foreground font-medium">Estado</th>
                </tr></thead>
                <tbody>
                  {pagos.slice(0,5).map(p=>(
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="py-1 px-1.5">{p.fechaPago}</td>
                      <td className="py-1 px-1.5"><span className={`px-1.5 py-0.5 rounded text-[12px] font-medium ${p.tipoPago==="PagoMovil"?"bg-blue-100 text-blue-700":"bg-emerald-100 text-emerald-700"}`}>{p.tipoPago==="PagoMovil"?"Móvil":"Transf."}</span></td>
                      <td className="py-1 px-1.5 font-mono font-semibold">{parseFloat(p.monto).toLocaleString("es-ES",{minimumFractionDigits:2})}</td>
                      <td className="py-1 px-1.5 hidden md:table-cell text-muted-foreground">{p.bancoEmisor}</td>
                      <td className="py-1 px-1.5"><span className={`px-1.5 py-0.5 rounded text-[12px] font-medium ${estadoColor[p.estado]??""}`}>{p.estado}</span></td>
                    </tr>
                  ))}
                  {pagos.length===0&&<tr><td colSpan={5} className="text-center py-4 text-muted-foreground text-sm">No hay pagos{hayFiltro ? " en el rango seleccionado" : " registrados"}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
