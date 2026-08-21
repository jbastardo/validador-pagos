import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Clock, CheckCircle2, XCircle, Loader2, Timer, Users, PackageX, User, ChevronRight } from "lucide-react";

interface Solicitud {
  id: string; vendedor: string; cliente: string; celular: string; sku: string;
  producto: string; cantidad: string;
  fechaTope: string; observaciones: string; estado: string; creadoEn: string;
  observacionesCompras?: string; actualizadoEn?: string; respondidoPor?: string;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const VENEZUELA_HOLIDAYS = new Set([
  // 2025
  "2025-01-01", "2025-02-03", "2025-02-04", "2025-04-17", "2025-04-18", "2025-04-19",
  "2025-05-01", "2025-06-24", "2025-07-05", "2025-07-24", "2025-10-12", "2025-12-24", "2025-12-25", "2025-12-31",
  // 2026
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-04-02", "2026-04-03", "2026-04-19",
  "2026-05-01", "2026-06-24", "2026-07-05", "2026-07-24", "2026-10-12", "2026-12-24", "2026-12-25", "2026-12-31",
]);

function isHoliday(date: Date): boolean {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return VENEZUELA_HOLIDAYS.has(`${yyyy}--`);
}

function calculateBusinessHours(da: Date, db: Date): number {
  if (da >= db) return 0;
  let current = new Date(da.getFullYear(), da.getMonth(), da.getDate());
  const endDate = new Date(db.getFullYear(), db.getMonth(), db.getDate());
  let totalMs = 0;
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const feriado = isHoliday(current);
    if (!isWeekend && !feriado) {
      const workStart = new Date(current.getFullYear(), current.getMonth(), current.getDate(), 8, 0, 0, 0);
      const workEnd = new Date(current.getFullYear(), current.getMonth(), current.getDate(), 18, 0, 0, 0);
      const overlapStart = Math.max(da.getTime(), workStart.getTime());
      const overlapEnd = Math.min(db.getTime(), workEnd.getTime());
      if (overlapEnd > overlapStart) {
        totalMs += (overlapEnd - overlapStart);
      }
    }
    current.setDate(current.getDate() + 1);
  }
  return totalMs / 3600000;
}

function diffHours(a: string, b: string): number | null {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return null;
  const start = da < db ? da : db;
  const end = da < db ? db : da;
  return calculateBusinessHours(start, end);
}

function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 10) return `${hours.toFixed(1)} hrs hábiles`;
  const days = Math.floor(hours / 10);
  const rem = hours % 10;
  return `${days}d h hábiles`;
}

function MetricCard({ icon, label, value, colorClass }: { icon: React.ReactNode, label: string, value: number | string, colorClass: string }) {
  return (
    <div className={"rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between "}>
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-white/60 rounded-xl">{icon}</div>
        <span className="text-sm font-semibold opacity-90">{label}</span>
      </div>
      <p className="text-4xl font-extrabold tracking-tight">{value}</p>
    </div>
  );
}

