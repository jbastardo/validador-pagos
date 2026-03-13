import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { BarChart3, CheckCircle2, Clock, XCircle, Smartphone, ArrowRightLeft, DollarSign, ShieldCheck, ShieldX, ShieldAlert, Coins, ShieldOff, CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

interface Pago { id: string; fechaPago: string; tipoPago: string; bancoEmisor: string; bancoReceptor: string; monto: string; estado: string; megasoft?: string; }
interface Stats {
  total: number; pendientes: number; verificados: number; rechazados: number;
  pagoMovil: number; transferencias: number; montoTotal: number;
  megasoftSi: number; megasoftNo: number; megasoftPendiente: number; montoMegasoftSi: number;
  rechazadosMegasoft: number;
  totalDivisas: number; pendientesDivisas: number; montoDivisas: number;
}

function StatCard({ title, value, icon: Icon, color, subtitle, onClick, clickable }: {
  title: string; value: string | number; icon: any; color: string; subtitle?: string;
  onClick?: () => void; clickable?: boolean;
}) {
  return (
    <Card
      className={clickable ? "cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-150 active:scale-[0.99]" : ""}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            {clickable && <p className="text-xs text-primary mt-1 font-medium">Ver operaciones →</p>}
          </div>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}><Icon className="w-5 h-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

const estadoColor: Record<string, string> = { Pendiente: "bg-amber-100 text-amber-700", Verificado: "bg-green-100 text-green-700", Rechazado: "bg-red-100 text-red-700", "Rechazado Megasoft": "bg-orange-100 text-orange-700" };

export default function Dashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: rawStats, isLoading: sL } = useQuery<Stats>({ queryKey: ["/api/stats"] });
  const { data: allPagos, isLoading: pL } = useQuery<Pago[]>({ queryKey: ["/api/pagos"] });

  // ── Filtro de fechas ──
  const today = new Date().toISOString().split("T")[0];
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const pagos = useMemo(() => {
    if (!allPagos) return [];
    return allPagos.filter(p => {
      if (fechaDesde && p.fechaPago < fechaDesde) return false;
      if (fechaHasta && p.fechaPago > fechaHasta) return false;
      return true;
    });
  }, [allPagos, fechaDesde, fechaHasta]);

  const hayFiltro = !!(fechaDesde || fechaHasta);

  // Stats recalculados con filtro de fechas
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
      totalDivisas:      rawStats?.totalDivisas ?? 0,
      pendientesDivisas: rawStats?.pendientesDivisas ?? 0,
      montoDivisas:      rawStats?.montoDivisas ?? 0,
    };
  }, [hayFiltro, rawStats, pagos, allPagos]);

  const fmt = (n: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 }).format(n);

  // Navega a Conciliación con filtro de estado
  const irAConciliacion = (estado: string) => {
    navigate(`/conciliacion?estado=${encodeURIComponent(estado)}${fechaDesde ? `&desde=${fechaDesde}` : ""}${fechaHasta ? `&hasta=${fechaHasta}` : ""}`);
  };

  const porBanco: Record<string, number> = {};
  pagos.forEach(p => { const b = (p.bancoReceptor || "").replace(/^\d+\s/, "").substring(0, 14); if (b) porBanco[b] = (porBanco[b] || 0) + 1; });
  const bancoData = Object.entries(porBanco).map(([name, count]) => ({ name, count })).sort((a,b)=>b.count-a.count).slice(0,6);
  const pieData = [{ name: "Pago Móvil", value: stats?.pagoMovil ?? 0, color: "#3b82f6" }, { name: "Transferencia", value: stats?.transferencias ?? 0, color: "#10b981" }];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Bienvenido, {user?.nombre} · {new Date().toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        {/* ── Filtro de fechas ── */}
        <Card className="w-full sm:w-auto">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Desde</Label>
                <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="h-7 text-xs w-36"/>
              </div>
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Hasta</Label>
                <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="h-7 text-xs w-36"/>
              </div>
              {hayFiltro && (
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => { setFechaDesde(""); setFechaHasta(""); }}>
                  Limpiar
                </Button>
              )}
            </div>
            {hayFiltro && <p className="text-xs text-primary mt-1 font-medium">Mostrando {pagos.length} de {allPagos?.length ?? 0} pagos</p>}
          </CardContent>
        </Card>
      </div>

      {sL ? <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(7)].map((_,i)=><Skeleton key={i} className="h-24 rounded-xl"/>)}</div> : <>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard title="Total Pagos"  value={stats?.total ?? 0}      icon={BarChart3}    color="bg-blue-100 text-blue-600"
            clickable onClick={() => irAConciliacion("todos")} />
          <StatCard title="Pendientes"   value={stats?.pendientes ?? 0} icon={Clock}        color="bg-amber-100 text-amber-600"
            clickable onClick={() => irAConciliacion("Pendiente")} />
          <StatCard title="Verificados"  value={stats?.verificados ?? 0}icon={CheckCircle2} color="bg-green-100 text-green-600"
            clickable onClick={() => irAConciliacion("Verificado")} />
          <StatCard title="Rechazados"   value={stats?.rechazados ?? 0} icon={XCircle}      color="bg-red-100 text-red-600"
            clickable onClick={() => irAConciliacion("Rechazado")} />
          <StatCard title="Rech. Megasoft" value={stats?.rechazadosMegasoft ?? 0} icon={ShieldOff} color="bg-orange-100 text-orange-600"
            clickable onClick={() => irAConciliacion("Rechazado Megasoft")} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Monto Total"     value={`Bs. ${fmt(stats?.montoTotal ?? 0)}`} icon={DollarSign}    color="bg-primary/10 text-primary" subtitle="Pagos no rechazados" />
          <StatCard title="Pago Móvil"      value={stats?.pagoMovil ?? 0}                icon={Smartphone}    color="bg-blue-50 text-blue-500"
            clickable onClick={() => irAConciliacion("PagoMovil")} />
          <StatCard title="Transferencias"  value={stats?.transferencias ?? 0}           icon={ArrowRightLeft} color="bg-emerald-50 text-emerald-500"
            clickable onClick={() => irAConciliacion("Transferencia")} />
        </div>
      </>}

      {/* ── Sección Megasoft ── */}
      {!sL && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Validación Megasoft</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-green-200 bg-green-50/40 dark:bg-green-950/20">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-green-700 uppercase tracking-wide">Aprobados Megasoft</p>
                    <p className="text-2xl font-bold text-green-800 mt-1">{stats?.megasoftSi ?? 0}</p>
                    <p className="text-xs text-green-600 mt-0.5 font-medium">Bs. {fmt(stats?.montoMegasoftSi ?? 0)}</p>
                  </div>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-green-100 text-green-600">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-orange-200 bg-orange-50/40 dark:bg-orange-950/20">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-orange-700 uppercase tracking-wide">Rechazados Megasoft</p>
                    <p className="text-2xl font-bold text-orange-800 mt-1">{stats?.rechazadosMegasoft ?? 0}</p>
                    <p className="text-xs text-orange-600 mt-0.5">Cajero marcó No</p>
                  </div>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-orange-100 text-orange-600">
                    <ShieldOff className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50/40 dark:bg-red-950/20">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-red-700 uppercase tracking-wide">No validados Megasoft</p>
                    <p className="text-2xl font-bold text-red-800 mt-1">{stats?.megasoftNo ?? 0}</p>
                    <p className="text-xs text-red-600 mt-0.5">Validados por contabilidad</p>
                  </div>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-red-100 text-red-600">
                    <ShieldX className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card
              className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-150"
              onClick={() => irAConciliacion("PendienteCajero")}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Pendiente cajero</p>
                    <p className="text-2xl font-bold text-amber-800 mt-1">{stats?.megasoftPendiente ?? 0}</p>
                    <p className="text-xs text-amber-600 mt-0.5">Verificados sin revisar</p>
                    <p className="text-xs text-amber-700 mt-1 font-medium">Ver operaciones →</p>
                  </div>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-amber-100 text-amber-600">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── Sección Pagos en Divisas ── */}
      {!sL && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Pagos en Divisas</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-violet-200 bg-violet-50/40 dark:bg-violet-950/20">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-violet-700 uppercase tracking-wide">Total Divisas</p>
                    <p className="text-2xl font-bold text-violet-800 mt-1">{stats?.totalDivisas ?? 0}</p>
                    <p className="text-xs text-violet-600 mt-0.5">Pagos registrados</p>
                  </div>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-violet-100 text-violet-600">
                    <Coins className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/20">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Pendientes Divisas</p>
                    <p className="text-2xl font-bold text-amber-800 mt-1">{stats?.pendientesDivisas ?? 0}</p>
                    <p className="text-xs text-amber-600 mt-0.5">Por verificar</p>
                  </div>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-amber-100 text-amber-600">
                    <Clock className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide">Monto Total Divisas</p>
                    <p className="text-2xl font-bold text-emerald-800 mt-1">${fmt(stats?.montoDivisas ?? 0)}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">Pagos no rechazados</p>
                  </div>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-emerald-100 text-emerald-600">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Pagos por Banco Receptor</CardTitle></CardHeader>
          <CardContent>{pL ? <Skeleton className="h-48"/> : <ResponsiveContainer width="100%" height={200}><BarChart data={bancoData} margin={{top:5,right:5,left:-20,bottom:45}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" tick={{fontSize:10}} angle={-30} textAnchor="end"/><YAxis tick={{fontSize:10}}/><Tooltip formatter={v=>[v,"Pagos"]}/><Bar dataKey="count" fill="hsl(var(--primary))" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer>}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Tipo de Pago</CardTitle></CardHeader>
          <CardContent>{sL ? <Skeleton className="h-48"/> : <ResponsiveContainer width="100%" height={200}><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">{pieData.map((e,i)=><Cell key={i} fill={e.color}/>)}</Pie><Legend formatter={v=><span className="text-xs">{v}</span>}/><Tooltip formatter={v=>[v,"Pagos"]}/></PieChart></ResponsiveContainer>}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Últimos Registros{hayFiltro ? ` (filtrados)` : ""}</CardTitle></CardHeader>
        <CardContent>
          {pL ? <div className="space-y-2">{[...Array(3)].map((_,i)=><Skeleton key={i} className="h-12"/>)}</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Fecha</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Tipo</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Monto (Bs.)</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium hidden md:table-cell">Banco Emisor</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Estado</th>
                </tr></thead>
                <tbody>
                  {pagos.slice(0,5).map(p=>(
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-2">{p.fechaPago}</td>
                      <td className="py-2 px-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.tipoPago==="PagoMovil"?"bg-blue-100 text-blue-700":"bg-emerald-100 text-emerald-700"}`}>{p.tipoPago==="PagoMovil"?"📱 Pago Móvil":"🏦 Transferencia"}</span></td>
                      <td className="py-2 px-2 font-mono font-semibold">{parseFloat(p.monto).toLocaleString("es-ES",{minimumFractionDigits:2})}</td>
                      <td className="py-2 px-2 hidden md:table-cell text-muted-foreground">{p.bancoEmisor}</td>
                      <td className="py-2 px-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estadoColor[p.estado]??""}`}>{p.estado}</span></td>
                    </tr>
                  ))}
                  {pagos.length===0&&<tr><td colSpan={5} className="text-center py-6 text-muted-foreground">No hay pagos{hayFiltro ? " en el rango de fechas seleccionado" : " registrados"}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
