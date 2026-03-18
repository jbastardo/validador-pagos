import { useState, useRef, useEffect } from "react";
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
import { BANCOS_RECEPTOR, extractBancoCode } from "@shared/schema";
import { getCajaFromInvoice } from "@/lib/utils";

interface Pago {
  id: string; fechaPago: string; tipoPago: string; bancoEmisor: string;
  monto: string; celular: string; bancoReceptor: string; referencia: string;
  rif: string; factura: string; estado: string; validadoPor: string;
  vendedor: string; observaciones: string; cliente: string; megasoft: string;
  creadoEn?: string; validadoEn?: string; conciliadoEn?: string; conciliadoPor?: string;
}

interface PagoDivisa {
  id: string; fecha: string; nombrePagador: string; correo: string;
  monto: string; tipo: string; referencia: string; cliente: string;
  rif: string; factura: string; observaciones: string; estado: string;
  validadoPor: string; vendedor: string; creadoEn?: string; validadoEn?: string;
}

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
  const [activeTab, setActiveTab] = useState("bs");

  // ── Filtros Bs ──
  const [busqueda,          setBusqueda]          = useState("");
  const [filtroEstado,      setFiltroEstado]      = useState("todos");
  const [filtroTipo,        setFiltroTipo]        = useState("todos");
  const [filtroBanco,       setFiltroBanco]       = useState("todos");
  const [filtroVendedor,    setFiltroVendedor]    = useState("todos");
  const [filtroFactura,     setFiltroFactura]     = useState("todos");
  const [filtroCaja,        setFiltroCaja]        = useState("todos");
  const [filtroConciliado,  setFiltroConciliado]  = useState("todos");
  const [fechaDesde,        setFechaDesde]        = useState("");
  const [fechaHasta,        setFechaHasta]        = useState("");

  // ⚠️ WARNING: CRITICAL CODE — Lectura de filtros desde URL (Dashboard navigation) ⚠️
  // wouter's navigate("/conciliacion?estado=Pendiente") pone los params en
  // window.location.search (NO dentro del hash). Leemos de ahí al montar.
  // Se ejecuta una sola vez al montar porque cada navegación desde el Dashboard
  // causa un remount completo del componente (ruta diferente → / a /conciliacion).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const estado = params.get("estado");
    const tab = params.get("tab");
    if (!estado && !tab) return; // Sin params → no tocar filtros

    // Reset filtros antes de aplicar los del URL
    setFiltroEstado("todos");
    setFiltroTipo("todos");
    setFiltroBanco("todos");
    setFiltroVendedor("todos");
    setFiltroFactura("todos");
    setFiltroCaja("todos");
    setFiltroConciliado("todos");
    setFechaDesde("");
    setFechaHasta("");

    if (tab === "divisas") {
      setActiveTab("divisas");
      if (estado && estado !== "todos") setFiltroEstDiv(estado);
    } else {
      if (estado === "Pendiente") setFiltroEstado("Pendiente");
      else if (estado === "SinFactura") setFiltroFactura("SinFactura");
      else if (estado === "Verificado") setFiltroEstado("Verificado");
      else if (estado === "Rechazado") setFiltroEstado("Rechazado");
      else if (estado === "PagoMovil") { setFiltroTipo("PagoMovil"); }
      else if (estado === "Transferencia") { setFiltroTipo("Transferencia"); }
      else if (estado === "PendienteCajero") setFiltroEstado("PendienteCajero");
      else if (estado === "MegasoftSi") setFiltroEstado("MegasoftSi");
      else if (estado === "MegasoftNo") setFiltroEstado("MegasoftNo");
    }

    // Limpiar los search params del URL para que no persistan en recargas
    if (window.history.replaceState) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState(null, "", cleanUrl);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtros Divisas ──
  const [busqDiv,        setBusqDiv]        = useState("");
  const [filtroEstDiv,   setFiltroEstDiv]   = useState("todos");
  const [filtroTipoDiv,  setFiltroTipoDiv]  = useState("todos");
  const [filtroCajaDiv,  setFiltroCajaDiv]  = useState("todos");

  // ── Modal aprobación Bs ──
  const [selected,    setSelected]    = useState<Pago | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [obs,         setObs]         = useState("");
  const [dialogOpen,  setDialogOpen]  = useState(false);

  // ── Modal cajero (Verificado — comportamiento anterior) ──
  const [cajeroPago,     setCajeroPago]     = useState<Pago | null>(null);
  const [cajeroFactura,  setCajeroFactura]  = useState("");
  const [cajeroCliente,  setCajeroCliente]  = useState("");
  const [cajeroMega,     setCajeroMega]     = useState<"Sí" | "No" | "">("");
  const [cajeroOpen,     setCajeroOpen]     = useState(false);

  // ── Modal cajero Pendiente (nuevo) ──
  const [cajPendPago,    setCajPendPago]    = useState<Pago | null>(null);
  const [cajPendFactura, setCajPendFactura] = useState("");
  const [cajPendCliente, setCajPendCliente] = useState("");
  const [cajPendMega,    setCajPendMega]    = useState<"Sí" | "No" | "">("");
  const [cajPendOpen,    setCajPendOpen]    = useState(false);

  // ── Modal cajero editar factura/cliente (cualquier estado) ──
  const [cajFCPago,    setCajFCPago]    = useState<Pago | null>(null);
  const [cajFCFactura, setCajFCFactura] = useState("");
  const [cajFCCliente, setCajFCCliente] = useState("");
  const [cajFCMega,    setCajFCMega]    = useState<"Sí" | "No" | "">("");
  const [cajFCRif,     setCajFCRif]     = useState("");
  const [cajFCOpen,    setCajFCOpen]    = useState(false);

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
  const [editBsObs,      setEditBsObs]      = useState("");
  const [editBsRif,      setEditBsRif]      = useState("");
  const [editBsFactura,  setEditBsFactura]  = useState("");
  const [editBsMega,     setEditBsMega]     = useState<"Sí" | "No" | "">("");

  // ── Modal edición Divisas (supervisor) ──
  const [editDivOpen,    setEditDivOpen]    = useState(false);
  const [editDivPago,    setEditDivPago]    = useState<PagoDivisa | null>(null);
  const [editDivFecha,   setEditDivFecha]   = useState("");
  const [editDivPagador, setEditDivPagador] = useState("");
  const [editDivMonto,   setEditDivMonto]   = useState("");
  const [editDivTipo,    setEditDivTipo]    = useState("");
  const [editDivRef,     setEditDivRef]     = useState("");
  const [editDivObs,     setEditDivObs]     = useState("");

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
    mutationFn: async ({ id, factura, cliente, megasoft }: { id: string; factura: string; cliente: string; megasoft: string }) => {
      const res = await apiRequest("PATCH", `/api/pagos/${id}/cajero`, { factura, cliente, megasoft });
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

  // ── Mutación cajero factura/cliente (cualquier estado) ──
  const cajFCMutation = useMutation({
    mutationFn: async ({ id, factura, cliente, megasoft, rif }: { id: string; factura: string; cliente: string; megasoft: string; rif: string }) => {
      const res = await apiRequest("PATCH", `/api/pagos/${id}/factura-cliente`, { factura, cliente, megasoft, rif, cajeroEmail: user?.email ?? "" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "Error");
      return json;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/pagos"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      setCajFCOpen(false);
      const msg = data?.estado === "Verificado"
        ? "Pago validado automáticamente por Megasoft ✅"
        : "Factura/cliente actualizado en Google Sheets";
      toast({ title: msg });
    },
    onError: (err: any) => toast({ title: err.message ?? "Error al actualizar", variant: "destructive" }),
  });

  // ── Mutación edición Bs (supervisor / admin) ──
  const editBsMutation = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Record<string, string> }) => {
      const res = await apiRequest("PATCH", `/api/pagos/${id}/editar`, campos);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "Error al editar");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pagos"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
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
    setCajeroCliente(p.cliente ?? "");
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

  const openCajeroFC = (p: Pago) => {
    setCajFCPago(p);
    setCajFCFactura(p.factura ?? "");
    setCajFCCliente(p.cliente ?? "");
    setCajFCRif(p.rif ?? "");
    setCajFCMega((p.megasoft as "Sí" | "No" | "") ?? "");
    setCajFCOpen(true);
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
    setEditBsObs(p.observaciones ?? "");
    setEditBsRif(p.rif ?? "");
    setEditBsFactura(p.factura ?? "");
    setEditBsMega((p.megasoft as "Sí" | "No" | "") ?? "");
    setEditBsOpen(true);
  };

  const openEditDiv = (p: PagoDivisa) => {
    setEditDivPago(p);
    setEditDivFecha(p.fecha ?? "");
    setEditDivPagador(p.nombrePagador ?? "");
    setEditDivMonto(p.monto ?? "");
    setEditDivTipo(p.tipo ?? "");
    setEditDivRef(p.referencia ?? "");
    setEditDivObs(p.observaciones ?? "");
    setEditDivOpen(true);
  };

  const fmt = (v: string) => parseFloat(v || "0").toLocaleString("es-ES", { minimumFractionDigits: 2 });

  // ── Lista de vendedores únicos para filtro ──
  const vendedoresUnicos = Array.from(new Set((pagos ?? []).map(p => p.vendedor).filter(Boolean))).sort();

  // ── Filtrado Bs ──
  // Convierte "DD/MM/YYYY" a "YYYY-MM-DD" para comparar con inputs date
  const toISO = (f: string) => {
    if (!f) return "";
    const m = f.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
    return f.substring(0, 10);
  };

  const filtradosBs = (pagos ?? []).filter(p => {
    const q = busqueda.toLowerCase();
    const mq = q === "" || [p.referencia, p.monto, p.bancoEmisor, p.bancoReceptor, p.celular, p.rif, p.factura, p.vendedor, p.fechaPago, p.cliente].some(v => v?.toLowerCase().includes(q));
    const me = filtroEstado === "todos"
      || (filtroEstado === "PendienteCajero" ? (p.estado === "Verificado" && (!p.megasoft || p.megasoft === ""))
      : filtroEstado === "MegasoftSi" ? (p.estado === "Verificado" && p.megasoft === "Sí")
      : filtroEstado === "MegasoftNo" ? (p.estado === "Verificado" && p.megasoft === "No")
      : p.estado === filtroEstado);
    const mt = filtroTipo     === "todos" || p.tipoPago === filtroTipo;
    const mb = filtroBanco    === "todos" || extractBancoCode(p.bancoReceptor) === extractBancoCode(filtroBanco);
    const mv = filtroVendedor === "todos" || p.vendedor === filtroVendedor;
    const mf = filtroFactura  === "todos"
      || (filtroFactura === "SinFactura"  ? (!p.factura  || p.factura.trim()  === "")
      :   filtroFactura === "SinCliente"  ? (!p.cliente  || p.cliente.trim()  === "")
      :   filtroFactura === "SinAmbos"    ? ((!p.factura || p.factura.trim() === "") && (!p.cliente || p.cliente.trim() === ""))
      : true);
    const mc = filtroConciliado === "todos"
      || (filtroConciliado === "conciliadas"    ? (!!p.conciliadoEn && p.conciliadoEn.trim() !== "")
      :   filtroConciliado === "no-conciliadas" ? (!p.conciliadoEn  || p.conciliadoEn.trim() === "")
      : true);
    const mcj = filtroCaja === "todos" || getCajaFromInvoice(p.factura) === filtroCaja;
    const fISO = toISO(p.fechaPago);
    const md = !fechaDesde || fISO >= fechaDesde;
    const mh = !fechaHasta || fISO <= fechaHasta;
    return mq && me && mt && mb && mv && mf && mc && mcj && md && mh;
  });

  // ── Filtrado Divisas ──
  const filtradosDiv = (divisas ?? []).filter(p => {
    const q = busqDiv.toLowerCase();
    const mq = q === "" || [p.nombrePagador, p.correo, p.monto, p.tipo, p.referencia, p.cliente, p.rif, p.factura, p.fecha].some(v => v?.toLowerCase().includes(q));
    const me = filtroEstDiv  === "todos" || p.estado === filtroEstDiv;
    const mt = filtroTipoDiv === "todos" || p.tipo   === filtroTipoDiv;
    const mcj = filtroCajaDiv === "todos" || getCajaFromInvoice(p.factura) === filtroCajaDiv;
    const fISO = toISO(p.fecha);
    const md = !fechaDesde || fISO >= fechaDesde;
    const mh = !fechaHasta || fISO <= fechaHasta;
    return mq && me && mt && mcj && md && mh;
  });

  const handleExportBs = () => {
    const h = ["ID","Fecha","Tipo","Banco Emisor","Monto","Celular","Banco Receptor","Referencia","CI / RIF","Factura","Caja","Estado","Validado Por","Vendedor","Observaciones","Cliente","Megasoft"];
    const rows = filtradosBs.map(p => [p.id,p.fechaPago,p.tipoPago,p.bancoEmisor,p.monto,p.celular,p.bancoReceptor,p.referencia,p.rif,p.factura,getCajaFromInvoice(p.factura),p.estado,p.validadoPor,p.vendedor,p.observaciones,p.cliente,p.megasoft]);
    const csv = [h,...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `conciliacion_bs_${new Date().toISOString().split("T")[0]}.csv`; a.click();
  };

  const handleExportDiv = () => {
    const h = ["ID","Fecha","Nombre Pagador","Correo","Monto","Tipo","Referencia","Cliente","CI / RIF","Factura","Caja","Observaciones","Estado","Validado Por","Vendedor"];
    const rows = filtradosDiv.map(p => [p.id,p.fecha,p.nombrePagador,p.correo,p.monto,p.tipo,p.referencia,p.cliente,p.rif,p.factura,getCajaFromInvoice(p.factura),p.observaciones,p.estado,p.validadoPor,p.vendedor]);
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
  const AuditTooltip = ({ vendedor, creadoEn, validadoPor, validadoEn, estado, conciliadoEn, conciliadoPor }: { vendedor?: string; creadoEn?: string; validadoPor?: string; validadoEn?: string; estado?: string; conciliadoEn?: string; conciliadoPor?: string }) => {
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
              {conciliadoEn && conciliadoEn.trim() !== "" && (
                <div className="border-t border-border pt-2 mt-1 space-y-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">Conciliado por</span>
                    <span className="font-medium text-teal-700 break-all">{conciliadoPor || "—"}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">Fecha y hora de conciliación</span>
                    <span className="font-medium text-foreground">{fmtDateTime(conciliadoEn)}</span>
                  </div>
                </div>
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
          <h1 className="text-xl font-bold">Resumen de Pagos</h1>
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
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
                <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                  <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="Estado"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="Pendiente">Pendiente</SelectItem>
                    <SelectItem value="Verificado">Verificado</SelectItem>
                    <SelectItem value="PendienteCajero">Sin validar Megasoft</SelectItem>
                    <SelectItem value="MegasoftSi">Aprobados Megasoft</SelectItem>
                    <SelectItem value="MegasoftNo">Transferidos contabilidad</SelectItem>
                    <SelectItem value="Rechazado">Rechazado</SelectItem>
                    <SelectItem value="Rechazado Megasoft">Rechazado Megasoft</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filtroFactura} onValueChange={setFiltroFactura}>
                  <SelectTrigger className="w-full md:w-44"><SelectValue placeholder="Factura / Cliente"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los registros</SelectItem>
                    <SelectItem value="SinFactura">Sin número de factura</SelectItem>
                    <SelectItem value="SinCliente">Sin nombre de cliente</SelectItem>
                    <SelectItem value="SinAmbos">Sin factura y sin cliente</SelectItem>
                  </SelectContent>
                </Select>
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
                <Select value={filtroCaja} onValueChange={setFiltroCaja}>
                  <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="Caja"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas las cajas</SelectItem>
                    <SelectItem value="CAJA 01">CAJA 01</SelectItem>
                    <SelectItem value="CAJA 02">CAJA 02</SelectItem>
                  </SelectContent>
                </Select>
                {isAdmin && (
                  <Select value={filtroConciliado} onValueChange={setFiltroConciliado}>
                    <SelectTrigger className="w-full md:w-44"><SelectValue placeholder="Conciliación"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas las operaciones</SelectItem>
                      <SelectItem value="conciliadas">Conciliadas</SelectItem>
                      <SelectItem value="no-conciliadas">No conciliadas</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Desde</Label>
                  <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="w-36 text-xs"/>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Hasta</Label>
                  <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="w-36 text-xs"/>
                </div>
                <Button variant="outline" size="sm" onClick={handleExportBs} className="gap-2 shrink-0">
                  <Download className="w-4 h-4"/> Exportar CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          {loadingBs ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
          ) : filtradosBs.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No se encontraron pagos</CardContent></Card>
          ) : (
            filtradosBs.map(p => {
              const Icon = estadoIcon[p.estado] ?? Clock;
              const colorClass = estadoColors[p.estado] ?? "bg-gray-100 text-gray-700 border-gray-200";
              const esPendiente         = p.estado === "Pendiente";
              const esVerificado        = p.estado === "Verificado";
              const esPendienteMegasoft = esVerificado && (!p.megasoft || p.megasoft.trim() === "");
              const faltaFacturaOCliente = (!p.factura || p.factura.trim() === "") || (!p.cliente || p.cliente.trim() === "");
              return (
                <Card key={p.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${colorClass}`}>
                            <Icon className="w-3.5 h-3.5"/>{p.estado}
                          </span>
                          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{p.tipoPago}</span>
                          {p.megasoft && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">Mega: {p.megasoft}</span>}
                          {p.conciliadoEn && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 border border-teal-200">
                              Conciliado
                            </span>
                          )}
                          {canSeeValidacion && (
                            <AuditTooltip
                              vendedor={p.vendedor}
                              creadoEn={p.creadoEn}
                              validadoPor={p.validadoPor}
                              validadoEn={p.validadoEn}
                              estado={p.estado}
                              conciliadoEn={p.conciliadoEn}
                              conciliadoPor={p.conciliadoPor}
                            />
                          )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1 text-sm">
                          <div><span className="text-xs text-muted-foreground">Fecha</span><p className="font-medium">{p.fechaPago}</p></div>
                          <div><span className="text-xs text-muted-foreground">Monto</span><p className="font-semibold text-green-700">Bs. {fmt(p.monto)}</p></div>
                          <div><span className="text-xs text-muted-foreground">Banco Emisor</span><p className="font-medium">{p.bancoEmisor}</p></div>
                          <div><span className="text-xs text-muted-foreground">Banco Receptor</span><p className="font-medium">{p.bancoReceptor}</p></div>
                          <div><span className="text-xs text-muted-foreground">Referencia</span><p className="font-medium font-mono">{p.referencia}</p></div>
                          <div><span className="text-xs text-muted-foreground">Celular</span><p className="font-medium">{p.celular || "—"}</p></div>
                          <div><span className="text-xs text-muted-foreground">CI / RIF</span><p className="font-medium">{p.rif || "—"}</p></div>
                          <div><span className="text-xs text-muted-foreground">Factura</span><p className="font-medium">{p.factura || "—"}</p></div>
                          <div><span className="text-xs text-muted-foreground">Caja</span><p className="font-medium">{getCajaFromInvoice(p.factura) || "—"}</p></div>
                          <div><span className="text-xs text-muted-foreground">Cliente</span><p className="font-medium">{p.cliente || "—"}</p></div>
                          {p.observaciones && <div className="col-span-2"><span className="text-xs text-muted-foreground">Observaciones</span><p className="font-medium text-xs">{p.observaciones}</p></div>}
                        </div>
                      </div>
                      <div className="flex flex-row sm:flex-col gap-2 shrink-0">
                        {/* ── Botón cajero Pendiente (validar megasoft) ── */}
                        {isCajero && esPendienteMegasoft && (
                          <Button size="sm" variant="outline" onClick={() => openCajeroPendiente(p)} className="gap-1.5 text-xs">
                            <Receipt className="w-3.5 h-3.5"/> Validar Megasoft
                          </Button>
                        )}
                        {/* ── Botón cajero: editar factura/cliente/megasoft en cualquier estado ── */}
                        {isCajero && !esPendienteMegasoft && (
                          <Button size="sm" variant="outline" onClick={() => openCajeroFC(p)} className="gap-1.5 text-xs">
                            <Pencil className="w-3.5 h-3.5"/> Editar
                          </Button>
                        )}
                        {/* ── Botón editar (admin: siempre, supervisor no-admin: solo pendientes) ── */}
                        {(isAdmin || (isSupervisor && esPendiente)) && (
                          <Button size="sm" variant="outline" onClick={() => openEditBs(p)} className="gap-1.5 text-xs">
                            <Pencil className="w-3.5 h-3.5"/> Editar
                          </Button>
                        )}
                        {/* ── Botón aprobar/rechazar (contable) ── */}
                        {isContable && esPendiente && (
                          <Button size="sm" onClick={() => { setSelected(p); setNuevoEstado(""); setObs(""); setDialogOpen(true); }} className="gap-1.5 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5"/> Validar
                          </Button>
                        )}
                        {/* ── Botón cajero verificado (cajero + megasoft = '') ── */}
                        {isCajero && esVerificado && p.megasoft && p.megasoft.trim() !== "" && (
                          <Button size="sm" variant="outline" onClick={() => openCajero(p)} className="gap-1.5 text-xs">
                            <Receipt className="w-3.5 h-3.5"/> Ver Factura
                          </Button>
                        )}
                        {/* ── Botón observaciones ── */}
                        {!isCajero && !isVendedor && p.observaciones && (
                          <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground" onClick={() =>
                            toast({ title: "Observaciones", description: p.observaciones })
                          }>
                            <MessageSquare className="w-3.5 h-3.5"/>
                          </Button>
                        )}
                        {/* ── Botón eliminar (admin) ── */}
                        {isAdmin && (
                          <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => { setDeleteTarget({ id: p.id, tipo: "bs" }); setDeletePassword(""); setDeleteOpen(true); }}>
                            <Trash2 className="w-3.5 h-3.5"/>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ══════════════ PESTAÑA DIVISAS ══════════════ */}
        <TabsContent value="divisas" className="space-y-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col md:flex-row gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                  <Input placeholder="Buscar por nombre, ref., monto..." value={busqDiv} onChange={e => setBusqDiv(e.target.value)} className="pl-9"/>
                </div>
                <Select value={filtroEstDiv} onValueChange={setFiltroEstDiv}>
                  <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="Estado"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="Pendiente">Pendiente</SelectItem>
                    <SelectItem value="Verificado">Verificado</SelectItem>
                    <SelectItem value="Rechazado">Rechazado</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filtroTipoDiv} onValueChange={setFiltroTipoDiv}>
                  <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="Tipo"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los tipos</SelectItem>
                    <SelectItem value="Zelle">Zelle</SelectItem>
                    <SelectItem value="Binance">Binance</SelectItem>
                    <SelectItem value="Banesco Panamá">Banesco Panamá</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filtroCajaDiv} onValueChange={setFiltroCajaDiv}>
                  <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="Caja"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas las cajas</SelectItem>
                    <SelectItem value="CAJA 01">CAJA 01</SelectItem>
                    <SelectItem value="CAJA 02">CAJA 02</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Desde</Label>
                  <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="w-36 text-xs"/>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Hasta</Label>
                  <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="w-36 text-xs"/>
                </div>
                <Button variant="outline" size="sm" onClick={handleExportDiv} className="gap-2 shrink-0">
                  <Download className="w-4 h-4"/> Exportar CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          {loadingDiv ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
          ) : filtradosDiv.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No se encontraron pagos en divisas</CardContent></Card>
          ) : (
            filtradosDiv.map(p => {
              const Icon = estadoIcon[p.estado] ?? Clock;
              const colorClass = estadoColors[p.estado] ?? "bg-gray-100 text-gray-700 border-gray-200";
              return (
                <Card key={p.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${colorClass}`}>
                            <Icon className="w-3.5 h-3.5"/>{p.estado}
                          </span>
                          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{p.tipo}</span>
                          {canSeeValidacion && (
                            <AuditTooltip
                              vendedor={p.vendedor}
                              creadoEn={p.creadoEn}
                              validadoPor={p.validadoPor}
                              validadoEn={p.validadoEn}
                              estado={p.estado}
                            />
                          )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1 text-sm">
                          <div><span className="text-xs text-muted-foreground">Fecha</span><p className="font-medium">{p.fecha}</p></div>
                          <div><span className="text-xs text-muted-foreground">Nombre Pagador</span><p className="font-medium">{p.nombrePagador}</p></div>
                          <div><span className="text-xs text-muted-foreground">Monto</span><p className="font-semibold text-violet-700">{`$${fmt(p.monto)}`}</p></div>
                          <div><span className="text-xs text-muted-foreground">Referencia</span><p className="font-medium font-mono">{p.referencia}</p></div>
                          {p.correo  && <div><span className="text-xs text-muted-foreground">Correo</span><p className="font-medium text-xs">{p.correo}</p></div>}
                          {p.cliente && <div><span className="text-xs text-muted-foreground">Cliente</span><p className="font-medium">{p.cliente}</p></div>}
                          {p.rif     && <div><span className="text-xs text-muted-foreground">CI / RIF</span><p className="font-medium">{p.rif}</p></div>}
                          {p.factura && <div><span className="text-xs text-muted-foreground">Factura</span><p className="font-medium">{p.factura}</p></div>}
                          {getCajaFromInvoice(p.factura) && <div><span className="text-xs text-muted-foreground">Caja</span><p className="font-medium">{getCajaFromInvoice(p.factura)}</p></div>}
                          {p.observaciones && <div className="col-span-2"><span className="text-xs text-muted-foreground">Observaciones</span><p className="font-medium text-xs">{p.observaciones}</p></div>}
                        </div>
                      </div>
                      <div className="flex flex-row sm:flex-col gap-2 shrink-0">
                        {(isAdmin || (isSupervisor && p.estado === "Pendiente")) && (
                          <Button size="sm" variant="outline" onClick={() => openEditDiv(p)} className="gap-1.5 text-xs">
                            <Pencil className="w-3.5 h-3.5"/> Editar
                          </Button>
                        )}
                        {isContable && p.estado === "Pendiente" && (
                          <Button size="sm" onClick={() => { setSelectedDiv(p); setNuevoEstadoDiv(""); setObsDiv(""); setDialogDivOpen(true); }} className="gap-1.5 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5"/> Validar
                          </Button>
                        )}
                        {!isCajero && !isVendedor && p.observaciones && (
                          <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground" onClick={() =>
                            toast({ title: "Observaciones", description: p.observaciones })
                          }>
                            <MessageSquare className="w-3.5 h-3.5"/>
                          </Button>
                        )}
                        {isAdmin && (
                          <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => { setDeleteTarget({ id: p.id, tipo: "div" }); setDeletePassword(""); setDeleteOpen(true); }}>
                            <Trash2 className="w-3.5 h-3.5"/>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      {/* ══════════════ MODAL ESTADO Bs ══════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Validar pago en Bs.</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {selected?.rif && (
              <div className="px-3 py-2 bg-muted/50 rounded-lg">
                <Label className="text-xs text-muted-foreground">CI / RIF</Label>
                <p className="text-sm font-medium">{selected.rif}</p>
              </div>
            )}
            <div>
              <Label className="text-sm font-medium">Nuevo estado</Label>
              <Select value={nuevoEstado} onValueChange={setNuevoEstado}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona un estado"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Verificado">Verificado</SelectItem>
                  <SelectItem value="Rechazado">Rechazado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">Observaciones (opcional)</Label>
              <Textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Agrega una nota..." className="mt-1 resize-none" rows={3}/>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => { if (selected && nuevoEstado) updateMutation.mutate({ id: selected.id, estado: nuevoEstado, obs }); }} disabled={!nuevoEstado || updateMutation.isPending}>
              {updateMutation.isPending ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════ MODAL CAJERO PENDIENTE ══════════════ */}
      <Dialog open={cajPendOpen} onOpenChange={setCajPendOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ingresar Factura y Validar Megasoft</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {cajPendPago?.rif && (
              <div className="px-3 py-2 bg-muted/50 rounded-lg">
                <Label className="text-xs text-muted-foreground">CI / RIF</Label>
                <p className="text-sm font-medium">{cajPendPago.rif}</p>
              </div>
            )}
            <div>
              <Label className="text-sm font-medium">Número de Factura</Label>
              <Input value={cajPendFactura} onChange={e => setCajPendFactura(e.target.value)} placeholder="Ej: 0001234" className="mt-1"/>
            </div>
            <div>
              <Label className="text-sm font-medium">Nombre del Cliente</Label>
              <Input value={cajPendCliente} onChange={e => setCajPendCliente(e.target.value)} placeholder="Nombre completo" className="mt-1"/>
            </div>
            <div>
              <Label className="text-sm font-medium">¿Validado por Megasoft?</Label>
              <Select value={cajPendMega} onValueChange={v => setCajPendMega(v as "Sí" | "No")}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sí">Sí — Aprobar pago</SelectItem>
                  <SelectItem value="No">No — Dejar pendiente para contabilidad</SelectItem>
                </SelectContent>
              </Select>
              {cajPendMega === "No" && (
                <p className="text-xs text-muted-foreground mt-1">El pago quedará pendiente de validación para que contabilidad lo revise.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCajPendOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => cajPendPago && cajPendMutation.mutate({ id: cajPendPago.id, factura: cajPendFactura, cliente: cajPendCliente, megasoft: cajPendMega })}
              disabled={!cajPendMega || cajPendMutation.isPending}
            >
              {cajPendMutation.isPending ? "Guardando..." : cajPendMega === "Sí" ? "Aprobar" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════ MODAL CAJERO VERIFICADO ══════════════ */}
      <Dialog open={cajeroOpen} onOpenChange={setCajeroOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ver / Actualizar Factura</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {cajeroPago?.rif && (
              <div className="px-3 py-2 bg-muted/50 rounded-lg">
                <Label className="text-xs text-muted-foreground">CI / RIF</Label>
                <p className="text-sm font-medium">{cajeroPago.rif}</p>
              </div>
            )}
            <div>
              <Label className="text-sm font-medium">Número de Factura</Label>
              <Input value={cajeroFactura} onChange={e => setCajeroFactura(e.target.value)} placeholder="Ej: 0001234" className="mt-1"/>
            </div>
            <div>
              <Label className="text-sm font-medium">Nombre del Cliente</Label>
              <Input value={cajeroCliente} onChange={e => setCajeroCliente(e.target.value)} placeholder="Nombre completo" className="mt-1"/>
            </div>
            <div>
              <Label className="text-sm font-medium">¿Validado por Megasoft?</Label>
              <Select value={cajeroMega} onValueChange={v => setCajeroMega(v as "Sí" | "No")}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sí">Sí</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCajeroOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => cajeroPago && cajeroMutation.mutate({ id: cajeroPago.id, factura: cajeroFactura, cliente: cajeroCliente, megasoft: cajeroMega })}
              disabled={!cajeroMega || cajeroMutation.isPending}
            >
              {cajeroMutation.isPending ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════ MODAL CAJERO FACTURA/CLIENTE/MEGASOFT ══════════════ */}
      <Dialog open={cajFCOpen} onOpenChange={setCajFCOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Factura / Cliente / RIF</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium">CI / RIF</Label>
              <Input value={cajFCRif} onChange={e => setCajFCRif(e.target.value)} placeholder="Ej: V-12345678" className="mt-1"/>
            </div>
            <div>
              <Label className="text-sm font-medium">Número de Factura</Label>
              <Input value={cajFCFactura} onChange={e => setCajFCFactura(e.target.value)} placeholder="Ej: 0001234" className="mt-1"/>
            </div>
            <div>
              <Label className="text-sm font-medium">Nombre del Cliente</Label>
              <Input value={cajFCCliente} onChange={e => setCajFCCliente(e.target.value)} placeholder="Nombre completo" className="mt-1"/>
            </div>
            <div>
              <Label className="text-sm font-medium">¿Validado por Megasoft?</Label>
              <Select value={cajFCMega} onValueChange={v => setCajFCMega(v as "Sí" | "No")}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sí">Sí</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCajFCOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => cajFCPago && cajFCMutation.mutate({ id: cajFCPago.id, factura: cajFCFactura, cliente: cajFCCliente, megasoft: cajFCMega, rif: cajFCRif })}
              disabled={cajFCMutation.isPending}
            >
              {cajFCMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════ MODAL ESTADO DIVISAS ══════════════ */}
      <Dialog open={dialogDivOpen} onOpenChange={setDialogDivOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Validar pago en Divisas</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium">Nuevo estado</Label>
              <Select value={nuevoEstadoDiv} onValueChange={setNuevoEstadoDiv}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona un estado"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Verificado">Verificado</SelectItem>
                  <SelectItem value="Rechazado">Rechazado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">Observaciones (opcional)</Label>
              <Textarea value={obsDiv} onChange={e => setObsDiv(e.target.value)} placeholder="Agrega una nota..." className="mt-1 resize-none" rows={3}/>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogDivOpen(false)}>Cancelar</Button>
            <Button onClick={() => { if (selectedDiv && nuevoEstadoDiv) updateDivMutation.mutate({ id: selectedDiv.id, estado: nuevoEstadoDiv, obs: obsDiv }); }} disabled={!nuevoEstadoDiv || updateDivMutation.isPending}>
              {updateDivMutation.isPending ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════ MODAL EDICIÓN Bs ══════════════ */}
      <Dialog open={editBsOpen} onOpenChange={setEditBsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar pago en Bs.</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div><Label className="text-sm">Fecha de pago</Label><Input type="date" value={editBsFecha} onChange={e => setEditBsFecha(e.target.value)} className="mt-1"/></div>
            <div><Label className="text-sm">Banco Emisor</Label><Input value={editBsEmisor} onChange={e => setEditBsEmisor(e.target.value)} className="mt-1"/></div>
            <div>
              <Label className="text-sm">Banco Receptor</Label>
              <Select value={editBsReceptor} onValueChange={setEditBsReceptor}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona"/></SelectTrigger>
                <SelectContent>{BANCOS_RECEPTOR.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-sm">Monto (Bs.)</Label><Input type="number" value={editBsMonto} onChange={e => setEditBsMonto(e.target.value)} className="mt-1"/></div>
            <div><Label className="text-sm">Referencia</Label><Input value={editBsRef} onChange={e => setEditBsRef(e.target.value)} className="mt-1"/></div>
            <div><Label className="text-sm">Teléfono / Celular</Label><Input value={editBsCel} onChange={e => setEditBsCel(e.target.value)} className="mt-1"/></div>
            <div><Label className="text-sm">Cliente</Label><Input value={editBsCliente} onChange={e => setEditBsCliente(e.target.value)} className="mt-1"/></div>
            {isAdmin && (
              <>
                <div><Label className="text-sm">CI / RIF</Label><Input value={editBsRif} onChange={e => setEditBsRif(e.target.value)} placeholder="Ej: V-12345678" className="mt-1"/></div>
                <div><Label className="text-sm">Número de Factura</Label><Input value={editBsFactura} onChange={e => setEditBsFactura(e.target.value)} placeholder="Ej: 0001234" className="mt-1"/></div>
                <div>
                  <Label className="text-sm">¿Validado por Megasoft?</Label>
                  <Select value={editBsMega} onValueChange={v => setEditBsMega(v as "Sí" | "No")}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Sí">Sí</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div>
              <Label className="text-sm">Observaciones</Label>
              <Textarea value={editBsObs} onChange={e => setEditBsObs(e.target.value)} placeholder="Agrega una nota..." className="mt-1 resize-none" rows={3}/>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBsOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => editBsPago && editBsMutation.mutate({ id: editBsPago.id, campos: {
                fechaPago: editBsFecha, bancoEmisor: editBsEmisor, bancoReceptor: editBsReceptor,
                monto: editBsMonto, referencia: editBsRef, celular: editBsCel, cliente: editBsCliente,
                observaciones: editBsObs,
                ...(isAdmin ? { rif: editBsRif, factura: editBsFactura, megasoft: editBsMega, cajeroEmail: user?.email ?? "" } : {}),
              } })}
              disabled={editBsMutation.isPending}
            >
              {editBsMutation.isPending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════ MODAL EDICIÓN DIVISAS ══════════════ */}
      <Dialog open={editDivOpen} onOpenChange={setEditDivOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar pago en Divisas</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-sm">Fecha</Label><Input type="date" value={editDivFecha} onChange={e => setEditDivFecha(e.target.value)} className="mt-1"/></div>
            <div><Label className="text-sm">Nombre Pagador</Label><Input value={editDivPagador} onChange={e => setEditDivPagador(e.target.value)} className="mt-1"/></div>
            <div><Label className="text-sm">Monto</Label><Input type="number" value={editDivMonto} onChange={e => setEditDivMonto(e.target.value)} className="mt-1"/></div>
            <div>
              <Label className="text-sm">Tipo</Label>
              <Select value={editDivTipo} onValueChange={setEditDivTipo}>
                <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Zelle">Zelle</SelectItem>
                  <SelectItem value="Binance">Binance</SelectItem>
                  <SelectItem value="Banesco Panamá">Banesco Panamá</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-sm">Referencia</Label><Input value={editDivRef} onChange={e => setEditDivRef(e.target.value)} className="mt-1"/></div>
            <div>
              <Label className="text-sm">Observaciones</Label>
              <Textarea value={editDivObs} onChange={e => setEditDivObs(e.target.value)} placeholder="Agrega una nota..." className="mt-1 resize-none" rows={3}/>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDivOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => editDivPago && editDivMutation.mutate({ id: editDivPago.id, campos: { fecha: editDivFecha, nombrePagador: editDivPagador, monto: editDivMonto, tipo: editDivTipo, referencia: editDivRef, observaciones: editDivObs } })}
              disabled={editDivMutation.isPending}
            >
              {editDivMutation.isPending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════ MODAL ELIMINAR ══════════════ */}
      <Dialog open={deleteOpen} onOpenChange={open => { setDeleteOpen(open); if (!open) setDeletePassword(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Eliminar pago</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Esta acción es irreversible. Ingresa tu contraseña para confirmar.</p>
            <Input
              type="password"
              placeholder="Contraseña"
              value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleDelete()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!deletePassword || deleteLoading}
              onClick={handleDelete}
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
