import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, Search, Download, AlertCircle, Receipt, Pencil, Info, Trash2, RefreshCw, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";

interface Pago {
  id: string; fechaPago: string; tipoPago: string; bancoEmisor: string;
  monto: string; celular: string; bancoReceptor: string; referencia: string;
  rif: string; factura: string; estado: string; validadoPor: string;
  vendedor: string; observaciones: string; cliente: string; megasoft: string;
  creadoEn?: string; validadoEn?: string;
}

interface PagoDivisa {
  id: string; fecha: string; nombrePagador: string; correo: string;
  monto: string; tipo: string; referencia: string; cliente: string;
  rif: string; factura: string; observaciones: string; estado: string;
  validadoPor: string; vendedor: string; creadoEn?: string; validadoEn?: string;
}

const BANCOS_RECEPTOR = [
  "0102 Banco de Venezuela",
  "0134 Banesco",
  "0191 BNC (Banco Nacional de Crédito)",
];

const estadoColors: Record<string, string> = {
  Pendiente:             "bg-amber-100 text-amber-700 border-amber-200",
  Verificado:            "bg-green-100 text-green-700 border-green-200",
  Rechazado:             "bg-red-100 text-red-700 border-red-200",
  "Rechazado Megasoft":  "bg-orange-100 text-orange-700 border-orange-200",
};
const estadoIcon: Record<string, any> = { Pendiente: Clock, Verificado: CheckCircle2, Rechazado: XCircle, "Rechazado Megasoft": XCircle };

