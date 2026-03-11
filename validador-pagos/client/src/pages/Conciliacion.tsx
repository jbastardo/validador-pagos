import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, Search, Download, AlertCircle, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
}

const BANCOS_RECEPTOR = [
  "0102 Banco de Venezuela",
  "0134 Banesco",
  "0191 BNC (Banco Nacional de Crédito)",
];

const estadoColors: Record<string,string> = {
  Pendiente:  "bg-amber-100 text-amber-700 border-amber-200",
  Verificado: "bg-green-100 text-green-700 border-green-200",
  Rechazado:  "bg-red-100 text-red-700 border-red-200",
};
const estadoIcon: Record<string,any> = { Pendiente: Clock, Verificado: CheckCircle2, Rechazado: XCircle };

export default function Conciliacion() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Filtros ──
  const [busqueda,       setBusqueda]       = useState("");
  const [filtroEstado,   setFiltroEstado]   = useState("todos");
  const [filtroTipo,     setFiltroTipo]     = useState("todos");
  const [filtroBanco,    setFiltroBanco]    = useState("todos");

  // ── Modal contabilidad/admin ──
  const [selected,    setSelected]    = useState<Pago|null>(null);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [obs,         setObs]         = useState("");
  const [dialogOpen,  setDialogOpen]  = useState(false);

  // ── Modal cajero ──
  const [cajeroPago,    setCajeroPago]    = useState<Pago|null>(null);
  const [cajeroFactura, setCajeroFactura] = useState("");
  const [cajeroMega,    setCajeroMega]    = useState<"Sí"|"No"|"">("");
  const [cajeroOpen,    setCajeroOpen]    = useState(false);

  const { data: pagos, isLoading } = useQuery<Pago[]>({ queryKey: ["/api/pagos"] });

  // Mutación contabilidad/admin
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

  // Mutación cajero
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

  const openCajero = (p: Pago) => {
    setCajeroPago(p);
    setCajeroFactura(p.factura ?? "");
    setCajeroMega((p.megasoft as "Sí"|"No"|"") ?? "");
    setCajeroOpen(true);
  };

  // ── Filtrado ──
  const filtrados = (pagos ?? []).filter(p => {
    const q = busqueda.toLowerCase();
    const mq = q === "" || [p.referencia, p.monto, p.bancoEmisor, p.celular, p.rif, p.factura, p.vendedor, p.fechaPago, p.cliente].some(v => v?.toLowerCase().includes(q));
    const me = filtroEstado === "todos" || p.estado === filtroEstado;
    const mt = filtroTipo   === "todos" || p.tipoPago === filtroTipo;
    const mb = filtroBanco  === "todos" || p.bancoReceptor === filtroBanco;
    return mq && me && mt && mb;
  });

  const handleExport = () => {
    const h = ["ID","Fecha","Tipo","Banco Emisor","Monto","Celular","Banco Receptor","Referencia","RIF","Factura","Estado","Validado Por","Vendedor","Observaciones","Cliente","Megasoft"];
    const rows = filtrados.map(p => [p.id,p.fechaPago,p.tipoPago,p.bancoEmisor,p.monto,p.celular,p.bancoReceptor,p.referencia,p.rif,p.factura,p.estado,p.validadoPor,p.vendedor,p.observaciones,p.cliente,p.megasoft]);
    const csv = [h,...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `conciliacion_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const pendienteCount = (pagos ?? []).filter(p => p.estado === "Pendiente").length;
  const isCajero       = user?.rol === "cajero";
  const isContable     = user?.rol === "admin" || user?.rol === "contabilidad";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">Conciliación de Pagos</h1>
          <p className="text-sm text-muted-foreground">
            {isCajero ? "Agrega el número de factura y valida con Megasoft" : "Verifica y aprueba los pagos — sincronizado con Google Sheets"}
          </p>
        </div>
        {pendienteCount > 0 && !isCajero && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-600"/>
            <span className="text-xs font-semibold text-amber-700">{pendienteCount} pendiente{pendienteCount !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      {/* ── Filtros ── */}
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
            <Button variant="outline" onClick={handleExport} className="gap-2 shrink-0">
              <Download className="w-4 h-4"/> Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Tabla ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{filtrados.length} registro{filtrados.length !== 1 ? "s" : ""}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading
            ? <div className="p-4 space-y-2">{[...Array(4)].map((_,i) => <Skeleton key={i} className="h-14 rounded"/>)}</div>
            : filtrados.length === 0
              ? <div className="py-12 text-center text-muted-foreground text-sm">No se encontraron pagos</div>
              : <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 border-y border-border">
                      <tr>
                        <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Fecha</th>
                        <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Tipo</th>
                        <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Monto (Bs.)</th>
                        <th className="text-left px-3 py-3 font-semibold text-muted-foreground hidden md:table-cell">Banco Receptor</th>
                        <th className="text-left px-3 py-3 font-semibold text-muted-foreground hidden lg:table-cell">Cliente</th>
                        <th className="text-left px-3 py-3 font-semibold text-muted-foreground hidden lg:table-cell">Referencia</th>
                        <th className="text-left px-3 py-3 font-semibold text-muted-foreground hidden xl:table-cell">Factura</th>
                        {!isCajero && <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Estado</th>}
                        {isCajero && <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Megasoft</th>}
                        <th className="text-right px-3 py-3 font-semibold text-muted-foreground">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.map(p => {
                        const Icon = estadoIcon[p.estado] ?? Clock;
                        return (
                          <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-3 font-medium">{p.fechaPago}</td>
                            <td className="px-3 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.tipoPago === "PagoMovil" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                                {p.tipoPago === "PagoMovil" ? "📱 Pago Móvil" : "🏦 Transferencia"}
                              </span>
                            </td>
                            <td className="px-3 py-3 font-mono font-semibold">{parseFloat(p.monto || "0").toLocaleString("es-VE",{minimumFractionDigits:2})}</td>
                            <td className="px-3 py-3 text-muted-foreground hidden md:table-cell">{p.bancoReceptor}</td>
                            <td className="px-3 py-3 hidden lg:table-cell">{p.cliente || "—"}</td>
                            <td className="px-3 py-3 font-mono hidden lg:table-cell">{p.referencia || "—"}</td>
                            <td className="px-3 py-3 hidden xl:table-cell">{p.factura || "—"}</td>
                            {!isCajero && (
                              <td className="px-3 py-3">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${estadoColors[p.estado] ?? ""}`}>
                                  <Icon className="w-3 h-3"/>{p.estado}
                                </span>
                              </td>
                            )}
                            {isCajero && (
                              <td className="px-3 py-3">
                                {p.megasoft ? (
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.megasoft === "Sí" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                    {p.megasoft}
                                  </span>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                            )}
                            <td className="px-3 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {/* Botones contabilidad/admin */}
                                {isContable && p.estado === "Pendiente" && <>
                                  <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-green-700 hover:bg-green-50 border-green-200"
                                    onClick={() => { setSelected(p); setNuevoEstado("Verificado"); setObs(""); setDialogOpen(true); }}>
                                    <CheckCircle2 className="w-3 h-3"/> Aprobar
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-red-700 hover:bg-red-50 border-red-200"
                                    onClick={() => { setSelected(p); setNuevoEstado("Rechazado"); setObs(""); setDialogOpen(true); }}>
                                    <XCircle className="w-3 h-3"/> Rechazar
                                  </Button>
                                </>}
                                {/* Botón cajero — solo pagos Verificados */}
                                {isCajero && p.estado === "Verificado" && (
                                  <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-blue-700 hover:bg-blue-50 border-blue-200"
                                    onClick={() => openCajero(p)}>
                                    <Receipt className="w-3 h-3"/> Editar
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
          }
        </CardContent>
      </Card>

      {/* ── Modal contabilidad/admin ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{nuevoEstado === "Verificado" ? "✅ Aprobar pago" : "❌ Rechazar pago"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Fecha:</span><span className="font-medium">{selected.fechaPago}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Monto:</span><span className="font-mono font-bold">Bs. {parseFloat(selected.monto || "0").toLocaleString("es-VE",{minimumFractionDigits:2})}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Banco Emisor:</span><span className="font-medium">{selected.bancoEmisor}</span></div>
                {selected.cliente && <div className="flex justify-between"><span className="text-muted-foreground">Cliente:</span><span className="font-medium">{selected.cliente}</span></div>}
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

      {/* ── Modal cajero ── */}
      <Dialog open={cajeroOpen} onOpenChange={setCajeroOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>📋 Datos de caja</DialogTitle>
          </DialogHeader>
          {cajeroPago && (
            <div className="space-y-4 text-sm">
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Monto:</span><span className="font-mono font-bold">Bs. {parseFloat(cajeroPago.monto || "0").toLocaleString("es-VE",{minimumFractionDigits:2})}</span></div>
                {cajeroPago.cliente && <div className="flex justify-between"><span className="text-muted-foreground">Cliente:</span><span className="font-medium">{cajeroPago.cliente}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Banco Receptor:</span><span className="font-medium">{cajeroPago.bancoReceptor}</span></div>
              </div>
              <div className="space-y-2">
                <Label>Número de Factura</Label>
                <Input placeholder="FAC-0001" value={cajeroFactura} onChange={e => setCajeroFactura(e.target.value)} data-testid="input-cajero-factura"/>
              </div>
              <div className="space-y-2">
                <Label>¿Validado con Megasoft?</Label>
                <Select value={cajeroMega} onValueChange={v => setCajeroMega(v as "Sí"|"No"|"")}>
                  <SelectTrigger data-testid="select-megasoft"><SelectValue placeholder="Selecciona"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Sí">Sí</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCajeroOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => cajeroMutation.mutate({ id: cajeroPago!.id, factura: cajeroFactura, megasoft: cajeroMega })}
              disabled={cajeroMutation.isPending}>
              {cajeroMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
