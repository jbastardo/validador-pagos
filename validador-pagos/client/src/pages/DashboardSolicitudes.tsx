import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

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

function StatTable({ title, nameLabel, nameValue, stats }: { title?: string, nameLabel: string, nameValue: string, stats: any }) {
  return (
    <div className="rounded-3xl border border-gray-300 p-5 shadow-sm bg-white overflow-hidden">
      {title && <h3 className="font-bold mb-4 text-lg">{title}</h3>}
      <div className="grid grid-cols-[auto_1fr_auto] gap-x-6 gap-y-2 text-sm">
        <div className="font-bold border-b border-gray-100 pb-1">{nameLabel}</div>
        <div className="font-bold border-b border-gray-100 pb-1">status</div>
        <div className="font-bold border-b border-gray-100 pb-1 text-right">numero de operaciones</div>
        
        <div className="font-medium row-span-6 pt-1">{nameValue}</div>
        <div className="pt-1">En proceso</div>
        <div className="pt-1 text-right">{stats.enProceso || 0}</div>
        
        <div className="col-start-2">Agotado</div>
        <div className="text-right">{stats.agotados || 0}</div>
        
        <div className="col-start-2">Cancelada</div>
        <div className="text-right">{stats.canceladas || 0}</div>
        
        <div className="col-start-2">Pendiente</div>
        <div className="text-right">{stats.pendientes || 0}</div>
        
        <div className="col-start-2">Completada</div>
        <div className="text-right">{stats.completadas || 0}</div>
        
        {/* No Concretado agregado por solicitud del mockup aunque no exista en db an */}
        <div className="col-start-2">No Concretado</div>
        <div className="text-right">{stats.noConcretados || 0}</div>
        
        <div className="col-start-2 font-bold mt-2 pt-2 border-t border-gray-200"></div>
        <div className="text-right font-bold text-lg mt-2 pt-2 border-t border-gray-200">{stats.total || 0}</div>
      </div>
    </div>
  );
}

export default function DashboardSolicitudes() {
  const [filtroFecha, setFiltroFecha] = useState("30"); // 7, 30, 90, todos

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
    const calcStats = (arr: Solicitud[]) => ({
      total: arr.length,
      pendientes: arr.filter(s => s.estado === "Pendiente").length,
      enProceso: arr.filter(s => s.estado === "En Proceso").length,
      completadas: arr.filter(s => s.estado === "Completada").length,
      canceladas: arr.filter(s => s.estado === "Cancelada").length,
      agotados: arr.filter(s => s.estado === "Agotado").length,
      noConcretados: arr.filter(s => s.estado === "No Concretado").length, // Para coincidir con el mockup
    });

    const global = calcStats(filtradas);
    const porVendedor = vendedores.map(v => {
      const sus = filtradas.filter(s => s.vendedor === v);
      return { vendedor: v, ...calcStats(sus) };
    }).filter(v => v.total > 0); // Ocultar asesores sin ventas en el periodo

    return { global, porVendedor };
  }, [filtradas, vendedores]);

  if (isLoading) return <p className="p-6">Cargando...</p>;

  return (
    <div className="space-y-8 p-4 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-2xl font-bold">Dashboard de Solicitudes</h1>
        
        <div className="bg-white p-3 rounded-2xl border border-gray-300 shadow-sm flex items-center gap-4">
          <Label className="font-bold text-sm uppercase text-gray-500">Filtro Fecha:</Label>
          <Select value={filtroFecha} onValueChange={setFiltroFecha}>
            <SelectTrigger className="w-[180px] border-0 bg-gray-50 shadow-none">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Tabla General */}
        <StatTable nameLabel="" nameValue="" stats={stats.global} />
        
        {/* Espacio vaco para alinear como en el mockup si es necesario, o dejar que fluya */}
        <div className="hidden lg:block"></div>

        {/* Tablas por Asesor */}
        {stats.porVendedor.map(v => (
          <StatTable key={v.vendedor} nameLabel="Asesor" nameValue={v.vendedor} stats={v} />
        ))}
      </div>
    </div>
  );
}