export default function DashboardSolicitudes() {
  const [filtroFecha, setFiltroFecha] = useState("30");
  const [selectedAsesor, setSelectedAsesor] = useState<string | null>(null);

  const { data: solicitudes = [], isLoading } = useQuery<Solicitud[]>({
    queryKey: ["solicitudes"],
    queryFn: () => fetch("/api/solicitudes").then(r => r.json()),
  });

  const vendedores = useMemo(() => [...new Set(solicitudes.map(s => s.vendedor))].sort(), [solicitudes]);

  const filtradas = useMemo(() => {
    return solicitudes.filter(s => {
      if (filtroFecha !== "todos") {
        const d = parseDate(s.creadoEn);
        if (!d) return false;
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - d.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > parseInt(filtroFecha)) return false;
      }
      return true;
    });
  }, [solicitudes, filtroFecha]);

  const stats = useMemo(() => {
    const calcStats = (arr: Solicitud[]) => {
      const tiempos = arr
        .filter(s => s.actualizadoEn && s.estado !== "Pendiente")
        .map(s => diffHours(s.creadoEn, s.actualizadoEn!))
        .filter((h): h is number => h !== null);
      
      const avgRespuesta = tiempos.length > 0 ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : null;

      return {
        total: arr.length,
        pendientes: arr.filter(s => s.estado === "Pendiente").length,
        enProceso: arr.filter(s => s.estado === "En Proceso").length,
        completadas: arr.filter(s => s.estado === "Completada").length,
        canceladas: arr.filter(s => s.estado === "Cancelada").length,
        agotados: arr.filter(s => s.estado === "Agotado").length,
        noConcretados: arr.filter(s => s.estado === "No Concretado").length,
        avgRespuesta,
        eficiencia: arr.length > 0 ? Math.round((arr.filter(s => s.estado === "Completada").length / arr.length) * 100) : 0,
      };
    };

    const global = calcStats(filtradas);
    const porVendedor = vendedores.map(v => {
      const sus = filtradas.filter(s => s.vendedor === v);
      return { vendedor: v, ...calcStats(sus) };
    }).filter(v => v.total > 0);

    return { global, porVendedor };
  }, [filtradas, vendedores]);

  if (isLoading) return <p className="p-6">Cargando...</p>;

  const currentStats = selectedAsesor 
    ? stats.porVendedor.find(v => v.vendedor === selectedAsesor) || stats.global 
    : stats.global;

  const currentName = selectedAsesor || "Consolidado Global";

  return (
    <div className="space-y-6 p-4 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Dashboard de Rendimiento</h1>
          <p className="text-muted-foreground mt-1">Métricas, tiempos y evaluación de eficiencia comercial.</p>
        </div>
        
        <div className="bg-white p-2 rounded-xl border shadow-sm flex items-center gap-3">
          <Clock className="h-4 w-4 text-gray-400 ml-2" />
          <Select value={filtroFecha} onValueChange={setFiltroFecha}>
            <SelectTrigger className="w-[170px] border-0 bg-transparent shadow-none font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 días</SelectItem>
              <SelectItem value="30">Últimos 30 días</SelectItem>
              <SelectItem value="90">Últimos 90 días</SelectItem>
              <SelectItem value="todos">Histórico completo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Asesores */}
        <div className="w-full lg:w-64 space-y-2 shrink-0">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Vista Activa</h2>
          <button 
            onClick={() => setSelectedAsesor(null)}
            className={"w-full flex items-center justify-between p-3 rounded-xl transition-all font-medium "}
          >
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Global
            </div>
            {!selectedAsesor && <ChevronRight className="h-4 w-4 opacity-70" />}
          </button>

          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mt-6 mb-3">Asesores Comerciales</h2>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
            {stats.porVendedor.map(v => (
              <button 
                key={v.vendedor}
                onClick={() => setSelectedAsesor(v.vendedor)}
                className={"w-full flex items-center justify-between p-3 rounded-xl transition-all font-medium "}
              >
                <div className="flex items-center gap-2 truncate">
                  <User className="h-5 w-5 shrink-0" /> 
                  <span className="truncate">{v.vendedor}</span>
                </div>
                {selectedAsesor === v.vendedor && <ChevronRight className="h-4 w-4 opacity-70 shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* Burbuja Principal */}
        <div className="flex-1 bg-white rounded-3xl border border-gray-200 shadow-sm p-6 lg:p-8">
          <div className="flex items-center justify-between mb-8 pb-4 border-b">
            <div>
              <h2 className="text-2xl font-bold">{currentName}</h2>
              <p className="text-muted-foreground">Resumen operativo para el periodo seleccionado</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-extrabold text-indigo-600">{currentStats.total}</div>
              <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Operaciones</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
            <MetricCard icon={<Loader2 className="h-6 w-6 text-indigo-700" />} label="En Proceso" value={currentStats.enProceso} colorClass="bg-indigo-50 border-indigo-100 text-indigo-900" />
            <MetricCard icon={<CheckCircle2 className="h-6 w-6 text-green-700" />} label="Completadas" value={currentStats.completadas} colorClass="bg-emerald-50 border-emerald-100 text-emerald-900" />
            <MetricCard icon={<Clock className="h-6 w-6 text-amber-700" />} label="Pendientes" value={currentStats.pendientes} colorClass="bg-amber-50 border-amber-100 text-amber-900" />
            <MetricCard icon={<PackageX className="h-6 w-6 text-orange-700" />} label="Agotados" value={currentStats.agotados} colorClass="bg-orange-50 border-orange-100 text-orange-900" />
            <MetricCard icon={<XCircle className="h-6 w-6 text-red-700" />} label="Canceladas" value={currentStats.canceladas} colorClass="bg-rose-50 border-rose-100 text-rose-900" />
            <div className="rounded-2xl border p-5 shadow-sm flex flex-col justify-between bg-gray-50 border-gray-200 text-gray-700">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-white/60 rounded-xl"><ClipboardList className="h-6 w-6 text-gray-500" /></div>
                <span className="text-sm font-semibold opacity-90">Efectividad / Cierre</span>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-4xl font-extrabold tracking-tight">{currentStats.eficiencia}%</p>
                <span className="text-sm font-medium">éxito</span>
              </div>
            </div>
          </div>

          {/* Tiempos y Eficiencia */}
          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-blue-50/50 p-6 flex flex-col md:flex-row items-center gap-6">
            <div className="p-4 bg-indigo-100 text-indigo-600 rounded-full shrink-0">
              <Timer className="h-10 w-10" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-xl font-bold text-indigo-950 mb-1">Tiempo Promedio de Respuesta</h3>
              <p className="text-indigo-800/80 text-sm">Calculado en base a horario laboral (Lun - Vie, 8:00 AM - 6:00 PM) para las solicitudes gestionadas.</p>
            </div>
            <div className="text-center md:text-right shrink-0">
              <p className="text-3xl font-extrabold text-indigo-600">
                {currentStats.avgRespuesta !== null ? formatDuration(currentStats.avgRespuesta) : "N/A"}
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
