import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { History, Download, Search, CheckCircle2, XCircle, Zap, Pencil, RefreshCw, Sparkles } from "lucide-react";
import { extractBancoCode } from "@shared/schema";
import type { Usuario } from "@shared/schema";

interface Props { user: Usuario; }

interface ConciliacionRow {
  id: string;
  fecha: string;
  pagoId: string;
  extractoId: string;
  referenciaPago: string;
  referenciaExtracto: string;
  montoPago: string;
  montoExtracto: string;
  banco: string;
  cliente: string;
  conciliadoPor: string;
  conciliadoEn: string;
  tipo: string;        // "automatico" | "manual"
  estado: string;      // "Conciliado" | "Rechazado"
  observaciones: string;
}

const BANCOS = [
  { codigo: "todos", nombre: "Todos los bancos" },
  { codigo: "0102", nombre: "Banco de Venezuela" },
  { codigo: "0134", nombre: "Banesco" },
  { codigo: "0191", nombre: "BNC (Banco Nacional de Crédito)" },
];

export default function Historial({ user }: Props) {
  const today     = new Date().toISOString().slice(0, 10);
  const monthAgo  = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [fechaDesde,    setFechaDesde]    = useState(monthAgo);
  const [fechaHasta,    setFechaHasta]    = useState(today);
  const [filtroTipo,    setFiltroTipo]    = useState("todos");
  const [filtroEstado,  setFiltroEstado]  = useState("todos");
  const [filtroBanco,   setFiltroBanco]   = useState("todos");
  const [busqueda,      setBusqueda]      = useState("");

  const params = new URLSearchParams();
  if (fechaDesde)                         params.set("fechaDesde", fechaDesde);
  if (fechaHasta)                         params.set("fechaHasta", fechaHasta);
  if (filtroTipo   !== "todos")           params.set("tipo",   filtroTipo);
  if (filtroEstado !== "todos")           params.set("estado", filtroEstado);

  const { data: conciliaciones = [], isLoading, refetch, isFetching } = useQuery<ConciliacionRow[]>({
    queryKey: ["/api/historial-completo", fechaDesde, fechaHasta, filtroTipo, filtroEstado],
    queryFn: async () => {
      const res = await fetch(`/api/historial-completo?${params.toString()}`);
      if (!res.ok) throw new Error("Error al cargar historial");
      return res.json();
    },
  });

  // Filtro adicional en cliente por búsqueda de texto y banco
  const filtrados = conciliaciones.filter((r) => {
    const q = busqueda.toLowerCase();
    const mq = !q || [r.referenciaPago, r.referenciaExtracto, r.cliente, r.pagoId, r.conciliadoPor]
      .some((v) => v?.toLowerCase().includes(q));
    const mb = filtroBanco === "todos" || extractBancoCode(r.banco) === filtroBanco;
    return mq && mb;
  });

  // Totales
  const totalConciliados = filtrados.filter((r) => r.estado === "Conciliado").length;
  const totalRechazados  = filtrados.filter((r) => r.estado === "Rechazado").length;
  const totalAuto        = filtrados.filter((r) => r.tipo === "automatico").length;
  const totalSugerido    = filtrados.filter((r) => r.tipo === "sugerido").length;
  const totalManual      = filtrados.filter((r) => r.tipo === "manual").length;

  const fmtMonto = (v: string | number) => {
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.]/g, ""));
    return isNaN(n) ? String(v) : n.toLocaleString("es-VE", { minimumFractionDigits: 2 });
  };

  const fmtFecha = (iso?: string) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch { return iso; }
  };

  const handleExport = () => {
    const headers = ["ID","Fecha","Pago ID","Extracto ID","Ref. Pago","Ref. Extracto","Monto Pago","Monto Extracto","Banco","Cliente","Conciliado Por","Conciliado En","Tipo","Estado","Observaciones"];
    const rows = filtrados.map((r) => [
      r.id, r.fecha, r.pagoId, r.extractoId, r.referenciaPago, r.referenciaExtracto,
      r.montoPago, r.montoExtracto, r.banco, r.cliente, r.conciliadoPor, r.conciliadoEn,
      r.tipo, r.estado, r.observaciones,
    ]);
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${v ?? ""}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `historial_conciliaciones_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <History className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Historial de Conciliaciones</h1>
            <p className="text-sm text-muted-foreground">Registro permanente de todas las operaciones procesadas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2 h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Actualizando..." : "Actualizar"}
          </Button>
          {filtrados.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2 h-9">
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col md:flex-row gap-3 flex-wrap items-end">
            {/* Búsqueda */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por referencia, cliente, usuario..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Banco */}
            <Select value={filtroBanco} onValueChange={setFiltroBanco}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Banco" />
              </SelectTrigger>
              <SelectContent>
                {BANCOS.map((b) => (
                  <SelectItem key={b.codigo} value={b.codigo}>{b.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Tipo */}
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los tipos</SelectItem>
                <SelectItem value="automatico">Automático (exacto)</SelectItem>
                <SelectItem value="sugerido">Sugerido (fuzzy)</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>

            {/* Estado */}
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                <SelectItem value="Conciliado">Conciliado</SelectItem>
                <SelectItem value="Rechazado">Rechazado</SelectItem>
              </SelectContent>
            </Select>

            {/* Fechas */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Desde</Label>
              <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="h-9 w-36 text-sm" />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Hasta</Label>
              <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="h-9 w-36 text-sm" />
            </div>
            {(fechaDesde || fechaHasta) && (
              <button
                onClick={() => { setFechaDesde(""); setFechaHasta(""); }}
                className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
              >
                Limpiar
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tarjetas resumen */}
      {!isLoading && filtrados.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{totalConciliados}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Conciliados</p>
          </div>
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-500 dark:text-red-400">{totalRechazados}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Rechazados</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalAuto}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Automáticos</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{totalSugerido}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Sugeridos</p>
          </div>
          <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{totalManual}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Manuales</p>
          </div>
        </div>
      )}

      {/* Tabla */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold">
            {isLoading ? "Cargando..." : `${filtrados.length} registro${filtrados.length !== 1 ? "s" : ""}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}
            </div>
          ) : filtrados.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              <History className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>No hay registros para los filtros seleccionados.</p>
              <p className="text-xs mt-1">Los registros aparecen aquí luego de confirmar conciliaciones en Importar Pagos.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 border-y border-border">
                  <tr>
                    <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Fecha</th>
                    <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Banco</th>
                    <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Ref. Pago</th>
                    <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Ref. Extracto</th>
                    <th className="text-right px-3 py-3 font-semibold text-muted-foreground">Pago Registrado</th>
                    <th className="text-right px-3 py-3 font-semibold text-muted-foreground">Monto Extracto</th>
                    <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Cliente</th>
                    <th className="text-center px-3 py-3 font-semibold text-muted-foreground">Tipo</th>
                    <th className="text-center px-3 py-3 font-semibold text-muted-foreground">Estado</th>
                    <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Procesado por</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-3 py-3 whitespace-nowrap font-medium">{fmtFecha(r.fecha)}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">{r.banco || "—"}</td>
                      <td className="px-3 py-3 font-mono">{r.referenciaPago || "—"}</td>
                      <td className="px-3 py-3 font-mono text-muted-foreground">{r.referenciaExtracto || "—"}</td>
                      <td className="px-3 py-3 text-right font-mono">{r.montoPago ? fmtMonto(r.montoPago) + " Bs" : "—"}</td>
                      <td className="px-3 py-3 text-right font-mono text-muted-foreground">{r.montoExtracto ? fmtMonto(r.montoExtracto) + " Bs" : "—"}</td>
                      <td className="px-3 py-3 max-w-[140px] truncate" title={r.cliente}>{r.cliente || "—"}</td>

                      {/* Tipo badge */}
                      <td className="px-3 py-3 text-center">
                        {r.tipo === "automatico" ? (
                          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0 gap-1 text-[10px] px-1.5">
                            <Zap className="w-2.5 h-2.5" />
                            Auto
                          </Badge>
                        ) : r.tipo === "sugerido" ? (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0 gap-1 text-[10px] px-1.5">
                            <Sparkles className="w-2.5 h-2.5" />
                            Sugerido
                          </Badge>
                        ) : (
                          <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-0 gap-1 text-[10px] px-1.5">
                            <Pencil className="w-2.5 h-2.5" />
                            Manual
                          </Badge>
                        )}
                      </td>

                      {/* Estado badge */}
                      <td className="px-3 py-3 text-center">
                        {r.estado === "Conciliado" ? (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-0 gap-1 text-[10px] px-1.5">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Conciliado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-red-500 border-red-200 gap-1 text-[10px] px-1.5">
                            <XCircle className="w-2.5 h-2.5" />
                            Rechazado
                          </Badge>
                        )}
                      </td>

                      <td className="px-3 py-3 text-muted-foreground max-w-[130px] truncate" title={r.conciliadoPor}>
                        {r.conciliadoPor || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
