import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClipboardList, Clock, CheckCircle2, XCircle, Loader2, Timer, Users, PackageX } from "lucide-react";

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

function calculateBusinessHours(da: Date, db: Date): number {
  if (da >= db) return 0;

  let current = new Date(da.getFullYear(), da.getMonth(), da.getDate());
  const endDate = new Date(db.getFullYear(), db.getMonth(), db.getDate());
  let totalMs = 0;

  while (current <= endDate) {
    const dayOfWeek = current.getDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
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
  if (hours < 24) return `${hours.toFixed(1)} hrs`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return `${days}d ${rem.toFixed(0)}h`;
}

function Card({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className={`rounded-lg border p-4 bg-${color}-50`}>
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs font-medium text-muted-foreground">{label}</span></div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

export default function DashboardSolicitudes() {
  const [filtroVendedor, setFiltroVendedor] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");

  const { data: solicitudes = [], isLoading } = useQuery<Solicitud[]>({
    queryKey: ["solicitudes"],
    queryFn: () => fetch("/api/solicitudes").then(r => r.json()),
  });

  const vendedores = useMemo(() => [...new Set(solicitudes.map(s => s.vendedor))].sort(), [solicitudes]);

  const filtradas = useMemo(() => {
    return solicitudes.filter(s => {
      if (filtroVendedor && s.vendedor !== filtroVendedor) return false;
      if (filtroDesde) { const d = parseDate(s.creadoEn); if (d && d < new Date(filtroDesde)) return false; }
      if (filtroHasta) { const d = parseDate(s.creadoEn); if (d && d > new Date(filtroHasta + "T23:59:59")) return false; }
      return true;
    });
  }, [solicitudes, filtroVendedor, filtroDesde, filtroHasta]);

  const stats = useMemo(() => {
    const total = filtradas.length;
    const pendientes = filtradas.filter(s => s.estado === "Pendiente").length;
    const enProceso = filtradas.filter(s => s.estado === "En Proceso").length;
    const completadas = filtradas.filter(s => s.estado === "Completada").length;
    const canceladas = filtradas.filter(s => s.estado === "Cancelada").length;
    const agotados = filtradas.filter(s => s.estado === "Agotado").length;
    const tiempos = filtradas
      .filter(s => s.actualizadoEn && s.estado !== "Pendiente")
      .map(s => diffHours(s.creadoEn, s.actualizadoEn!))
      .filter((h): h is number => h !== null);
    const avgRespuesta = tiempos.length > 0 ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : null;
    const porVendedor = vendedores.map(v => {
      const sus = filtradas.filter(s => s.vendedor === v);
      const susT = sus.filter(s => s.actualizadoEn && s.estado !== "Pendiente").map(s => diffHours(s.creadoEn, s.actualizadoEn!)).filter((h): h is number => h !== null);
      return { vendedor: v, total: sus.length, pendientes: sus.filter(s => s.estado === "Pendiente").length, completadas: sus.filter(s => s.estado === "Completada").length, canceladas: sus.filter(s => s.estado === "Cancelada").length, agotados: sus.filter(s => s.estado === "Agotado").length, avgHoras: susT.length > 0 ? susT.reduce((a, b) => a + b, 0) / susT.length : null };
    });
    return { total, pendientes, enProceso, completadas, canceladas, agotados, avgRespuesta, porVendedor };
  }, [filtradas, vendedores]);

  if (isLoading) return <p className="p-6">Cargando...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard de Solicitudes</h1>
      <div className="flex items-center gap-4 flex-wrap">
        <div><Label className="text-xs">Desde</Label><Input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} className="w-[160px]" /></div>
        <div><Label className="text-xs">Hasta</Label><Input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} className="w-[160px]" /></div>
        <div><Label className="text-xs">Vendedor</Label>
          <Select value={filtroVendedor || "todos"} onValueChange={v => setFiltroVendedor(v === "todos" ? "" : v)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos</SelectItem>{vendedores.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card icon={<ClipboardList className="h-5 w-5 text-blue-600" />} label="Total" value={stats.total} color="blue" />
        <Card icon={<Clock className="h-5 w-5 text-yellow-600" />} label="Pendientes" value={stats.pendientes} color="yellow" />
        <Card icon={<Loader2 className="h-5 w-5 text-indigo-600" />} label="En Proceso" value={stats.enProceso} color="indigo" />
        <Card icon={<CheckCircle2 className="h-5 w-5 text-green-600" />} label="Completadas" value={stats.completadas} color="green" />
        <Card icon={<XCircle className="h-5 w-5 text-red-600" />} label="Canceladas" value={stats.canceladas} color="red" />
        <Card icon={<PackageX className="h-5 w-5 text-orange-600" />} label="Agotados" value={stats.agotados} color="orange" />
      </div>
      <div className="rounded-lg border p-4 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center gap-2 mb-2"><Timer className="h-5 w-5 text-indigo-600" /><h2 className="text-lg font-semibold">Eficiencia de Respuesta</h2></div>
        <p className="text-sm text-muted-foreground mb-1">Tiempo promedio de respuesta en horario laboral (Lun - Vie 8:00 AM - 6:00 PM)</p>
        <p className="text-3xl font-bold text-indigo-700">{stats.avgRespuesta !== null ? formatDuration(stats.avgRespuesta) : "Sin datos"}</p>
      </div>
      <div className="rounded-md border">
        <div className="flex items-center gap-2 p-4 border-b bg-muted/50"><Users className="h-4 w-4" /><h2 className="font-semibold text-sm">Desglose por Vendedor</h2></div>
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/30">
            <th className="p-3 text-left">Vendedor</th>
            <th className="p-3 text-center">Total</th>
            <th className="p-3 text-center">Pendientes</th>
            <th className="p-3 text-center">Completadas</th>
            <th className="p-3 text-center">Canceladas</th>
            <th className="p-3 text-center">Agotados</th>
            <th className="p-3 text-center">Tiempo Prom. Respuesta</th>
          </tr></thead>
          <tbody>
            {stats.porVendedor.map(v => (
              <tr key={v.vendedor} className="border-b">
                <td className="p-3">{v.vendedor}</td>
                <td className="p-3 text-center font-medium">{v.total}</td>
                <td className="p-3 text-center"><Badge variant="default">{v.pendientes}</Badge></td>
                <td className="p-3 text-center"><Badge variant="outline">{v.completadas}</Badge></td>
                <td className="p-3 text-center"><Badge variant="destructive">{v.canceladas}</Badge></td>
                <td className="p-3 text-center"><Badge variant="secondary">{v.agotados}</Badge></td>
                <td className="p-3 text-center font-medium">{v.avgHoras !== null ? formatDuration(v.avgHoras) : "\u2014"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