export default function Conciliacion() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Filtros Bs ──
  const [busqueda,       setBusqueda]       = useState("");
  const [filtroEstado,   setFiltroEstado]   = useState("todos");
  const [filtroTipo,     setFiltroTipo]     = useState("todos");
  const [filtroBanco,    setFiltroBanco]    = useState("todos");
  const [filtroVendedor, setFiltroVendedor] = useState("todos");

  // ── Filtros Divisas ──
  const [busqDiv,       setBusqDiv]       = useState("");
  const [filtroEstDiv,  setFiltroEstDiv]  = useState("todos");
  const [filtroTipoDiv, setFiltroTipoDiv] = useState("todos");

  // ── Modal aprobación Bs ──
  const [selected,    setSelected]    = useState<Pago | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [obs,         setObs]         = useState("");
  const [dialogOpen,  setDialogOpen]  = useState(false);

  // ── Modal cajero (Verificado — comportamiento anterior) ──
  const [cajeroPago,    setCajeroPago]    = useState<Pago | null>(null);
  const [cajeroFactura, setCajeroFactura] = useState("");
  const [cajeroMega,    setCajeroMega]    = useState<"Sí" | "No" | "">("");
  const [cajeroOpen,    setCajeroOpen]    = useState(false);

  // ── Modal cajero Pendiente (nuevo) ──
  const [cajPendPago,    setCajPendPago]    = useState<Pago | null>(null);
  const [cajPendFactura, setCajPendFactura] = useState("");
  const [cajPendCliente, setCajPendCliente] = useState("");
  const [cajPendMega,    setCajPendMega]    = useState<"Sí" | "No" | "">("");
  const [cajPendOpen,    setCajPendOpen]    = useState(false);

  // ── Modal aprobación Divisas ──
  const [selectedDiv,    setSelectedDiv]    = useState<PagoDivisa | null>(null);
  const [nuevoEstadoDiv, setNuevoEstadoDiv] = useState("");
  const [obsDiv,         setObsDiv]         = useState("");
  const [dialogDivOpen,  setDialogDivOpen]  = useState(false);

  // ── Modal edición Bs (supervisor) ──
  const [editBsOpen,  setEditBsOpen]  = useState(false);
  const [editBsPago,  setEditBsPago]  = useState<Pago | null>(null);
  const [editBsFecha, setEditBsFecha] = useState("");
  const [editBsEmisor,   setEditBsEmisor]   = useState("");
  const [editBsReceptor, setEditBsReceptor] = useState("");
  const [editBsMonto,    setEditBsMonto]    = useState("");
  const [editBsRef,      setEditBsRef]      = useState("");
  const [editBsCel,      setEditBsCel]      = useState("");
  const [editBsCliente,  setEditBsCliente]  = useState("");

  // ── Modal edición Divisas (supervisor) ──
  const [editDivOpen,    setEditDivOpen]    = useState(false);
  const [editDivPago,    setEditDivPago]    = useState<PagoDivisa | null>(null);
  const [editDivFecha,   setEditDivFecha]   = useState("");
  const [editDivPagador, setEditDivPagador] = useState("");
  const [editDivMonto,   setEditDivMonto]   = useState("");
  const [editDivTipo,    setEditDivTipo]    = useState("");
  const [editDivRef,     setEditDivRef]     = useState("");

  // ── Modal eliminar (admin) ──
  const [deleteOpen,     setDeleteOpen]     = useState(false);
  const [deleteTarget,   setDeleteTarget]   = useState<{ id: string; tipo: "bs" | "div" } | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading,  setDeleteLoading]  = useState(false);

  const isAdmin = user?.rol === "admin";

  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: pagos,   isLoading: loadingBs,  refetch: refetchBs  } = useQuery<Pago[]>      ({ queryKey: ["/api/pagos"] });
  const { data: divisas, isLoading: loadingDiv, refetch: refetchDiv } = useQuery<PagoDivisa[]>({ queryKey: ["/api/pagos-divisas"] });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchBs(), refetchDiv()]);
    setIsRefreshing(false);
  };

  // ── Mutación estado Bs ──
  const updateMutation = useMutation({
    mutationFn: async ({ id, estado, obs }: { id: string; estado: string; obs: string }) => {
      const res = await apiRequest("PATCH", `/api/pagos/${id}/estado`, { estado, validadoPor: user?.email ?? "", observaciones: obs });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pagos"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      setDialogOpen(false);
      toast({ title: "Estado actualizado en Google Sheets" });
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  // ── Mutación cajero ──
  const cajeroMutation = useMutation({
    mutationFn: async ({ id, factura, megasoft }: { id: string; factura: string; megasoft: string }) => {
      const res = await apiRequest("PATCH", `/api/pagos/${id}/cajero`, { factura, megasoft });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "Error");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pagos"] });
      setCajeroOpen(false);
      toast({ title: "Pago actualizado en Google Sheets" });
    },
    onError: (err: any) => toast({ title: err.message ?? "Error al actualizar", variant: "destructive" }),
  });

  // ── Mutación cajero Pendiente ──
  const cajPendMutation = useMutation({
    mutationFn: async ({ id, factura, cliente, megasoft }: { id: string; factura: string; cliente: string; megasoft: string }) => {
      const res = await apiRequest("PATCH", `/api/pagos/${id}/cajero-pendiente`, { factura, cliente, megasoft, cajeroEmail: user?.email ?? "" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "Error");
      return json;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/pagos"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      setCajPendOpen(false);
      const msg = data?.estado === "Verificado"
        ? "Pago aprobado automáticamente por Megasoft ✅"
        : data?.estado === "Rechazado Megasoft"
        ? "Pago marcado como Rechazado por Megasoft"
        : "Datos actualizados en Google Sheets";
      toast({ title: msg });
    },
    onError: (err: any) => toast({ title: err.message ?? "Error al actualizar", variant: "destructive" }),
  });

  // ── Mutación edición Bs (supervisor) ──
  const editBsMutation = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Record<string, string> }) => {
      const res = await apiRequest("PATCH", `/api/pagos/${id}/editar`, campos);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "Error al editar");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pagos"] });
      setEditBsOpen(false);
      toast({ title: "Pago actualizado en Google Sheets" });
    },
    onError: (err: any) => toast({ title: err.message ?? "Error al editar", variant: "destructive" }),
  });

  // ── Mutación edición Divisas (supervisor) ──
  const editDivMutation = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Record<string, string> }) => {
      const res = await apiRequest("PATCH", `/api/pagos-divisas/${id}/editar`, campos);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "Error al editar");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pagos-divisas"] });
      setEditDivOpen(false);
      toast({ title: "Pago en divisas actualizado en Google Sheets" });
    },
    onError: (err: any) => toast({ title: err.message ?? "Error al editar", variant: "destructive" }),
  });

  // ── Mutación eliminar pago Bs ──
  const deleteBsMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const res = await apiRequest("DELETE", `/api/pagos/${id}`, { email: user?.email ?? "", password });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "Error al eliminar");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pagos"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      setDeleteOpen(false);
      setDeletePassword("");
      toast({ title: "Pago eliminado" });
    },
    onError: (err: any) => toast({ title: err.message ?? "Error al eliminar", variant: "destructive" }),
  });

  // ── Mutación eliminar pago Divisas ──
  const deleteDivMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const res = await apiRequest("DELETE", `/api/pagos-divisas/${id}`, { email: user?.email ?? "", password });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "Error al eliminar");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pagos-divisas"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      setDeleteOpen(false);
      setDeletePassword("");
      toast({ title: "Pago en divisas eliminado" });
    },
    onError: (err: any) => toast({ title: err.message ?? "Error al eliminar", variant: "destructive" }),
  });

  const handleDelete = async () => {
    if (!deleteTarget || !deletePassword) return;
    setDeleteLoading(true);
    try {
      if (deleteTarget.tipo === "bs") {
        await deleteBsMutation.mutateAsync({ id: deleteTarget.id, password: deletePassword });
      } else {
        await deleteDivMutation.mutateAsync({ id: deleteTarget.id, password: deletePassword });
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Mutación estado Divisas ──
  const updateDivMutation = useMutation({
    mutationFn: async ({ id, estado, obs }: { id: string; estado: string; obs: string }) => {
      const res = await apiRequest("PATCH", `/api/pagos-divisas/${id}/estado`, { estado, validadoPor: user?.email ?? "", observaciones: obs });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pagos-divisas"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      setDialogDivOpen(false);
      toast({ title: "Estado actualizado en Google Sheets" });
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  const openCajero = (p: Pago) => {
    setCajeroPago(p);
    setCajeroFactura(p.factura ?? "");
    setCajeroMega((p.megasoft as "Sí" | "No" | "") ?? "");
    setCajeroOpen(true);
  };

  const openCajeroPendiente = (p: Pago) => {
    setCajPendPago(p);
    setCajPendFactura(p.factura ?? "");
    setCajPendCliente(p.cliente ?? "");
    setCajPendMega((p.megasoft as "Sí" | "No" | "") ?? "");
    setCajPendOpen(true);
  };

  // Formatea fecha ISO a formato local legible
  const fmtDateTime = (iso?: string) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" });
    } catch { return iso; }
  };

  const openEditBs = (p: Pago) => {
    setEditBsPago(p);
    setEditBsFecha(p.fechaPago ?? "");
    setEditBsEmisor(p.bancoEmisor ?? "");
    setEditBsReceptor(p.bancoReceptor ?? "");
    setEditBsMonto(p.monto ?? "");
    setEditBsRef(p.referencia ?? "");
    setEditBsCel(p.celular ?? "");
    setEditBsCliente(p.cliente ?? "");
    setEditBsOpen(true);
  };

  const openEditDiv = (p: PagoDivisa) => {
    setEditDivPago(p);
    setEditDivFecha(p.fecha ?? "");
    setEditDivPagador(p.nombrePagador ?? "");
    setEditDivMonto(p.monto ?? "");
    setEditDivTipo(p.tipo ?? "");
    setEditDivRef(p.referencia ?? "");
    setEditDivOpen(true);
  };

  const fmt = (v: string) => parseFloat(v || "0").toLocaleString("es-ES", { minimumFractionDigits: 2 });

  // ── Lista de vendedores únicos para filtro ──
  const vendedoresUnicos = Array.from(new Set((pagos ?? []).map(p => p.vendedor).filter(Boolean))).sort();

  // ── Filtrado Bs ──
  const filtradosBs = (pagos ?? []).filter(p => {
    const q = busqueda.toLowerCase();
    const mq = q === "" || [p.referencia, p.monto, p.bancoEmisor, p.celular, p.rif, p.factura, p.vendedor, p.fechaPago, p.cliente].some(v => v?.toLowerCase().includes(q));
    const me = filtroEstado   === "todos" || p.estado === filtroEstado;
    const mt = filtroTipo     === "todos" || p.tipoPago === filtroTipo;
    const mb = filtroBanco    === "todos" || p.bancoReceptor === filtroBanco;
    const mv = filtroVendedor === "todos" || p.vendedor === filtroVendedor;
    return mq && me && mt && mb && mv;
  });

  // ── Filtrado Divisas ──
  const filtradosDiv = (divisas ?? []).filter(p => {
    const q = busqDiv.toLowerCase();
    const mq = q === "" || [p.nombrePagador, p.correo, p.monto, p.tipo, p.referencia, p.cliente, p.rif, p.factura, p.fecha].some(v => v?.toLowerCase().includes(q));
    const me = filtroEstDiv  === "todos" || p.estado === filtroEstDiv;
    const mt = filtroTipoDiv === "todos" || p.tipo   === filtroTipoDiv;
    return mq && me && mt;
  });

  const handleExportBs = () => {
    const h = ["ID","Fecha","Tipo","Banco Emisor","Monto","Celular","Banco Receptor","Referencia","RIF","Factura","Estado","Validado Por","Vendedor","Observaciones","Cliente","Megasoft"];
    const rows = filtradosBs.map(p => [p.id,p.fechaPago,p.tipoPago,p.bancoEmisor,p.monto,p.celular,p.bancoReceptor,p.referencia,p.rif,p.factura,p.estado,p.validadoPor,p.vendedor,p.observaciones,p.cliente,p.megasoft]);
    const csv = [h,...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `conciliacion_bs_${new Date().toISOString().split("T")[0]}.csv`; a.click();
  };

  const handleExportDiv = () => {
    const h = ["ID","Fecha","Nombre Pagador","Correo","Monto","Tipo","Referencia","Cliente","RIF","Factura","Observaciones","Estado","Validado Por","Vendedor"];
    const rows = filtradosDiv.map(p => [p.id,p.fecha,p.nombrePagador,p.correo,p.monto,p.tipo,p.referencia,p.cliente,p.rif,p.factura,p.observaciones,p.estado,p.validadoPor,p.vendedor]);
    const csv = [h,...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `conciliacion_divisas_${new Date().toISOString().split("T")[0]}.csv`; a.click();
  };

  const pendientesBs  = (pagos   ?? []).filter(p => p.estado === "Pendiente").length;
  const pendientesDiv = (divisas ?? []).filter(p => p.estado === "Pendiente").length;
  const isCajero           = user?.rol === "cajero";
  const isVendedor         = user?.rol === "vendedor";
  const isContabilidad     = user?.rol === "contabilidad";
  // Puede aprobar/rechazar
  const isContable         = user?.rol === "admin" || user?.rol === "contabilidad";
  // Puede editar pendientes (contabilidad, admin, vendedor)
  const isSupervisor       = user?.rol === "admin" || user?.rol === "contabilidad" || user?.rol === "vendedor";
  // Puede ver info de validación (quien validó + cuándo)
  const canSeeValidacion   = user?.rol === "admin" || user?.rol === "contabilidad" || user?.rol === "vendedor";

  // Componente tooltip de auditoría — se posiciona sobre el ícono usando getBoundingClientRect
  const AuditTooltip = ({ vendedor, creadoEn, validadoPor, validadoEn, estado }: { vendedor?: string; creadoEn?: string; validadoPor?: string; validadoEn?: string; estado?: string }) => {
    const [show, setShow] = useState(false);
    const [pos, setPos]   = useState<{ top: number; left: number; above: boolean }>({ top: 0, left: 0, above: true });
    const iconRef = useRef<HTMLDivElement>(null);
    const TOOLTIP_H = 180; // altura estimada del panel
    const TOOLTIP_W = 288; // w-72

    const handleEnter = () => {
      if (iconRef.current) {
        const rect = iconRef.current.getBoundingClientRect();
        const spaceAbove = rect.top;
        const above = spaceAbove >= TOOLTIP_H + 8;
        const top  = above ? rect.top - 8  : rect.bottom + 8;
        // centra horizontalmente, ajusta si se sale por la derecha
        let left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
        if (left + TOOLTIP_W > window.innerWidth - 8) left = window.innerWidth - TOOLTIP_W - 8;
        if (left < 8) left = 8;
        setPos({ top, left, above });
      }
      setShow(true);
    };

    const hasValidacion = canSeeValidacion && validadoPor && estado !== "Pendiente";
    return (
      <div ref={iconRef} className="relative inline-flex" onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)}>
        <Info className="w-3.5 h-3.5 text-muted-foreground/60 cursor-pointer hover:text-muted-foreground transition-colors" />
        {show && (
          <div
            className="fixed z-[9999] w-72 bg-popover border border-border rounded-xl shadow-xl p-4 text-xs pointer-events-none"
            style={{
              top:  pos.above ? undefined : pos.top,
              bottom: pos.above ? window.innerHeight - pos.top : undefined,
              left: pos.left,
            }}
          >
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Auditoría del registro</p>
            <div className="space-y-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Registrado por</span>
                <span className="font-medium text-foreground break-all">{vendedor || "—"}</span>
              </div>
              {creadoEn && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground">Fecha y hora de registro</span>
                  <span className="font-medium text-foreground">{fmtDateTime(creadoEn)}</span>
                </div>
              )}
              {hasValidacion && (
                <>
                  <div className="border-t border-border pt-2 mt-1 space-y-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">Validado / procesado por</span>
                      <span className="font-medium text-foreground break-all">{validadoPor}</span>
                    </div>
                    {validadoEn && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground">Fecha y hora de validación</span>
                        <span className="font-medium text-foreground">{fmtDateTime(validadoEn)}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Conciliación de Pagos</h1>
          <p className="text-sm text-muted-foreground">
            {isCajero ? "Agrega el número de factura y valida con Megasoft" : "Verifica y aprueba los pagos — sincronizado con Google Sheets"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(pendientesBs + pendientesDiv) > 0 && !isCajero && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-600"/>
              <span className="text-xs font-semibold text-amber-700">{pendientesBs + pendientesDiv} pendiente{(pendientesBs + pendientesDiv) !== 1 ? "s" : ""}</span>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="gap-2 h-9">
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}/>
            {isRefreshing ? "Actualizando..." : "Actualizar"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="bs">
        <TabsList className="mb-2">
          <TabsTrigger value="bs">
            Pagos en Bs.
            {pendientesBs > 0 && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">{pendientesBs}</span>}
          </TabsTrigger>
          <TabsTrigger value="divisas">
            Pagos en Divisas
            {pendientesDiv > 0 && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-violet-500 text-white text-[10px] font-bold leading-none">{pendientesDiv}</span>}
          </TabsTrigger>
        </TabsList>

        {/* ══════════════ PESTAÑA BS ══════════════ */}
        <TabsContent value="bs" className="space-y-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col md:flex-row gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                  <Input placeholder="Buscar por ref., monto, banco, cliente..." value={busqueda} onChange={e => setBusqueda(e.target.value)} className="pl-9"/>
                </div>
                {!isCajero && (
                  <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                    <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="Estado"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="Pendiente">Pendiente</SelectItem>
                      <SelectItem value="Verificado">Verificado</SelectItem>
                      <SelectItem value="Rechazado">Rechazado</SelectItem>
                      <SelectItem value="Rechazado Megasoft">Rechazado Megasoft</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                  <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="Tipo"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los tipos</SelectItem>
                    <SelectItem value="PagoMovil">Pago Móvil</SelectItem>
                    <SelectItem value="Transferencia">Transferencia</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filtroBanco} onValueChange={setFiltroBanco}>
                  <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="Banco receptor"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los bancos</SelectItem>
                    {BANCOS_RECEPTOR.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
                  <SelectTrigger className="w-full md:w-44"><SelectValue placeholder="Usuario"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los usuarios</SelectItem>
                    {vendedoresUnicos.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={handleExportBs} className="gap-2 shrink-0">
                  <Download className="w-4 h-4"/> Exportar CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{filtradosBs.length} registro{filtradosBs.length !== 1 ? "s" : ""}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingBs
                ? <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 rounded"/>)}</div>
                : filtradosBs.length === 0
                  ? <div className="py-12 text-center text-muted-foreground text-sm">No se encontraron pagos</div>
                  : <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40 border-y border-border">
                          <tr>
                            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Fecha</th>
                            {!isCajero && <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Tipo</th>}
                            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Monto (Bs.)</th>
                            {isCajero && <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Celular</th>}
                            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Banco Emisor</th>
                            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Banco Receptor</th>
                            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Cliente</th>
                            {(isContabilidad || (!isCajero && !isContabilidad)) && <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Referencia</th>}
                            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Factura</th>
                            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Estado</th>
                            {isCajero  && <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Megasoft</th>}
                            {(isSupervisor || isCajero) && <th className="text-right px-3 py-3 font-semibold text-muted-foreground">Acciones</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {filtradosBs.map(p => {
                            const Icon = estadoIcon[p.estado] ?? Clock;
                            return (
                              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                                <td className="px-3 py-3 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    {p.fechaPago}
                                    <AuditTooltip vendedor={p.vendedor} creadoEn={p.creadoEn} validadoPor={p.validadoPor} validadoEn={p.validadoEn} estado={p.estado} />
                                  </div>
                                </td>
                                {!isCajero && (
                                  <td className="px-3 py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.tipoPago === "PagoMovil" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                                      {p.tipoPago === "PagoMovil" ? "📱 Pago Móvil" : "🏦 Transferencia"}
                                    </span>
                                  </td>
                                )}
                                <td className="px-3 py-3 font-mono font-semibold">{fmt(p.monto)}</td>
                                {isCajero && (
                                  <td className="px-3 py-3 font-mono">{p.celular || "—"}</td>
                                )}
                                <td className="px-3 py-3 text-muted-foreground">{p.bancoEmisor || "—"}</td>
                                <td className="px-3 py-3 text-muted-foreground">{p.bancoReceptor || "—"}</td>
                                <td className="px-3 py-3">{p.cliente || "—"}</td>
                                {(isContabilidad || (!isCajero && !isContabilidad)) && <td className="px-3 py-3 font-mono">{p.referencia || "—"}</td>}
                                <td className="px-3 py-3">{p.factura || "—"}</td>
                                <td className="px-3 py-3">
                                  <div className="relative group inline-flex">
                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border cursor-default ${estadoColors[p.estado] ?? ""}`}>
                                      <Icon className="w-3 h-3"/>{p.estado}
                                      {p.observaciones && (p.estado === "Rechazado" || p.estado === "Rechazado Megasoft") && (
                                        <MessageSquare className="w-3 h-3 ml-0.5 opacity-70" />
                                      )}
                                    </span>
                                    {p.observaciones && (p.estado === "Rechazado" || p.estado === "Rechazado Megasoft") && (
                                      <div className="absolute bottom-full left-0 mb-2 z-50 hidden group-hover:block w-64 bg-popover border border-border rounded-xl shadow-xl p-3 text-xs pointer-events-none">
                                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Motivo de rechazo</p>
                                        <p className="text-foreground leading-relaxed">{p.observaciones}</p>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                {isCajero && (
                                  <td className="px-3 py-3">
                                    {p.megasoft
                                      ? <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.megasoft === "Sí" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{p.megasoft}</span>
                                      : <span className="text-muted-foreground">—</span>}
                                  </td>
                                )}
                                {(isSupervisor || isCajero) && (
                                <td className="px-3 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {isContable && (p.estado === "Pendiente" || p.estado === "Rechazado Megasoft") && <>
                                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-green-700 hover:bg-green-50 border-green-200"
                                        onClick={() => { setSelected(p); setNuevoEstado("Verificado"); setObs(""); setDialogOpen(true); }}>
                                        <CheckCircle2 className="w-3 h-3"/> Aprobar
                                      </Button>
                                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-red-700 hover:bg-red-50 border-red-200"
                                        onClick={() => { setSelected(p); setNuevoEstado("Rechazado"); setObs(""); setDialogOpen(true); }}>
                                        <XCircle className="w-3 h-3"/> Rechazar
                                      </Button>
                                    </>}
                                    {isVendedor && p.estado === "Pendiente" && (
                                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-indigo-700 hover:bg-indigo-50 border-indigo-200"
                                        onClick={() => openEditBs(p)}>
                                        <Pencil className="w-3 h-3"/> Editar
                                      </Button>
                                    )}
                                    {isContable && !isVendedor && (p.estado === "Pendiente" || p.estado === "Rechazado Megasoft") && (
                                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-indigo-700 hover:bg-indigo-50 border-indigo-200"
                                        onClick={() => openEditBs(p)}>
                                        <Pencil className="w-3 h-3"/> Editar
                                      </Button>
                                    )}
                                    {isCajero && p.estado === "Pendiente" && (
                                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-orange-700 hover:bg-orange-50 border-orange-200"
                                        onClick={() => openCajeroPendiente(p)}>
                                        <Receipt className="w-3 h-3"/> Caja
                                      </Button>
                                    )}
                                    {isCajero && p.estado === "Verificado" && (
                                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-blue-700 hover:bg-blue-50 border-blue-200"
                                        onClick={() => openCajero(p)}>
                                        <Receipt className="w-3 h-3"/> Editar
                                      </Button>
                                    )}
                                    {isAdmin && (
                                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:bg-red-50 hover:text-red-700"
                                        onClick={() => { setDeleteTarget({ id: p.id, tipo: "bs" }); setDeletePassword(""); setDeleteOpen(true); }}
                                        data-testid={`button-delete-bs-${p.id}`}>
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
              }
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════════ PESTAÑA DIVISAS ══════════════ */}
        <TabsContent value="divisas" className="space-y-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col md:flex-row gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                  <Input placeholder="Buscar por pagador, monto, tipo, cliente..." value={busqDiv} onChange={e => setBusqDiv(e.target.value)} className="pl-9"/>
                </div>
                <Select value={filtroEstDiv} onValueChange={setFiltroEstDiv}>
                  <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="Estado"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="Pendiente">Pendiente</SelectItem>
                    <SelectItem value="Verificado">Verificado</SelectItem>
                    <SelectItem value="Rechazado">Rechazado</SelectItem>
                    <SelectItem value="Rechazado Megasoft">Rechazado Megasoft</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filtroTipoDiv} onValueChange={setFiltroTipoDiv}>
                  <SelectTrigger className="w-full md:w-44"><SelectValue placeholder="Tipo de pago"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los tipos</SelectItem>
                    <SelectItem value="Zelle">Zelle</SelectItem>
                    <SelectItem value="Binance">Binance</SelectItem>
                    <SelectItem value="Banesco Panamá">Banesco Panamá</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={handleExportDiv} className="gap-2 shrink-0">
                  <Download className="w-4 h-4"/> Exportar CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{filtradosDiv.length} registro{filtradosDiv.length !== 1 ? "s" : ""}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingDiv
                ? <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 rounded"/>)}</div>
                : filtradosDiv.length === 0
                  ? <div className="py-12 text-center text-muted-foreground text-sm">No se encontraron pagos en divisas</div>
                  : <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40 border-y border-border">
                          <tr>
                            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Fecha</th>
                            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Tipo</th>
                            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Monto ($)</th>
                            <th className="text-left px-3 py-3 font-semibold text-muted-foreground hidden md:table-cell">Pagador</th>
                            <th className="text-left px-3 py-3 font-semibold text-muted-foreground hidden lg:table-cell">Cliente</th>
                            <th className="text-left px-3 py-3 font-semibold text-muted-foreground hidden lg:table-cell">Referencia</th>
                            <th className="text-left px-3 py-3 font-semibold text-muted-foreground hidden xl:table-cell">Factura</th>
                            <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Estado</th>
                            {isSupervisor && <th className="text-right px-3 py-3 font-semibold text-muted-foreground">Acciones</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {filtradosDiv.map(p => {
                            const Icon = estadoIcon[p.estado] ?? Clock;
                            const tipoColor = p.tipo === "Zelle" ? "bg-blue-100 text-blue-700"
                              : p.tipo === "Binance" ? "bg-yellow-100 text-yellow-700"
                              : "bg-violet-100 text-violet-700";
                            return (
                              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                                <td className="px-3 py-3 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    {p.fecha}
                                    <AuditTooltip vendedor={p.vendedor} creadoEn={p.creadoEn} validadoPor={p.validadoPor} validadoEn={p.validadoEn} estado={p.estado} />
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${tipoColor}`}>{p.tipo}</span>
                                </td>
                                <td className="px-3 py-3 font-mono font-semibold">${fmt(p.monto)}</td>
                                <td className="px-3 py-3 hidden md:table-cell">{p.nombrePagador || "—"}</td>
                                <td className="px-3 py-3 hidden lg:table-cell">{p.cliente || "—"}</td>
                                <td className="px-3 py-3 font-mono hidden lg:table-cell">{p.referencia || "—"}</td>
                                <td className="px-3 py-3 hidden xl:table-cell">{p.factura || "—"}</td>
                                <td className="px-3 py-3">
                                  <div className="relative group inline-flex">
                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border cursor-default ${estadoColors[p.estado] ?? ""}`}>
                                      <Icon className="w-3 h-3"/>{p.estado}
                                      {p.observaciones && p.estado === "Rechazado" && (
                                        <MessageSquare className="w-3 h-3 ml-0.5 opacity-70" />
                                      )}
                                    </span>
                                    {p.observaciones && p.estado === "Rechazado" && (
                                      <div className="absolute bottom-full left-0 mb-2 z-50 hidden group-hover:block w-64 bg-popover border border-border rounded-xl shadow-xl p-3 text-xs pointer-events-none">
                                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Motivo de rechazo</p>
                                        <p className="text-foreground leading-relaxed">{p.observaciones}</p>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                {isSupervisor && (
                                <td className="px-3 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {isContable && p.estado === "Pendiente" && <>
                                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-green-700 hover:bg-green-50 border-green-200"
                                        onClick={() => { setSelectedDiv(p); setNuevoEstadoDiv("Verificado"); setObsDiv(""); setDialogDivOpen(true); }}>
                                        <CheckCircle2 className="w-3 h-3"/> Aprobar
                                      </Button>
                                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-red-700 hover:bg-red-50 border-red-200"
                                        onClick={() => { setSelectedDiv(p); setNuevoEstadoDiv("Rechazado"); setObsDiv(""); setDialogDivOpen(true); }}>
                                        <XCircle className="w-3 h-3"/> Rechazar
                                      </Button>
                                    </>}
                                    {(isVendedor || isContable) && p.estado === "Pendiente" && (
                                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-indigo-700 hover:bg-indigo-50 border-indigo-200"
                                        onClick={() => openEditDiv(p)}>
                                        <Pencil className="w-3 h-3"/> Editar
                                      </Button>
                                    )}
                                    {isAdmin && (
                                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:bg-red-50 hover:text-red-700"
                                        onClick={() => { setDeleteTarget({ id: p.id, tipo: "div" }); setDeletePassword(""); setDeleteOpen(true); }}
                                        data-testid={`button-delete-div-${p.id}`}>
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
              }
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Modal aprobación Bs ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{nuevoEstado === "Verificado" ? "✅ Aprobar pago" : "❌ Rechazar pago"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Fecha:</span><span className="font-medium">{selected.fechaPago}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Monto:</span><span className="font-mono font-bold">Bs. {fmt(selected.monto)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Banco Emisor:</span><span className="font-medium">{selected.bancoEmisor}</span></div>
                {selected.cliente    && <div className="flex justify-between"><span className="text-muted-foreground">Cliente:</span><span className="font-medium">{selected.cliente}</span></div>}
                {selected.referencia && <div className="flex justify-between"><span className="text-muted-foreground">Referencia:</span><span className="font-mono">{selected.referencia}</span></div>}
              </div>
              <div className="space-y-2">
                <Label>Observaciones {nuevoEstado === "Rechazado" && <span className="text-red-500">*</span>}</Label>
                <Textarea placeholder={nuevoEstado === "Rechazado" ? "Motivo del rechazo..." : "Notas opcionales"} value={obs} onChange={e => setObs(e.target.value)} rows={3}/>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (nuevoEstado === "Rechazado" && !obs.trim()) { toast({ title: "Indica el motivo del rechazo", variant: "destructive" }); return; }
                updateMutation.mutate({ id: selected!.id, estado: nuevoEstado, obs });
              }}
              disabled={updateMutation.isPending}
              className={nuevoEstado === "Verificado" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}>
              {updateMutation.isPending ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal aprobación Divisas ── */}
      <Dialog open={dialogDivOpen} onOpenChange={setDialogDivOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{nuevoEstadoDiv === "Verificado" ? "✅ Aprobar pago en divisas" : "❌ Rechazar pago en divisas"}</DialogTitle>
          </DialogHeader>
          {selectedDiv && (
            <div className="space-y-4 text-sm">
              <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Fecha:</span><span className="font-medium">{selectedDiv.fecha}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Monto:</span><span className="font-mono font-bold">${fmt(selectedDiv.monto)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tipo:</span><span className="font-medium">{selectedDiv.tipo}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Pagador:</span><span className="font-medium">{selectedDiv.nombrePagador}</span></div>
                {selectedDiv.cliente    && <div className="flex justify-between"><span className="text-muted-foreground">Cliente:</span><span className="font-medium">{selectedDiv.cliente}</span></div>}
                {selectedDiv.referencia && <div className="flex justify-between"><span className="text-muted-foreground">Referencia:</span><span className="font-mono">{selectedDiv.referencia}</span></div>}
              </div>
              <div className="space-y-2">
                <Label>Observaciones {nuevoEstadoDiv === "Rechazado" && <span className="text-red-500">*</span>}</Label>
                <Textarea placeholder={nuevoEstadoDiv === "Rechazado" ? "Motivo del rechazo..." : "Notas opcionales"} value={obsDiv} onChange={e => setObsDiv(e.target.value)} rows={3}/>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogDivOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (nuevoEstadoDiv === "Rechazado" && !obsDiv.trim()) { toast({ title: "Indica el motivo del rechazo", variant: "destructive" }); return; }
                updateDivMutation.mutate({ id: selectedDiv!.id, estado: nuevoEstadoDiv, obs: obsDiv });
              }}
              disabled={updateDivMutation.isPending}
              className={nuevoEstadoDiv === "Verificado" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}>
              {updateDivMutation.isPending ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal edición Bs (supervisor) ── */}
      <Dialog open={editBsOpen} onOpenChange={setEditBsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>✏️ Editar pago en Bs.</DialogTitle></DialogHeader>
          {editBsPago && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Fecha</Label>
                  <Input type="date" value={editBsFecha} onChange={e => setEditBsFecha(e.target.value)}/>
                </div>
                <div className="space-y-1">
                  <Label>Monto (Bs.)</Label>
                  <Input placeholder="0.00" value={editBsMonto} onChange={e => setEditBsMonto(e.target.value)}/>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Banco Emisor</Label>
                <Input placeholder="Banco emisor" value={editBsEmisor} onChange={e => setEditBsEmisor(e.target.value)}/>
              </div>
              <div className="space-y-1">
                <Label>Banco Receptor</Label>
                <Select value={editBsReceptor} onValueChange={setEditBsReceptor}>
                  <SelectTrigger><SelectValue placeholder="Selecciona banco"/></SelectTrigger>
                  <SelectContent>
                    {BANCOS_RECEPTOR.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Referencia</Label>
                <Input placeholder="Número de referencia" value={editBsRef} onChange={e => setEditBsRef(e.target.value)}/>
              </div>
              <div className="space-y-1">
                <Label>Celular</Label>
                <Input placeholder="04XX-XXXXXXX" value={editBsCel} onChange={e => setEditBsCel(e.target.value)}/>
              </div>
              <div className="space-y-1">
                <Label>Cliente</Label>
                <Input placeholder="Nombre del cliente" value={editBsCliente} onChange={e => setEditBsCliente(e.target.value)}/>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditBsOpen(false)}>Cancelar</Button>
            <Button
              disabled={editBsMutation.isPending}
              onClick={() => editBsMutation.mutate({
                id: editBsPago!.id,
                campos: { fechaPago: editBsFecha, bancoEmisor: editBsEmisor, bancoReceptor: editBsReceptor, monto: editBsMonto, referencia: editBsRef, celular: editBsCel, cliente: editBsCliente },
              })}>
              {editBsMutation.isPending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal edición Divisas (supervisor) ── */}
      <Dialog open={editDivOpen} onOpenChange={setEditDivOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>✏️ Editar pago en Divisas</DialogTitle></DialogHeader>
          {editDivPago && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Fecha</Label>
                  <Input type="date" value={editDivFecha} onChange={e => setEditDivFecha(e.target.value)}/>
                </div>
                <div className="space-y-1">
                  <Label>Monto ($)</Label>
                  <Input placeholder="0.00" value={editDivMonto} onChange={e => setEditDivMonto(e.target.value)}/>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Nombre Pagador</Label>
                <Input placeholder="Nombre del pagador" value={editDivPagador} onChange={e => setEditDivPagador(e.target.value)}/>
              </div>
              <div className="space-y-1">
                <Label>Tipo de pago</Label>
                <Select value={editDivTipo} onValueChange={setEditDivTipo}>
                  <SelectTrigger><SelectValue placeholder="Selecciona tipo"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Zelle">Zelle</SelectItem>
                    <SelectItem value="Binance">Binance</SelectItem>
                    <SelectItem value="Banesco Panamá">Banesco Panamá</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Referencia</Label>
                <Input placeholder="Número de referencia" value={editDivRef} onChange={e => setEditDivRef(e.target.value)}/>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditDivOpen(false)}>Cancelar</Button>
            <Button
              disabled={editDivMutation.isPending}
              onClick={() => editDivMutation.mutate({
                id: editDivPago!.id,
                campos: { fecha: editDivFecha, nombrePagador: editDivPagador, monto: editDivMonto, tipo: editDivTipo, referencia: editDivRef },
              })}>
              {editDivMutation.isPending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal cajero Pendiente ── */}
      <Dialog open={cajPendOpen} onOpenChange={setCajPendOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>📋 Datos de caja — Pendiente</DialogTitle></DialogHeader>
          {cajPendPago && (
            <div className="space-y-4 text-sm">
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Monto:</span><span className="font-mono font-bold">Bs. {fmt(cajPendPago.monto)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tipo:</span><span className="font-medium">{cajPendPago.tipoPago === "PagoMovil" ? "Pago Móvil" : "Transferencia"}</span></div>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                ⚠️ Si marcas <strong>Megasoft: Sí</strong>, el pago se aprobará automáticamente sin necesidad de revisión contable.
              </div>
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Input placeholder="Nombre del cliente" value={cajPendCliente} onChange={e => setCajPendCliente(e.target.value)}/>
              </div>
              <div className="space-y-2">
                <Label>Número de Factura</Label>
                <Input placeholder="FAC-0001" value={cajPendFactura} onChange={e => setCajPendFactura(e.target.value)}/>
              </div>
              <div className="space-y-2">
                <Label>¿Validado con Megasoft?</Label>
                <Select value={cajPendMega} onValueChange={v => setCajPendMega(v as "Sí" | "No" | "")}>
                  <SelectTrigger><SelectValue placeholder="Selecciona"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Sí">Sí — Aprobado por Megasoft</SelectItem>
                    <SelectItem value="No">No — Pendiente de revisión</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCajPendOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => cajPendMutation.mutate({ id: cajPendPago!.id, factura: cajPendFactura, cliente: cajPendCliente, megasoft: cajPendMega })}
              disabled={cajPendMutation.isPending}
              className={cajPendMega === "Sí" ? "bg-green-600 hover:bg-green-700" : ""}>
              {cajPendMutation.isPending ? "Guardando..." : cajPendMega === "Sí" ? "Aprobar y Guardar" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal cajero Verificado ── */}
      <Dialog open={cajeroOpen} onOpenChange={setCajeroOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>📋 Datos de caja</DialogTitle></DialogHeader>
          {cajeroPago && (
            <div className="space-y-4 text-sm">
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Monto:</span><span className="font-mono font-bold">Bs. {fmt(cajeroPago.monto)}</span></div>
                {cajeroPago.cliente && <div className="flex justify-between"><span className="text-muted-foreground">Cliente:</span><span className="font-medium">{cajeroPago.cliente}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Banco Receptor:</span><span className="font-medium">{cajeroPago.bancoReceptor}</span></div>
              </div>
              <div className="space-y-2">
                <Label>Número de Factura</Label>
                <Input placeholder="FAC-0001" value={cajeroFactura} onChange={e => setCajeroFactura(e.target.value)}/>
              </div>
              {cajeroPago?.estado !== "Verificado" && (
                <div className="space-y-2">
                  <Label>¿Validado con Megasoft?</Label>
                  <Select value={cajeroMega} onValueChange={v => setCajeroMega(v as "Sí" | "No" | "")}>
                    <SelectTrigger><SelectValue placeholder="Selecciona"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Sí">Sí</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCajeroOpen(false)}>Cancelar</Button>
            <Button onClick={() => cajeroMutation.mutate({ id: cajeroPago!.id, factura: cajeroFactura, megasoft: cajeroMega })} disabled={cajeroMutation.isPending}>
              {cajeroMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal eliminar pago (admin) ── */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { if (!deleteLoading) { setDeleteOpen(o); if (!o) setDeletePassword(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-4 h-4" /> Eliminar pago
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Esta acción es <span className="font-semibold text-foreground">irreversible</span>. El registro será eliminado permanentemente.
              Ingresa tu contraseña para confirmar.
            </p>
            <div className="space-y-2">
              <Label>Tu contraseña</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && deletePassword) handleDelete(); }}
                autoFocus
                data-testid="input-delete-password"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeletePassword(""); }} disabled={deleteLoading}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!deletePassword || deleteLoading}
              data-testid="button-confirm-delete"
            >
              {deleteLoading ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
