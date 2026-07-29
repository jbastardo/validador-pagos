import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Usuario } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2,
  XCircle,
  Download,
  RefreshCw,
  CheckCheck,
  AlertCircle,
  Pencil,
  Ban,
  ArrowDownToLine,
  History,
  Search,
  Link,
  X,
} from "lucide-react";
import { useHashLocation } from "wouter/use-hash-location";

/**
 * Parsea montos en formato venezolano (puntos = miles, coma = decimal).
 * Ejemplos: "7.863,76" → 7863.76, "7863,76" → 7863.76, "17.602,32" → 17602.32
 * También maneja formato US "7,863.76" → 7863.76 y números planos.
 */
function parseMontoVzla(val: string | number): number {
  if (typeof val === "number") return val;
  let s = String(val).trim();
  s = s.replace(/[Bb][Ss]\.?\s*/g, "").replace(/\$/g, "").trim();
  if (s.includes(",") && s.includes(".")) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  s = s.replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

interface Props {
  user: Usuario;
}

interface PagoImportado {
  id: string;
  fechaPago: string;
  bancoEmisor: string;
  bancoReceptor: string;
  referencia: string;
  monto: string;
  cliente: string;
  estado: string;
  validadoPor: string;
  validadoEn: string;
  conciliadoEn: string;
  match: boolean;
  matchTipo: "exacto" | "fuzzy" | null;
  extractoId: string | null;
  extractoRef: string | null;
  extractoMonto: number | null;
  extractoFecha: string | null;
  extractoDesc: string | null;
  rowIndex: number;
}

interface ExtractoResult {
  id: string;
  fecha: string;
  banco: string;
  referencia: string;
  monto: number;
  descripcion: string;
  tipo: string;
  creadoEn: string;
  archivoOrigen: string;
  cargadoPor: string;
}

// Estado local por fila para los que ya fueron procesados manualmente en esta sesión
interface AccionManual {
  estado: "Conciliado" | "Rechazado";
  extractoId?: string;
  observaciones?: string;
}

const BANCOS_BS = [
  { codigo: "todos", nombre: "Todos los bancos" },
  { codigo: "0134", nombre: "Banesco (0134)" },
  { codigo: "0191", nombre: "BNC (0191)" },
  { codigo: "0102", nombre: "BDV (0102)" },
];

export default function ImportarPagos({ user }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useHashLocation();

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const [banco, setBanco] = useState("todos");
  const [fechaDesde, setFechaDesde] = useState(yesterday);
  const [fechaHasta, setFechaHasta] = useState(today);
  const [estadoValidador, setEstadoValidador] = useState("Verificado");
  const [buscar, setBuscar] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());

  // Acciones manuales registradas en esta sesión (por rowIndex)
  const [accionesManual, setAccionesManual] = useState<Record<number, AccionManual>>({});

  // ─── Feature 1: Filtros de la tabla de resultados ─────────────────────────
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");

  // ─── Feature 2: Panel de conciliación manual con búsqueda de extractos ────
  const [conciliarPago, setConciliarPago] = useState<PagoImportado | null>(null);
  // Búsqueda de extractos dentro del panel
  const [busqFecha, setBusqFecha] = useState("");
  const [busqBanco, setBusqBanco] = useState("todos");
  const [busqMonto, setBusqMonto] = useState("");
  const [busqTolerancia, setBusqTolerancia] = useState("5");
  const [busqReferencia, setBusqReferencia] = useState("");
  const [extractosResults, setExtractosResults] = useState<ExtractoResult[]>([]);
  const [buscandoExtractos, setBuscandoExtractos] = useState(false);
  const [busquedaRealizada, setBusquedaRealizada] = useState(false);
  const [conciliarObs, setConciliarObs] = useState("");

  // Diálogo de rechazo (simple, sin búsqueda de extractos)
  const [rechazarPago, setRechazarPago] = useState<PagoImportado | null>(null);
  const [rechazarObs, setRechazarObs] = useState("");

  // Query — solo se activa cuando buscar=true
  const { data, isLoading, refetch } = useQuery<{ ok: boolean; pagos: PagoImportado[] }>({
    queryKey: ["/api/importar-pagos", banco, fechaDesde, fechaHasta, estadoValidador],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (banco && banco !== "todos") params.set("banco", banco);
      if (fechaDesde) params.set("fechaDesde", fechaDesde);
      if (fechaHasta) params.set("fechaHasta", fechaHasta);
      if (estadoValidador && estadoValidador !== "todos") params.set("estado", estadoValidador);
      else if (estadoValidador === "todos") params.set("estado", "todos");
      const res = await fetch(`/api/importar-pagos?${params}`);
      if (!res.ok) throw new Error("Error al importar pagos");
      return res.json();
    },
    enabled: buscar,
    staleTime: 0,
  });

  const pagos = data?.pagos ?? [];

  // ─── Feature 1: Filtrado client-side de la tabla ──────────────────────────
  const pagosFiltrados = useMemo(() => {
    let resultado = pagos;

    // Filtro por estado de match
    if (filtroEstado === "exacto") {
      resultado = resultado.filter((p) => p.matchTipo === "exacto");
    } else if (filtroEstado === "fuzzy") {
      resultado = resultado.filter((p) => p.matchTipo === "fuzzy");
    } else if (filtroEstado === "sinMatch") {
      resultado = resultado.filter((p) => !p.match);
    } else if (filtroEstado === "conciliado") {
      resultado = resultado.filter((p) => accionesManual[p.rowIndex]?.estado === "Conciliado");
    } else if (filtroEstado === "noConciliado") {
      resultado = resultado.filter(
        (p) => !p.match || accionesManual[p.rowIndex]?.estado === "Rechazado"
      );
    }

    // Filtro de texto libre (fecha, banco, referencia, monto, cliente)
    if (filtroTexto.trim()) {
      const q = filtroTexto.toLowerCase().trim();
      resultado = resultado.filter((p) => {
        const campos = [
          p.fechaPago,
          p.bancoEmisor,
          p.bancoReceptor,
          p.referencia,
          String(p.monto),
          p.cliente,
          p.extractoRef,
        ];
        return campos.some((c) => c && c.toLowerCase().includes(q));
      });
    }

    return resultado;
  }, [pagos, filtroTexto, filtroEstado, accionesManual]);

  const exactos = pagos.filter((p) => p.matchTipo === "exacto");
  const fuzzy = pagos.filter((p) => p.matchTipo === "fuzzy");
  const sinMatch = pagos.filter((p) => !p.match);

  // Pagos que pueden seleccionarse (exactos + fuzzy), sin los ya procesados manualmente
  const seleccionables = pagos.filter(
    (p) => p.match && !accionesManual[p.rowIndex]
  );

  // Estado de progreso para la operación batch
  const [batchProgress, setBatchProgress] = useState<string | null>(null);

  // Mutación confirmar conciliación en lote (exactos / fuzzy seleccionados)
  const confirmar = useMutation({
    mutationFn: async (
      items: Array<{
        rowIndex: number;
        extractoId: string;
        pagoId?: string;
        referenciaPago?: string;
        referenciaExtracto?: string;
        montoPago?: number;
        montoExtracto?: number;
        banco?: string;
        cliente?: string;
        matchTipo?: string;
      }>
    ) => {
      setBatchProgress(`Enviando ${items.length} pago(s) al servidor...`);
      const res = await apiRequest("POST", "/api/confirmar-conciliacion", {
        pagos: items,
        conciliadoPor: user.username,
      });
      setBatchProgress("Procesando respuesta...");
      return res.json();
    },
    onSuccess: (data) => {
      setBatchProgress(null);
      if (data.ok) {
        toast({
          title: "Conciliación completada",
          description: `${data.conciliados} pago(s) marcados como conciliados`,
        });
        setSeleccionados(new Set());
        qc.invalidateQueries({ queryKey: ["/api/importar-pagos"] });
        qc.invalidateQueries({ queryKey: ["/api/stats"] });
        qc.invalidateQueries({ queryKey: ["/api/pagos"] });
        refetch();
      } else {
        toast({
          title: "Errores parciales",
          description: data.errores?.join(", "),
          variant: "destructive",
        });
      }
    },
    onError: (e: any) => {
      setBatchProgress(null);
      toast({ title: "Error al conciliar", description: e.message, variant: "destructive" });
    },
  });

  // Mutación para conciliación / rechazo manual
  const conciliarManual = useMutation({
    mutationFn: async (payload: {
      rowIndex: number;
      accion: "conciliar" | "rechazar";
      extractoId?: string;
      referenciaExtracto?: string;
      montoExtracto?: number;
      observaciones?: string;
      pagoId?: string;
      referenciaPago?: string;
      montoPago?: number;
      banco?: string;
      cliente?: string;
    }) => {
      const res = await apiRequest("POST", "/api/conciliar-manual", {
        ...payload,
        conciliadoPor: user.username,
      });
      return res.json();
    },
    onSuccess: (data, variables) => {
      if (data.ok) {
        const accion = variables.accion;
        setAccionesManual((prev) => ({
          ...prev,
          [variables.rowIndex]: {
            estado: accion === "conciliar" ? "Conciliado" : "Rechazado",
            extractoId: variables.extractoId,
            observaciones: variables.observaciones,
          },
        }));
        toast({
          title: accion === "conciliar" ? "Conciliado manualmente" : "Rechazado",
          description:
            accion === "conciliar"
              ? "Operación conciliada y registrada."
              : "Operación marcada como no conciliada.",
        });
        setConciliarPago(null);
        setRechazarPago(null);
        qc.invalidateQueries({ queryKey: ["/api/stats"] });
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const toggleSeleccion = (rowIndex: number) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const seleccionarExactos = () => {
    const rows = exactos
      .filter((p) => !accionesManual[p.rowIndex])
      .map((p) => p.rowIndex);
    setSeleccionados((prev) => {
      if (rows.every((r) => prev.has(r))) {
        const next = new Set(prev);
        rows.forEach((r) => next.delete(r));
        return next;
      }
      return new Set([...Array.from(prev), ...rows]);
    });
  };

  const seleccionarTodos = () => {
    const rows = seleccionables.map((p) => p.rowIndex);
    setSeleccionados((prev) => {
      if (rows.every((r) => prev.has(r))) {
        return new Set();
      }
      return new Set(rows);
    });
  };

  const handleConfirmar = () => {
    const items = pagos
      .filter((p) => p.match && seleccionados.has(p.rowIndex) && p.extractoId && !accionesManual[p.rowIndex])
      .map((p) => ({
        rowIndex: p.rowIndex,
        extractoId: p.extractoId!,
        pagoId: p.id,
        referenciaPago: p.referencia,
        referenciaExtracto: p.extractoRef ?? "",
        montoPago: parseMontoVzla(p.monto),
        montoExtracto: p.extractoMonto ?? 0,
        banco: p.bancoReceptor || p.bancoEmisor,
        cliente: p.cliente,
        matchTipo: p.matchTipo ?? "fuzzy",
      }));
    if (items.length === 0) {
      toast({ title: "Sin selección", description: "Selecciona al menos un pago", variant: "destructive" });
      return;
    }
    confirmar.mutate(items);
  };

  // ─── Feature 2: Abrir panel de conciliación manual con búsqueda ───────────
  const abrirConciliarPanel = async (pago: PagoImportado) => {
    setConciliarPago(pago);
    setConciliarObs("");
    setExtractosResults([]);
    setBusquedaRealizada(false);

    // Pre-llenar campos de búsqueda con datos del pago
    const fechaISO = toISO(pago.fechaPago);
    setBusqFecha(fechaISO);
    setBusqBanco(pago.bancoReceptor || pago.bancoEmisor || "todos");
    setBusqMonto(String(parseMontoVzla(pago.monto) || ""));
    setBusqTolerancia("5");
    setBusqReferencia(pago.referencia);

    // Auto-buscar extractos
    await buscarExtractos(fechaISO, pago.bancoReceptor || pago.bancoEmisor || "", String(parseMontoVzla(pago.monto) || ""), "5", pago.referencia);
  };

  const abrirRechazar = (pago: PagoImportado) => {
    setRechazarPago(pago);
    setRechazarObs("");
  };

  // Búsqueda de extractos en el servidor
  const buscarExtractos = async (fecha?: string, bancoVal?: string, monto?: string, tolerancia?: string, referencia?: string) => {
    setBuscandoExtractos(true);
    setBusquedaRealizada(true);
    try {
      const params = new URLSearchParams();
      const f = fecha ?? busqFecha;
      const b = bancoVal ?? busqBanco;
      const m = monto ?? busqMonto;
      const t = tolerancia ?? busqTolerancia;
      const r = referencia ?? busqReferencia;

      if (f) params.set("fecha", f);
      if (b && b !== "todos") params.set("banco", b);
      if (m) params.set("monto", m);
      if (t) params.set("tolerancia", t);
      if (r) params.set("referencia", r);

      const res = await fetch(`/api/extractos/buscar?${params}`);
      if (!res.ok) throw new Error("Error buscando extractos");
      const data = await res.json();
      setExtractosResults(data.extractos || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setExtractosResults([]);
    } finally {
      setBuscandoExtractos(false);
    }
  };

  // Vincular pago con extracto
  const handleVincular = (extracto: ExtractoResult) => {
    if (!conciliarPago) return;
    conciliarManual.mutate({
      rowIndex: conciliarPago.rowIndex,
      accion: "conciliar",
      extractoId: extracto.id,
      referenciaExtracto: extracto.referencia,
      montoExtracto: extracto.monto,
      observaciones: conciliarObs || undefined,
      pagoId: conciliarPago.id,
      referenciaPago: conciliarPago.referencia,
      montoPago: parseMontoVzla(conciliarPago.monto),
      banco: conciliarPago.bancoReceptor || conciliarPago.bancoEmisor,
      cliente: conciliarPago.cliente,
    });
  };

  // Rechazar pago
  const handleRechazar = () => {
    if (!rechazarPago) return;
    conciliarManual.mutate({
      rowIndex: rechazarPago.rowIndex,
      accion: "rechazar",
      observaciones: rechazarObs || undefined,
      pagoId: rechazarPago.id,
      referenciaPago: rechazarPago.referencia,
      montoPago: parseMontoVzla(rechazarPago.monto),
      banco: rechazarPago.bancoReceptor || rechazarPago.bancoEmisor,
      cliente: rechazarPago.cliente,
    });
  };

  const fmtMonto = (v: string | number) => {
    const n = parseMontoVzla(v);
    return isNaN(n) || n === 0 && String(v).trim() !== "0" ? String(v) : n.toLocaleString("es-VE", { minimumFractionDigits: 2 });
  };

  // Convierte DD/MM/YYYY a YYYY-MM-DD
  function toISO(d: string): string {
    if (!d) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    const [dd, mm, yyyy] = d.split("/");
    if (!yyyy) return d;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  function fmtFecha(d: string): string {
    if (!d) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
      const [y, m, dd] = d.split("-");
      return `${dd}/${m}/${y}`;
    }
    return d;
  }

  return (
    <div className="space-y-5 w-full">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <ArrowDownToLine className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Importar Pagos</h1>
            <p className="text-sm text-muted-foreground">
              Concilia los pagos verificados contra los extractos bancarios cargados.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/historial")}
          className="gap-2 h-9 shrink-0"
        >
          <History className="w-3.5 h-3.5" />
          Ver historial
        </Button>
      </div>

      {/* Filtros de importación */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold text-muted-foreground">Filtros de búsqueda</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="banco-select">Banco receptor</Label>
              <Select value={banco} onValueChange={setBanco}>
                <SelectTrigger id="banco-select" data-testid="select-banco">
                  <SelectValue placeholder="Todos los bancos" />
                </SelectTrigger>
                <SelectContent>
                  {BANCOS_BS.map((b) => (
                    <SelectItem key={b.codigo} value={b.codigo}>
                      {b.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="estado-validador">Estado validador</Label>
              <Select value={estadoValidador} onValueChange={setEstadoValidador}>
                <SelectTrigger id="estado-validador" data-testid="select-estado-validador">
                  <SelectValue placeholder="Verificado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Verificado">Verificado</SelectItem>
                  <SelectItem value="Pendiente">Pendiente</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fecha-desde">Desde</Label>
              <Input
                id="fecha-desde"
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                data-testid="input-fecha-desde"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fecha-hasta">Hasta</Label>
              <Input
                id="fecha-hasta"
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                data-testid="input-fecha-hasta"
              />
            </div>

            <Button
              onClick={() => { setBuscar(true); setTimeout(() => refetch(), 50); }}
              className="gap-2"
              data-testid="button-buscar"
            >
              <Download className="w-4 h-4" />
              Importar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resultados */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Cargando pagos...
        </div>
      )}

      {!isLoading && buscar && pagos.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No se encontraron pagos para los filtros seleccionados.
        </div>
      )}

      {pagos.length > 0 && (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{exactos.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Match exacto</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{fuzzy.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sugerido (revisar)</p>
            </div>
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-500 dark:text-red-400">{sinMatch.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sin coincidencia</p>
            </div>
          </div>

          {/* Leyenda */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground bg-muted/40 rounded-lg px-4 py-2.5">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <strong className="text-foreground">Exacto:</strong> referencia y monto coinciden al centavo
            </span>
            <span className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              <strong className="text-foreground">Sugerido:</strong> mismo banco, fecha y monto (±5 Bs) — ref puede diferir, revisar
            </span>
            <span className="flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-red-400" />
              <strong className="text-foreground">Sin match:</strong> sin operación automática — usar botones de acción manual
            </span>
          </div>

          {/* Feature 1: Barra de búsqueda y filtros de la tabla */}
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="filtro-texto" className="text-xs text-muted-foreground">Buscar en resultados</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="filtro-texto"
                      placeholder="Buscar por fecha, banco, referencia, monto, cliente..."
                      value={filtroTexto}
                      onChange={(e) => setFiltroTexto(e.target.value)}
                      className="pl-9"
                    />
                    {filtroTexto && (
                      <button
                        onClick={() => setFiltroTexto("")}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="w-full sm:w-48 space-y-1.5">
                  <Label htmlFor="filtro-estado" className="text-xs text-muted-foreground">Estado</Label>
                  <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                    <SelectTrigger id="filtro-estado">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos ({pagos.length})</SelectItem>
                      <SelectItem value="exacto">Exacto ({exactos.length})</SelectItem>
                      <SelectItem value="fuzzy">Sugerido ({fuzzy.length})</SelectItem>
                      <SelectItem value="sinMatch">Sin match ({sinMatch.length})</SelectItem>
                      <SelectItem value="conciliado">Conciliado</SelectItem>
                      <SelectItem value="noConciliado">No conciliado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(filtroTexto || filtroEstado !== "todos") && (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Mostrando {pagosFiltrados.length} de {pagos.length} pagos</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => { setFiltroTexto(""); setFiltroEstado("todos"); }}
                  >
                    Limpiar filtros
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Barra de acciones en lote */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={seleccionarExactos} disabled={confirmar.isPending} data-testid="button-select-exactos">
                {exactos.filter((p) => !accionesManual[p.rowIndex]).every((p) => seleccionados.has(p.rowIndex)) &&
                  exactos.filter((p) => !accionesManual[p.rowIndex]).length > 0
                  ? "Deseleccionar exactos"
                  : "Seleccionar exactos"}
              </Button>
              <Button variant="outline" size="sm" onClick={seleccionarTodos} disabled={confirmar.isPending} data-testid="button-select-all">
                {seleccionables.every((p) => seleccionados.has(p.rowIndex)) && seleccionables.length > 0
                  ? "Deseleccionar todos"
                  : "Seleccionar todos"}
              </Button>
              {seleccionados.size > 0 && !confirmar.isPending && (
                <span className="text-sm text-muted-foreground">{seleccionados.size} seleccionado(s)</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {confirmar.isPending && batchProgress && (
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  {batchProgress}
                </span>
              )}
              <Button
                onClick={handleConfirmar}
                disabled={seleccionados.size === 0 || confirmar.isPending}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid="button-confirmar"
              >
                {confirmar.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Conciliando {seleccionados.size} pago(s)...
                  </>
                ) : (
                  <>
                    <CheckCheck className="w-4 h-4" />
                    Confirmar conciliación ({seleccionados.size})
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Tabla */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Banco</TableHead>
                    <TableHead>Ref. pago</TableHead>
                    <TableHead className="text-right">Monto pago</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-center">Est. validador</TableHead>
                    <TableHead className="text-center w-28">Match</TableHead>
                    {/* Columnas del extracto sugerido */}
                    <TableHead className="text-muted-foreground">Ref. extracto</TableHead>
                    <TableHead className="text-right text-muted-foreground">Monto extracto</TableHead>
                    {/* Acciones manuales */}
                    <TableHead className="text-center">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagosFiltrados.map((p) => {
                    const isFuzzy = p.matchTipo === "fuzzy";
                    const isExacto = p.matchTipo === "exacto";
                    const accionReg = accionesManual[p.rowIndex];

                    const rowBg = accionReg
                      ? accionReg.estado === "Conciliado"
                        ? "bg-emerald-50/60 dark:bg-emerald-950/20"
                        : "bg-slate-50 dark:bg-slate-900/20 opacity-60"
                      : seleccionados.has(p.rowIndex)
                      ? "bg-primary/5"
                      : isFuzzy
                      ? "bg-amber-50/40 dark:bg-amber-950/10"
                      : "";

                    return (
                      <TableRow
                        key={p.rowIndex}
                        data-testid={`row-pago-${p.rowIndex}`}
                        className={rowBg}
                      >
                        {/* Checkbox — disponible para exacto y fuzzy no procesados */}
                        <TableCell>
                          {p.match && !accionReg && (
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-primary cursor-pointer"
                              checked={seleccionados.has(p.rowIndex)}
                              onChange={() => toggleSeleccion(p.rowIndex)}
                              data-testid={`checkbox-pago-${p.rowIndex}`}
                            />
                          )}
                        </TableCell>

                        {/* Datos del pago registrado */}
                        <TableCell className="text-sm whitespace-nowrap">{p.fechaPago}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{p.bancoReceptor || p.bancoEmisor}</TableCell>
                        <TableCell className="text-sm font-mono">{p.referencia}</TableCell>
                        <TableCell className="text-sm text-right font-mono">
                          {fmtMonto(p.monto)} Bs
                        </TableCell>
                        <TableCell className="text-sm max-w-[130px] truncate" title={p.cliente}>
                          {p.cliente || "—"}
                        </TableCell>

                        {/* Estado en el validador */}
                        <TableCell className="text-center">
                          {p.estado === "Verificado" ? (
                            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border-0 text-xs">
                              Verificado
                            </Badge>
                          ) : (
                            <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400 border-0 text-xs">
                              {p.estado || "Pendiente"}
                            </Badge>
                          )}
                        </TableCell>

                        {/* Badge de match */}
                        <TableCell className="text-center">
                          {accionReg ? (
                            accionReg.estado === "Conciliado" ? (
                              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-0 gap-1 text-xs">
                                <CheckCircle2 className="w-3 h-3" />
                                Conciliado
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-slate-500 border-slate-300 gap-1 text-xs">
                                <Ban className="w-3 h-3" />
                                Rechazado
                              </Badge>
                            )
                          ) : isExacto ? (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-0 gap-1 text-xs">
                              <CheckCircle2 className="w-3 h-3" />
                              Exacto
                            </Badge>
                          ) : isFuzzy ? (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-0 gap-1 text-xs">
                              <AlertCircle className="w-3 h-3" />
                              Sugerido
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-400 border-red-200 gap-1 text-xs">
                              <XCircle className="w-3 h-3" />
                              Sin match
                            </Badge>
                          )}
                        </TableCell>

                        {/* Extracto sugerido */}
                        <TableCell className="text-sm font-mono text-muted-foreground">
                          {p.extractoRef || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-right font-mono text-muted-foreground">
                          {p.extractoMonto != null ? `${fmtMonto(p.extractoMonto)} Bs` : "—"}
                        </TableCell>

                        {/* Botones de acción manual */}
                        <TableCell className="text-center">
                          {accionReg ? (
                            <span className="text-xs text-muted-foreground italic">Procesado</span>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                                onClick={() => abrirConciliarPanel(p)}
                                title="Conciliar manualmente"
                                data-testid={`btn-conciliar-${p.rowIndex}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-400 hover:bg-red-50 hover:text-red-500"
                                onClick={() => abrirRechazar(p)}
                                title="Rechazar"
                                data-testid={`btn-rechazar-${p.rowIndex}`}
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {/* ─── Feature 2: Panel de conciliación manual con búsqueda de extractos ─── */}
      <Dialog open={!!conciliarPago} onOpenChange={(open) => !open && setConciliarPago(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              Conciliar manualmente
            </DialogTitle>
          </DialogHeader>

          {conciliarPago && (
            <div className="space-y-4">
              {/* Info del pago */}
              <div className="bg-muted/40 rounded-lg p-3 space-y-1 text-sm">
                <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2">Datos del pago</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fecha:</span>
                    <span className="font-medium">{conciliarPago.fechaPago}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Banco:</span>
                    <span className="font-medium">{conciliarPago.bancoReceptor || conciliarPago.bancoEmisor}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Referencia:</span>
                    <span className="font-mono font-medium">{conciliarPago.referencia}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monto:</span>
                    <span className="font-mono font-medium">{fmtMonto(conciliarPago.monto)} Bs</span>
                  </div>
                  <div className="flex justify-between col-span-2">
                    <span className="text-muted-foreground">Cliente:</span>
                    <span className="truncate max-w-[300px]">{conciliarPago.cliente || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Campos de búsqueda de extractos */}
              <div className="border rounded-lg p-3 space-y-3">
                <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Buscar en extractos bancarios</p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Fecha</Label>
                    <Input
                      type="date"
                      value={busqFecha}
                      onChange={(e) => setBusqFecha(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Banco</Label>
                    <Select value={busqBanco} onValueChange={setBusqBanco}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BANCOS_BS.map((b) => (
                          <SelectItem key={b.codigo} value={b.codigo}>
                            {b.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Monto</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={busqMonto}
                      onChange={(e) => setBusqMonto(e.target.value)}
                      className="h-8 text-sm"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tolerancia Bs</Label>
                    <Input
                      type="number"
                      step="1"
                      value={busqTolerancia}
                      onChange={(e) => setBusqTolerancia(e.target.value)}
                      className="h-8 text-sm"
                      placeholder="5"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Referencia</Label>
                    <Input
                      value={busqReferencia}
                      onChange={(e) => setBusqReferencia(e.target.value)}
                      className="h-8 text-sm"
                      placeholder="ref..."
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => buscarExtractos()}
                  disabled={buscandoExtractos}
                  className="gap-2"
                >
                  {buscandoExtractos ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  Buscar extractos
                </Button>
              </div>

              {/* Resultados de extractos */}
              {busquedaRealizada && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/30 px-3 py-2 border-b">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {buscandoExtractos
                        ? "Buscando..."
                        : extractosResults.length > 0
                        ? `${extractosResults.length} extracto(s) encontrado(s)`
                        : "Sin resultados — ajusta los filtros e intenta de nuevo"}
                    </p>
                  </div>

                  {extractosResults.length > 0 && (
                    <div className="overflow-x-auto max-h-60 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Fecha</TableHead>
                            <TableHead className="text-xs">Banco</TableHead>
                            <TableHead className="text-xs">Referencia</TableHead>
                            <TableHead className="text-xs text-right">Monto</TableHead>
                            <TableHead className="text-xs">Descripción</TableHead>
                            <TableHead className="text-xs text-center w-24">Acción</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {extractosResults.map((ext) => {
                            const montoPago = parseMontoVzla(conciliarPago.monto);
                            const diff = Math.abs(ext.monto - montoPago);
                            const diffClass =
                              diff < 0.01
                                ? "text-emerald-600"
                                : diff <= 5
                                ? "text-amber-600"
                                : "text-red-500";
                            return (
                              <TableRow key={ext.id} className="hover:bg-muted/20">
                                <TableCell className="text-xs whitespace-nowrap">{fmtFecha(ext.fecha)}</TableCell>
                                <TableCell className="text-xs whitespace-nowrap">{ext.banco}</TableCell>
                                <TableCell className="text-xs font-mono">{ext.referencia}</TableCell>
                                <TableCell className="text-xs text-right font-mono">
                                  <span>{fmtMonto(ext.monto)} Bs</span>
                                  <span className={`block text-[10px] ${diffClass}`}>
                                    {diff < 0.01 ? "= exacto" : `${diff > 0 ? "+" : ""}${diff.toFixed(2)} Bs`}
                                  </span>
                                </TableCell>
                                <TableCell className="text-xs max-w-[150px] truncate" title={ext.descripcion}>
                                  {ext.descripcion || "—"}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Button
                                    size="sm"
                                    className="h-7 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={() => handleVincular(ext)}
                                    disabled={conciliarManual.isPending}
                                  >
                                    <Link className="w-3 h-3" />
                                    Vincular
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              {/* Observaciones opcionales */}
              <div className="space-y-1.5">
                <Label htmlFor="conciliar-obs" className="text-xs">Observaciones (opcional)</Label>
                <Textarea
                  id="conciliar-obs"
                  placeholder="Notas adicionales..."
                  value={conciliarObs}
                  onChange={(e) => setConciliarObs(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConciliarPago(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de rechazo (simple) */}
      <Dialog open={!!rechazarPago} onOpenChange={(open) => !open && setRechazarPago(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar operación</DialogTitle>
          </DialogHeader>

          {rechazarPago && (
            <div className="space-y-4">
              <div className="bg-muted/40 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Referencia:</span>
                  <span className="font-mono font-medium">{rechazarPago.referencia}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monto:</span>
                  <span className="font-mono">{fmtMonto(rechazarPago.monto)} Bs</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cliente:</span>
                  <span className="truncate max-w-[180px]">{rechazarPago.cliente || "—"}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rechazar-obs">Motivo del rechazo</Label>
                <Textarea
                  id="rechazar-obs"
                  placeholder="Motivo del rechazo..."
                  value={rechazarObs}
                  onChange={(e) => setRechazarObs(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRechazarPago(null)}>Cancelar</Button>
            <Button
              onClick={handleRechazar}
              disabled={conciliarManual.isPending}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {conciliarManual.isPending ? "Procesando..." : "Confirmar rechazo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
