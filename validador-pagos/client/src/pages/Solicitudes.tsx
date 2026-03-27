import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Edit2, Trash2, Filter, RefreshCw, Info, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Solicitud {
  id: string; vendedor: string; cliente: string; celular: string; sku: string;
  producto: string; cantidad: string;
  fechaTope: string; observaciones: string; estado: string; creadoEn: string;
  observacionesCompras?: string; actualizadoEn?: string; respondidoPor?: string;
}
interface OdooCliente { id: number; name: string; vat: string; phone: string; mobile: string; email: string; }
interface OdooProducto { id: number; name: string; default_code: string; list_price: number; qty_available: number; }

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Solicitudes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ cliente: "", celular: "", sku: "", producto: "", cantidad: "", fechaTope: "", observaciones: "" });

  // --- Filtros ---
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroVendedor, setFiltroVendedor] = useState("");

  // --- Autocomplete cliente Odoo ---
  const [clienteQuery, setClienteQuery] = useState("");
  const [showClienteDD, setShowClienteDD] = useState(false);
  const debouncedCliente = useDebounce(clienteQuery, 350);
  const clienteRef = useRef<HTMLDivElement>(null);
  const { data: clientesOdoo = [] } = useQuery<OdooCliente[]>({
    queryKey: ["odoo-clientes", debouncedCliente],
    queryFn: () => fetch(`/api/odoo/clientes?q=${encodeURIComponent(debouncedCliente)}`).then(r => r.json()),
    enabled: debouncedCliente.length >= 1,
  });

  // --- Crear cliente en Odoo si no existe ---
  const [showCrearCliente, setShowCrearCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ name: "", vat: "", phone: "", mobile: "", email: "" });
  const crearClienteOdoo = useMutation({
    mutationFn: (data: any) => fetch("/api/odoo/clientes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    onSuccess: (c: OdooCliente) => {
      const display = c.vat ? `${c.name} (${c.vat})` : c.name;
      setForm(f => ({ ...f, cliente: display, celular: c.mobile || c.phone || "" }));
      setClienteQuery(display);
      setShowCrearCliente(false);
      setNuevoCliente({ name: "", vat: "", phone: "", mobile: "", email: "" });
      toast({ title: "Cliente creado en Odoo" });
    },
    onError: () => toast({ title: "Error al crear cliente", variant: "destructive" }),
  });

  // --- SKU autocomplete ---
  const debouncedSku = useDebounce(form.sku, 400);
  const [productoLocked, setProductoLocked] = useState(false);
  const { data: productosOdoo = [] } = useQuery<OdooProducto[]>({
    queryKey: ["odoo-productos-sku", debouncedSku],
    queryFn: () => fetch(`/api/odoo/productos?q=${encodeURIComponent(debouncedSku)}`).then(r => r.json()),
    enabled: debouncedSku.length >= 1,
  });
  useEffect(() => {
    if (debouncedSku.length < 1) { if (productoLocked) { setForm(f => ({ ...f, producto: "" })); setProductoLocked(false); } return; }
    const exacto = productosOdoo.find(p => p.default_code.toLowerCase() === debouncedSku.toLowerCase());
    if (exacto) { setForm(f => ({ ...f, producto: exacto.name })); setProductoLocked(true); }
    else if (productoLocked) { setForm(f => ({ ...f, producto: "" })); setProductoLocked(false); }
  }, [debouncedSku, productosOdoo]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node)) setShowClienteDD(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: solicitudes = [], isLoading } = useQuery<Solicitud[]>({
    queryKey: ["solicitudes"],
    queryFn: () => fetch("/api/solicitudes").then(r => r.json()),
  });

  const crear = useMutation({
    mutationFn: (data: any) => fetch("/api/solicitudes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solicitudes"] });
      setOpen(false);
      setForm({ cliente: "", celular: "", sku: "", producto: "", cantidad: "", fechaTope: "", observaciones: "" });
      setClienteQuery(""); setProductoLocked(false);
      toast({ title: "Solicitud creada" });
    },
  });

  // --- Edit solicitud (compras/admin) ---
  const [editOpen, setEditOpen] = useState(false);
  const [editSol, setEditSol] = useState<Solicitud | null>(null);
  const [editForm, setEditForm] = useState({ estado: "", observacionesCompras: "", fechaTope: "", cantidad: "" });
  const editarSolicitud = useMutation({
    mutationFn: (data: any) => fetch(`/api/solicitudes/${editSol?.id}/editar`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, usuario: user?.email }),
    }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solicitudes"] });
      setEditOpen(false);
      toast({ title: "Solicitud actualizada" });
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });
  const openEdit = (s: Solicitud) => {
    setEditSol(s);
    setEditForm({ estado: s.estado, observacionesCompras: s.observacionesCompras || "", fechaTope: s.fechaTope, cantidad: s.cantidad });
    setEditOpen(true);
  };

  // --- Delete solicitud (admin) ---
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSolId, setDeleteSolId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const deleteSolicitud = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const res = await apiRequest("DELETE", `/api/solicitudes/${id}`, { email: user?.email ?? "", password });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "Error al eliminar");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solicitudes"] });
      toast({ title: "Solicitud eliminada" });
      setDeleteOpen(false); setDeletePassword("");
    },
    onError: (err: any) => toast({ title: err.message ?? "Error al eliminar", variant: "destructive" }),
  });
  const handleDelete = async () => {
    if (!deleteSolId || !deletePassword) return;
    setDeleteLoading(true);
    try { await deleteSolicitud.mutateAsync({ id: deleteSolId, password: deletePassword }); }
    finally { setDeleteLoading(false); }
  };

  // --- Vendedor: confirmar compra ---
  const confirmarCompra = useMutation({
    mutationFn: (id: string) => fetch(`/api/solicitudes/${id}/confirmar-vendedor`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendedorEmail: user?.email }),
    }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solicitudes"] });
      toast({ title: "Compra confirmada y notificada" });
    },
    onError: () => toast({ title: "Error al confirmar", variant: "destructive" }),
  });

  // --- Vendedor: solicitar anulacion ---
  const [anularOpen, setAnularOpen] = useState(false);
  const [anularSol, setAnularSol] = useState<Solicitud | null>(null);
  const [anularMotivo, setAnularMotivo] = useState("");
  const anularCompra = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => fetch(`/api/solicitudes/${id}/anular-vendedor`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendedorEmail: user?.email, motivo }),
    }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solicitudes"] });
      setAnularOpen(false); setAnularMotivo("");
      toast({ title: "Solicitud de anulacion enviada" });
    },
    onError: () => toast({ title: "Error al solicitar anulacion", variant: "destructive" }),
  });

  const prioridad = (s: Solicitud) => {
    if (!s.fechaTope) return "Sin fecha";
    const dias = Math.ceil((new Date(s.fechaTope).getTime() - Date.now()) / 86400000);
    if (dias < 0) return "Vencida"; if (dias <= 3) return "Urgente"; if (dias <= 7) return "Alta"; return "Normal";
  };
  const colorPrioridad = (p: string) => (p === "Vencida" || p === "Urgente") ? "destructive" : p === "Alta" ? "default" : "secondary";
  const colorEstado = (e: string) => e === "Pendiente" ? "default" : e === "En Proceso" ? "secondary" : e === "Completada" ? "outline" : e === "Agotado" ? "secondary" : "destructive";
  const isCompras = user?.rol === "admin" || user?.rol === "compras";
  const isAdmin = user?.rol === "admin";
  const isVendedor = user?.rol === "vendedor";
  const selectCliente = (c: OdooCliente) => {
    const display = c.vat ? `${c.name} (${c.vat})` : c.name;
    setForm(f => ({ ...f, cliente: display, celular: c.mobile || c.phone || "" }));
    setClienteQuery(display); setShowClienteDD(false);
  };

  // --- Filtrar solicitudes ---
  const vendedoresUnicos = [...new Set(solicitudes.map(s => s.vendedor))].sort();
  const solicitudesFiltradas = solicitudes.filter(s => {
    if (filtroEstado !== "todos" && s.estado !== filtroEstado) return false;
    if (filtroVendedor && s.vendedor !== filtroVendedor) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Solicitudes de Producto</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["solicitudes"] })} className="gap-2"><RefreshCw className="h-4 w-4" />Actualizar</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gap-2"><PlusCircle className="h-4 w-4" />Nueva Solicitud</Button></DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nueva Solicitud</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                {/* CLIENTE - Autocomplete Odoo */}
                <div ref={clienteRef} className="relative">
                  <Label>Cliente * <span className="text-xs text-muted-foreground">(nombre, RIF o celular)</span></Label>
                  <Input value={clienteQuery} onChange={e => { setClienteQuery(e.target.value); setForm(f => ({ ...f, cliente: e.target.value })); setShowClienteDD(true); }} onFocus={() => clienteQuery.length >= 1 && setShowClienteDD(true)} placeholder="Buscar en Odoo..." />
                  {showClienteDD && debouncedCliente.length >= 1 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {clientesOdoo.length > 0 ? clientesOdoo.map(c => (
                        <div key={c.id} className="p-2 hover:bg-gray-100 cursor-pointer border-b" onClick={() => selectCliente(c)}>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.vat && <span>RIF: {c.vat} </span>}
                            {c.mobile && <span>Cel: {c.mobile} </span>}
                            {c.phone && !c.mobile && <span>Tel: {c.phone} </span>}
                            {c.email && <span>{c.email}</span>}
                          </div>
                        </div>
                      )) : (
                        <div className="p-3 text-sm text-muted-foreground">
                          No encontrado. <a href="#" className="text-blue-600 underline" onClick={e => { e.preventDefault(); setShowClienteDD(false); setShowCrearCliente(true); setNuevoCliente(n => ({ ...n, name: clienteQuery })); }}>Crear nuevo cliente en Odoo</a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* CREAR CLIENTE - panel inline */}
                {showCrearCliente && (
                  <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                    <p className="text-sm font-medium">Nuevo cliente en Odoo</p>
                    <div><Label>Nombre *</Label><Input value={nuevoCliente.name} onChange={e => setNuevoCliente(n => ({ ...n, name: e.target.value }))} placeholder="Nombre completo" /></div>
                    <div><Label>RIF / CI</Label><Input value={nuevoCliente.vat} onChange={e => setNuevoCliente(n => ({ ...n, vat: e.target.value }))} placeholder="J-123456789" /></div>
                    <div><Label>Celular</Label><Input value={nuevoCliente.mobile} onChange={e => setNuevoCliente(n => ({ ...n, mobile: e.target.value }))} placeholder="04XX-XXXXXXX" /></div>
                    <div><Label>Telefono</Label><Input value={nuevoCliente.phone} onChange={e => setNuevoCliente(n => ({ ...n, phone: e.target.value }))} placeholder="0212-XXXXXXX" /></div>
                    <div><Label>Correo</Label><Input value={nuevoCliente.email} onChange={e => setNuevoCliente(n => ({ ...n, email: e.target.value }))} placeholder="correo@empresa.com" /></div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => crearClienteOdoo.mutate(nuevoCliente)} disabled={!nuevoCliente.name.trim() || crearClienteOdoo.isPending}>{crearClienteOdoo.isPending ? "Guardando..." : "Crear en Odoo"}</Button>
                      <Button size="sm" variant="outline" onClick={() => setShowCrearCliente(false)}>Cancelar</Button>
                    </div>
                  </div>
                )}
                {/* CELULAR */}
                <div><Label>Celular</Label><Input value={form.celular} onChange={e => setForm(f => ({ ...f, celular: e.target.value }))} placeholder="04XX-XXXXXXX" /></div>
                {/* SKU + PRODUCTO */}
                <div><Label>SKU</Label><Input value={form.sku} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, sku: v, producto: v ? f.producto : "" })); if (!e.target.value) setProductoLocked(false); }} placeholder="Ej: PROD-001" /></div>
                <div><Label>Producto * {productoLocked && <Badge variant="outline" className="ml-1">OK Odoo</Badge>}</Label><Input value={form.producto} onChange={e => setForm(f => ({ ...f, producto: e.target.value }))} disabled={productoLocked} placeholder="Nombre del producto" className={productoLocked ? "bg-muted" : ""} /></div>
                {/* CANTIDAD */}
                <div><Label>Cantidad *</Label><Input type="number" value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} /></div>
                {/* FECHA TOPE */}
                <div><Label>Fecha tope</Label><Input type="date" value={form.fechaTope} onChange={e => setForm(f => ({ ...f, fechaTope: e.target.value }))} /></div>
                {/* OBSERVACIONES */}
                <div><Label>Observaciones</Label><Textarea value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} /></div>
                <Button onClick={() => crear.mutate({ ...form, vendedor: user?.email || "" })} disabled={!form.cliente || !form.producto || !form.cantidad || crear.isPending}>{crear.isPending ? "Guardando..." : "Crear Solicitud"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {/* FILTROS (compras/admin) */}
      {isCompras && (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-medium">Filtros:</span></div>
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="Pendiente">Pendiente</SelectItem>
              <SelectItem value="En Proceso">En Proceso</SelectItem>
              <SelectItem value="Completada">Completada</SelectItem>
              <SelectItem value="Cancelada">Cancelada</SelectItem><SelectItem value="Agotado">Agotado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroVendedor || "todos"} onValueChange={v => setFiltroVendedor(v === "todos" ? "" : v)}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Vendedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los vendedores</SelectItem>
              {vendedoresUnicos.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{solicitudesFiltradas.length} de {solicitudes.length} solicitudes</span>
        </div>
      )}
      {isLoading ? <p>Cargando...</p> : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="p-3 text-left">ID</th>
              <th className="p-3 text-left">Cliente</th>
              <th className="p-3 text-left">Celular</th>
              <th className="p-3 text-left">Producto</th>
              <th className="p-3 text-left">Cant.</th>
              <th className="p-3 text-left">Fecha Tope</th>
              <th className="p-3 text-left">Prioridad</th>
              <th className="p-3 text-left">Estado</th>
              <th className="p-3 text-left">Vendedor</th>
              <th className="p-3 text-left">Obs. Compras</th>
              <th className="p-3 text-left">Acciones</th>
            </tr></thead>
            <tbody>
              {solicitudesFiltradas.map(s => (
                <tr key={s.id} className="border-b">
                  <td className="p-3">{s.id}</td>
                  <td className="p-3">{s.cliente}</td>
                  <td className="p-3">{s.celular || "\u2014"}</td>
                  <td className="p-3">{s.sku ? `[${s.sku}] ` : ""}{s.producto}</td>
                  <td className="p-3">{s.cantidad}</td>
                  <td className="p-3">{s.fechaTope || "\u2014"}</td>
                  <td className="p-3"><Badge variant={colorPrioridad(prioridad(s)) as any}>{prioridad(s)}</Badge></td>
                  <td className="p-3"><Badge variant={colorEstado(s.estado) as any}>{s.estado}</Badge>{s.respondidoPor && <span title={`Respondido por: ${s.respondidoPor}\nFecha: ${s.actualizadoEn ? new Date(s.actualizadoEn).toLocaleString() : "\u2014"}`} className="ml-1 cursor-help"><Info className="h-3 w-3 inline text-muted-foreground" /></span>}</td>
                  <td className="p-3">{s.vendedor}</td>
                  <td className="p-3 text-xs max-w-[200px] truncate" title={s.observacionesCompras}>{s.observacionesCompras || "\u2014"}</td>
                  <td className="p-3 space-x-1">
                    {/* Compras/Admin: editar */}
                    {isCompras && <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Edit2 className="h-4 w-4" /></Button>}
                    {/* Admin: eliminar */}
                    {isAdmin && <Button size="sm" variant="ghost" className="text-red-500" onClick={() => { setDeleteSolId(s.id); setDeletePassword(""); setDeleteOpen(true); }}><Trash2 className="h-4 w-4" /></Button>}
                    {/* Vendedor: confirmar compra */}
                    {isVendedor && (s.estado === "Completada") && (
                      <Button size="sm" variant="ghost" className="text-green-600" title="Confirmar compra" onClick={() => confirmarCompra.mutate(s.id)} disabled={confirmarCompra.isPending}><CheckCircle className="h-4 w-4" /></Button>
                    )}
                    {/* Vendedor: solicitar anulacion */}
                    {isVendedor && (s.estado !== "Cancelada") && (
                      <Button size="sm" variant="ghost" className="text-red-500" title="Solicitar anulacion" onClick={() => { setAnularSol(s); setAnularMotivo(""); setAnularOpen(true); }}><XCircle className="h-4 w-4" /></Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* DIALOG EDITAR SOLICITUD (compras/admin) */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Solicitud #{editSol?.id}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-medium">Cliente:</span> {editSol?.cliente}</div>
              <div><span className="font-medium">Producto:</span> {editSol?.sku ? `[${editSol.sku}] ` : ""}{editSol?.producto}</div>
              <div><span className="font-medium">Vendedor:</span> {editSol?.vendedor}</div>
              <div><span className="font-medium">Obs. vendedor:</span> {editSol?.observaciones || "\u2014"}</div>
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={editForm.estado} onValueChange={v => setEditForm(f => ({ ...f, estado: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pendiente">Pendiente</SelectItem>
                  <SelectItem value="En Proceso">En Proceso</SelectItem>
                  <SelectItem value="Completada">Completada</SelectItem>
                  <SelectItem value="Cancelada">Cancelada</SelectItem>
                                    <SelectItem value="Agotado">Agotado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Cantidad</Label><Input type="number" value={editForm.cantidad} onChange={e => setEditForm(f => ({ ...f, cantidad: e.target.value }))} /></div>
            <div><Label>Fecha tope</Label><Input type="date" value={editForm.fechaTope} onChange={e => setEditForm(f => ({ ...f, fechaTope: e.target.value }))} /></div>
            <div><Label>Observaciones de Compras</Label><Textarea value={editForm.observacionesCompras} onChange={e => setEditForm(f => ({ ...f, observacionesCompras: e.target.value }))} placeholder="Notas de compras..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={() => editarSolicitud.mutate(editForm)} disabled={editarSolicitud.isPending}>{editarSolicitud.isPending ? "Guardando..." : "Guardar cambios"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG ELIMINAR SOLICITUD (admin) */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { if (!deleteLoading) { setDeleteOpen(o); if (!o) setDeletePassword(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Eliminar solicitud</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Esta accion es <strong>irreversible</strong>. La solicitud sera eliminada permanentemente. Ingresa tu contrase\u00f1a para confirmar.</p>
          <div><Label>Tu contrase\u00f1a</Label><Input type="password" placeholder="********" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && deletePassword) handleDelete(); }} autoFocus /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeletePassword(""); }} disabled={deleteLoading}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!deletePassword || deleteLoading}>{deleteLoading ? "Eliminando..." : "Eliminar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG SOLICITAR ANULACION (vendedor) */}
      <Dialog open={anularOpen} onOpenChange={(o) => { setAnularOpen(o); if (!o) setAnularMotivo(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Solicitar anulacion - Solicitud #{anularSol?.id}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-medium">Cliente:</span> {anularSol?.cliente}</div>
              <div><span className="font-medium">Producto:</span> {anularSol?.sku ? `[${anularSol.sku}] ` : ""}{anularSol?.producto}</div>
              <div><span className="font-medium">Estado actual:</span> {anularSol?.estado}</div>
            </div>
            <div>
              <Label>Motivo de anulacion *</Label>
              <Textarea value={anularMotivo} onChange={e => setAnularMotivo(e.target.value)} placeholder="Explica por que solicitas la anulacion de este requerimiento..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnularOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => anularSol && anularCompra.mutate({ id: anularSol.id, motivo: anularMotivo })} disabled={!anularMotivo.trim() || anularCompra.isPending}>{anularCompra.isPending ? "Enviando..." : "Solicitar anulacion"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
