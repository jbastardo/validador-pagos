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
import { PlusCircle, Edit2, Trash2, Filter, RefreshCw, Info, CheckCircle, XCircle, CheckSquare, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Solicitud {
  id: string; vendedor: string; cliente: string; celular: string; sku: string;
  producto: string; cantidad: string;
  fechaTope: string; observaciones: string; estado: string; creadoEn: string;
  observacionesCompras?: string; actualizadoEn?: string; respondidoPor?: string; categoria?: string;
}
interface OdooCliente { id: number; name: string; vat: string; phone: string; mobile: string; email: string; }
interface OdooProducto { id: number; name: string; default_code: string; list_price: number; qty_available: number; categ_id: string; }

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
  const [items, setItems] = useState<Array<{ sku: string; producto: string; cantidad: string; categoria: string }>>([]);
  const [nuevoItem, setNuevoItem] = useState({ sku: "", producto: "", cantidad: "1", categoria: "", productoLocked: false });

  // --- Filtros ---
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroVendedor, setFiltroVendedor] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const debouncedBusqueda = useDebounce(busqueda, 300);

  // --- Selección múltiple (compras/admin) ---
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const toggleSeleccion = (id: string) => {
    setSeleccionados(s => {
      const newSet = new Set(s);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };
  const toggleTodos = () => {
    if (seleccionados.size === solicitudesFiltradas.length) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(solicitudesFiltradas.map(s => s.id)));
    }
  };
  const seleccionarPorEstado = (estado: string) => {
    const ids = solicitudesFiltradas.filter(s => s.estado === estado).map(s => s.id);
    setSeleccionados(new Set(ids));
  };

  // --- Categorías predefinidas ---
  const categorias = [
    "Alarmas", "Control de Acceso", "Electrónica", "Seguridad", "Telefonía", "Oficina y Hogar", "Iluminación", "Ferretería", "CCTV", "Redes", "Computación"
  ];
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("");

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
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
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

  // --- SKU autocomplete para form (legacy) ---
  const debouncedSku = useDebounce(form.sku, 400);
  const [productoLocked, setProductoLocked] = useState(false);
  const { data: productosOdoo = [] } = useQuery<OdooProducto[]>({
    queryKey: ["odoo-productos-sku", debouncedSku],
    queryFn: () => fetch(`/api/odoo/productos?q=${encodeURIComponent(debouncedSku)}`).then(r => r.json()),
    enabled: debouncedSku.length >= 1,
  });

  useEffect(() => {
    if (debouncedSku.length < 1) {
      if (productoLocked) { setForm(f => ({ ...f, producto: "" })); setProductoLocked(false); }
      return;
    }
    const exacto = productosOdoo.find(p => p.default_code.toLowerCase() === debouncedSku.toLowerCase());
    if (exacto) { setForm(f => ({ ...f, producto: exacto.name })); setProductoLocked(true); }
    else if (productoLocked) { setForm(f => ({ ...f, producto: "" })); setProductoLocked(false); }
  }, [debouncedSku, productosOdoo]);

  // --- SKU autocomplete para nuevoItem ---
  const debouncedNuevoSku = useDebounce(nuevoItem.sku, 400);
  const { data: productosOdoo2 = [] } = useQuery<OdooProducto[]>({
    queryKey: ["odoo-productos-nuevoitem", debouncedNuevoSku],
    queryFn: () => fetch(`/api/odoo/productos?q=${encodeURIComponent(debouncedNuevoSku)}`).then(r => r.json()),
    enabled: debouncedNuevoSku.length >= 1,
  });

  useEffect(() => {
    if (debouncedNuevoSku.length < 1) {
      if (nuevoItem.productoLocked) { setNuevoItem(i => ({ ...i, producto: "", categoria: "", productoLocked: false })); }
      return;
    }
    const exacto = productosOdoo2.find(p => p.default_code.toLowerCase() === debouncedNuevoSku.toLowerCase());
    if (exacto) { setNuevoItem(i => ({ ...i, producto: exacto.name, categoria: exacto.categ_id || "", productoLocked: true })); }
    else if (nuevoItem.productoLocked) { setNuevoItem(i => ({ ...i, producto: "", categoria: "", productoLocked: false })); }
  }, [debouncedNuevoSku, productosOdoo2]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node)) setShowClienteDD(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // --- Vendedor: editar observaciones ---
  const [obsOpen, setObsOpen] = useState(false);
  const [obsSol, setObsSol] = useState<Solicitud | null>(null);
  const [obsForm, setObsForm] = useState({ observaciones: "" });
  const editarObsVendedor = useMutation({
    mutationFn: (data: any) => fetch(`/api/solicitudes/${obsSol?.id}/observaciones-vendedor`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ observaciones: data.observaciones }),
    }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solicitudes"] });
      setObsOpen(false);
      toast({ title: "Observaciones actualizadas" });
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });
  const openObsEdit = (s: Solicitud) => {
    setObsSol(s);
    setObsForm({ observaciones: s.observaciones || "" });
    setObsOpen(true);
  };

  const { data: solicitudes = [], isLoading } = useQuery<Solicitud[]>({
    queryKey: ["solicitudes"],
    queryFn: () => fetch("/api/solicitudes").then(r => r.json()),
  });

  const crear = useMutation({
    mutationFn: async (data: any) => {
      const results = [];
      for (const item of data.items) {
        const res = await fetch("/api/solicitudes", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cliente: data.cliente,
            celular: data.celular,
            sku: item.sku,
            producto: item.producto,
            cantidad: item.cantidad,
            fechaTope: data.fechaTope,
            observaciones: data.observaciones,
            categoria: item.categoria,
            vendedor: data.vendedor,
          }),
        });
        if (!res.ok) throw new Error();
        results.push(await res.json());
      }
      return results;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solicitudes"] });
      setOpen(false);
      setForm({ cliente: "", celular: "", sku: "", producto: "", cantidad: "", fechaTope: "", observaciones: "" });
      setItems([]);
      setCategoriaSeleccionada("");
      setClienteQuery("");
      setProductoLocked(false);
      toast({ title: "Solicitudes creadas" });
    },
  });

  // --- Edit solicitud (compras/admin) ---
  const [editOpen, setEditOpen] = useState(false);
  const [editSol, setEditSol] = useState<Solicitud | null>(null);
  const [editForm, setEditForm] = useState({ estado: "", observacionesCompras: "", fechaTope: "", cantidad: "", categoria: "" });
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
    setEditForm({ estado: s.estado, observacionesCompras: s.observacionesCompras || "", fechaTope: s.fechaTope, cantidad: s.cantidad, categoria: s.categoria || "" });
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
      setDeleteOpen(false);
      setDeletePassword("");
    },
    onError: (err: any) => toast({ title: err.message ?? "Error al eliminar", variant: "destructive" }),
  });
  const handleDelete = async () => {
    if (!deleteSolId || !deletePassword) return;
    setDeleteLoading(true);
    try { await deleteSolicitud.mutateAsync({ id: deleteSolId, password: deletePassword }); } finally { setDeleteLoading(false); }
  };

  // --- Vendedor: confirmar compra ---
  const confirmarCompra = useMutation({
    mutationFn: (sol: Solicitud) => fetch(`/api/solicitudes/${sol.id}/confirmar-vendedor`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendedorEmail: user?.email, respondidoPor: sol.respondidoPor }),
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
    mutationFn: ({ id, motivo, respondidoPor }: { id: string; motivo: string; respondidoPor?: string }) => fetch(`/api/solicitudes/${id}/anular-vendedor`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendedorEmail: user?.email, motivo, respondidoPor }),
    }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solicitudes"] });
      setAnularOpen(false);
      setAnularMotivo("");
      toast({ title: "Solicitud de anulacion enviada" });
    },
    onError: () => toast({ title: "Error al solicitar anulacion", variant: "destructive" }),
  });

  // --- Batch: cambiar estado (compras/admin) ---
  const batchCambiarEstado = useMutation({
    mutationFn: async ({ ids, estado, observaciones }: { ids: string[]; estado: string; observaciones?: string }) => {
      for (const id of ids) {
        const res = await fetch(`/api/solicitudes/${id}/editar`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado, observacionesCompras: observaciones, usuario: user?.email }),
        });
        if (!res.ok) throw new Error();
      }
    },
    onSuccess: (_void, { ids }) => {
      qc.invalidateQueries({ queryKey: ["solicitudes"] });
      toast({ title: `${ids.length} solicitudes actualizadas` });
      setSeleccionados(new Set());
    },
    onError: () => toast({ title: "Error al actualizar en masa", variant: "destructive" }),
  });

  // --- Batch: eliminar (admin) ---
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchDeletePassword, setBatchDeletePassword] = useState("");
  const batchEliminar = useMutation({
    mutationFn: async ({ ids, password }: { ids: string[]; password: string }) => {
      for (const id of ids) {
        const res = await apiRequest("DELETE", `/api/solicitudes/${id}`, { email: user?.email ?? "", password });
        if (!res.ok) throw new Error();
      }
    },
    onSuccess: (_void, { ids }) => {
      qc.invalidateQueries({ queryKey: ["solicitudes"] });
      toast({ title: `${ids.length} solicitudes eliminadas` });
      setSeleccionados(new Set());
      setBatchDeleteOpen(false);
      setBatchDeletePassword("");
    },
    onError: () => toast({ title: "Error al eliminar en masa", variant: "destructive" }),
  });

  // --- Batch: confirmar acepta (vendedor) ---
  const batchConfirmar = useMutation({
    mutationFn: async ({ ids }: { ids: string[] }) => {
      for (const id of ids) {
        const sol = solicitudes.find(x => x.id === id);
        if (sol) {
          const res = await fetch(`/api/solicitudes/${id}/confirmar-vendedor`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vendedorEmail: user?.email, respondidoPor: sol.respondidoPor }),
          });
          if (!res.ok) throw new Error();
        }
      }
    },
    onSuccess: (_void, { ids }) => {
      qc.invalidateQueries({ queryKey: ["solicitudes"] });
      toast({ title: `${ids.length} compras confirmadas` });
      setSeleccionados(new Set());
    },
    onError: () => toast({ title: "Error al confirmar en masa", variant: "destructive" }),
  });

  const prioridad = (s: Solicitud) => {
    if (!s.fechaTope) return "Sin fecha";
    const dias = Math.ceil((new Date(s.fechaTope).getTime() - Date.now()) / 86400000);
    if (dias < 0) return "Vencida";
    if (dias <= 3) return "Urgente";
    if (dias <= 7) return "Alta";
    return "Normal";
  };
  const colorPrioridad = (p: string) => (p === "Vencida" || p === "Urgente") ? "destructive" : p === "Alta" ? "default" : "secondary";
  const colorEstado = (e: string) => e === "Pendiente" ? "default" : e === "En Proceso" ? "secondary" : e === "Completada" ? "outline" : e === "Agotado" ? "secondary" : "destructive";

  const isCompras = user?.rol === "admin" || user?.rol === "compras";
  const isAdmin = user?.rol === "admin";
  const isVendedor = user?.rol === "vendedor";

  const selectCliente = (c: OdooCliente) => {
    const display = c.vat ? `${c.name} (${c.vat})` : c.name;
    setForm(f => ({ ...f, cliente: display, celular: c.mobile || c.phone || "" }));
    setClienteQuery(display);
    setShowClienteDD(false);
  };

  // --- Filtrar solicitudes ---
  const vendedoresUnicos = [...new Set(solicitudes.map(s => s.vendedor))].sort();
  const solicitudesFiltradas = solicitudes.filter(s => {
    if (filtroEstado !== "todos" && s.estado !== filtroEstado) return false;
    if (filtroVendedor && s.vendedor !== filtroVendedor) return false;
    if (debouncedBusqueda) {
      const q = debouncedBusqueda.toLowerCase();
      if (!s.cliente.toLowerCase().includes(q) && !s.producto.toLowerCase().includes(q) && !s.sku?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // --- Agrupar solicitudes por cliente+vendedor+fechaTope para mostrar como una solicitud ---
  interface SolicitudGrupo {
    key: string;
    items: Solicitud[];
    primerId: string;
  }
  const grupos: SolicitudGrupo[] = [];
  const grupoMap = new Map<string, number>();
  solicitudesFiltradas.forEach(s => {
    const key = `${s.cliente}|${s.vendedor}|${s.fechaTope || ""}`;
    if (!grupoMap.has(key)) {
      grupoMap.set(key, grupos.length);
      grupos.push({ key, items: [], primerId: s.id });
    }
    grupos[grupoMap.get(key)!].items.push(s);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Solicitudes de Producto</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["solicitudes"] })} className="gap-2"><RefreshCw className="h-4 w-4" />Actualizar</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gap-2"><PlusCircle className="h-4 w-4" />Nueva Solicitud</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nueva Solicitud</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                {/* CLIENTE - Autocomplete Odoo */}
                <div ref={clienteRef} className="relative">
                  <Label>Cliente * <span className="text-xs text-muted-foreground">(nombre, RIF o celular)</span></Label>
                  <Input value={clienteQuery} onChange={e => { setClienteQuery(e.target.value); setForm(f => ({ ...f, cliente: e.target.value })); setShowClienteDD(true); }} onFocus={() => clienteQuery.length >= 1 && setShowClienteDD(true)} placeholder="Buscar en Odoo..." />
                  {showClienteDD && debouncedCliente.length >= 1 && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
                      {clientesOdoo.length > 0 ? clientesOdoo.map(c => (
                        <div key={c.id} className="p-2 hover:bg-muted cursor-pointer border-b last:border-0" onClick={() => selectCliente(c)}>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.vat && <span>RIF: {c.vat} </span>}
                            {c.mobile && <span>Cel: {c.mobile} </span>}
                            {c.phone && !c.mobile && <span>Tel: {c.phone} </span>}
                            {c.email && <span>{c.email}</span>}
                          </div>
                        </div>
                      )) : (
                        <div className="p-3 text-sm text-muted-foreground">No encontrado. <a href="#" className="text-primary underline" onClick={e => { e.preventDefault(); setShowClienteDD(false); setShowCrearCliente(true); setNuevoCliente(n => ({ ...n, name: clienteQuery })); }}>Crear nuevo cliente en Odoo</a></div>
                      )}
                    </div>
                  )}
                </div>
                {/* CREAR CLIENTE - panel inline */}
                {showCrearCliente && (
                  <div className="border rounded-md p-4 space-y-3 bg-muted/30">
                    <h4 className="font-medium">Nuevo cliente en Odoo</h4>
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
                {/* MULTIPLES PRODUCTOS */}
                <div className="border rounded-md p-4 space-y-3">
                  <h4 className="font-medium">Productos</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <Input 
                      placeholder="SKU" 
                      value={nuevoItem.sku} 
                      onChange={e => setNuevoItem(i => ({ ...i, sku: e.target.value.toUpperCase() }))} 
                    />
                    <Input 
                      placeholder="Nombre del producto" 
                      value={nuevoItem.producto} 
                      onChange={e => setNuevoItem(i => ({ ...i, producto: e.target.value }))} 
                    />
                    <Input 
                      type="number" 
                      placeholder="Cantidad" 
                      value={nuevoItem.cantidad} 
                      onChange={e => setNuevoItem(i => ({ ...i, cantidad: e.target.value }))} 
                    />
                    <Select value={nuevoItem.categoria} onValueChange={v => setNuevoItem(i => ({ ...i, categoria: v }))}>
                      <SelectTrigger><SelectValue placeholder="Categoría" /></SelectTrigger>
                      <SelectContent>
                        {categorias.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => { 
                      if (nuevoItem.producto && nuevoItem.cantidad) { 
                        setItems(i => [...i, { ...nuevoItem }]); 
                        setNuevoItem({ sku: "", producto: "", cantidad: "1", categoria: "", productoLocked: false }); 
                      }
                    }} 
                    disabled={!nuevoItem.producto || !nuevoItem.cantidad}
                  >
                    Agregar Producto
                  </Button>
                  {items.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-muted/30 p-2 rounded text-sm">
                          <span className="font-medium">{idx + 1}.</span>
                          <span>{item.sku ? `[${item.sku}] ` : ""}{item.producto}</span>
                          <span className="text-muted-foreground">x{item.cantidad}</span>
                          {item.categoria && <Badge variant="outline" className="text-xs">{item.categoria}</Badge>}
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="ml-auto h-6 p-0" 
                            onClick={() => setItems(i => i.filter((_, x) => x !== idx))}
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* FECHA TOPE */}
                <div><Label>Fecha tope</Label><Input type="date" value={form.fechaTope} onChange={e => setForm(f => ({ ...f, fechaTope: e.target.value }))} /></div>
                {/* OBSERVACIONES */}
                <div><Label>Observaciones</Label><Textarea value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} /></div>
                <Button 
                  onClick={() => {
                    const itemsToSave = items.length > 0 ? items : [{ sku: form.sku, producto: form.producto, cantidad: form.cantidad, categoria: categoriaSeleccionada }];
                    crear.mutate({ items: itemsToSave, cliente: form.cliente, celular: form.celular, fechaTope: form.fechaTope, observaciones: form.observaciones, vendedor: user?.email || "" });
                  }} 
                  disabled={!form.cliente || crear.isPending}
                >
                  {crear.isPending ? "Guardando..." : items.length > 0 ? `Crear ${items.length + 1} Solicitudes` : "Crear Solicitud"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {/* BUSCADOR Y FILTROS */}
      <div className="flex items-center gap-4 flex-wrap">
        <Input placeholder="Buscar cliente o producto..." value={busqueda} onChange={e => setBusqueda(e.target.value)} className="w-[220px]" />
        {/* Filtro vendedor - visible para todos */}
        <Select value={filtroVendedor || "todos"} onValueChange={v => setFiltroVendedor(v === "todos" ? "" : v)}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los vendedores</SelectItem>
            {vendedoresUnicos.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        {isCompras && (
          <>
            <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-medium">Filtros:</span></div>
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="Pendiente">Pendiente</SelectItem>
              <SelectItem value="En Proceso">En Proceso</SelectItem>
              <SelectItem value="Completada">Completada</SelectItem>
              <SelectItem value="Cancelada">Cancelada</SelectItem>
              <SelectItem value="Agotado">Agotado</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{solicitudesFiltradas.length} de {solicitudes.length} solicitudes</span>
          </>
        )}
      </div>
      {/* BARRA DE ACCIONES BATCH (solo compras/admin) */}
      {isCompras && seleccionados.size > 0 && (
        <div className="flex items-center gap-2 bg-blue-50 border rounded-md p-2">
          <span className="text-sm font-medium">{seleccionados.size} seleccionados</span>
          <div className="flex gap-1 ml-2">
            <Button size="sm" variant="outline" onClick={() => batchCambiarEstado.mutate({ ids: Array.from(seleccionados), estado: "En Proceso" })}>Marcar "En Proceso"</Button>
            <Button size="sm" variant="outline" onClick={() => batchCambiarEstado.mutate({ ids: Array.from(seleccionados), estado: "Completada" })}>Marcar "Completada"</Button>
            <Button size="sm" variant="outline" onClick={() => batchCambiarEstado.mutate({ ids: Array.from(seleccionados), estado: "Cancelada" })}>Marcar "Cancelada"</Button>
            <Button size="sm" variant="outline" onClick={() => batchCambiarEstado.mutate({ ids: Array.from(seleccionados), estado: "Agotado" })}>Marcar "Agotado"</Button>
          </div>
          <div className="flex gap-1 ml-auto">
            <Select onValueChange={v => seleccionarPorEstado(v)}>
              <SelectTrigger className="w-[140px] h-8"><SelectValue placeholder="Seleccionar por estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Pendiente">Pendiente</SelectItem>
                <SelectItem value="En Proceso">En Proceso</SelectItem>
                <SelectItem value="Completada">Completada</SelectItem>
                <SelectItem value="Cancelada">Cancelada</SelectItem>
                <SelectItem value="Agotado">Agotado</SelectItem>
              </SelectContent>
            </Select>
            {isAdmin && <Button size="sm" variant="destructive" onClick={() => setBatchDeleteOpen(true)}>Eliminar</Button>}
            <Button size="sm" variant="ghost" onClick={() => setSeleccionados(new Set())}>Limpiar</Button>
          </div>
        </div>
      )}
      {isLoading ? <p>Cargando...</p> : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              {isCompras && <th className="p-2 text-center w-8">
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={toggleTodos} title={seleccionados.size === solicitudesFiltradas.length ? "Deseleccionar todos" : "Seleccionar todos"}>
                  {seleccionados.size === solicitudesFiltradas.length ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                </Button>
              </th>}
              <th className="p-3 text-left">ID</th>
              <th className="p-3 text-left">Cliente</th>
              <th className="p-3 text-left">Producto</th>
              <th className="p-3 text-left">Cant.</th>
              <th className="p-3 text-left">Categoría</th>
              <th className="p-3 text-left">Fecha Tope</th>
              <th className="p-3 text-left">Creado</th>
              <th className="p-3 text-left">Prioridad</th>
              <th className="p-3 text-left">Estado</th>
              <th className="p-3 text-left">Vendedor</th>
              <th className="p-3 text-left">Obs. Compras</th>
              <th className="p-3 text-left">Acciones</th>
            </tr></thead>
            <tbody>
              {grupos.map((grupo, gIdx) => (
                <>
                  {grupo.items.map((s, iIdx) => (
                    <tr key={`${s.id}-${iIdx}`} className={`border-b ${iIdx === 0 ? "bg-blue-50/50" : ""} ${seleccionados.has(s.id) ? "bg-yellow-50" : ""}`}>
                      {isCompras && <td className="p-2 text-center">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => toggleSeleccion(s.id)}>
                          {seleccionados.has(s.id) ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
                        </Button>
                      </td>}
                      <td className="p-3">
                        {iIdx === 0 ? (
                          <div>
                            <span className="font-bold text-blue-700">{grupo.primerId}</span>
                            <span className="text-xs text-muted-foreground ml-1">({grupo.items.length} items)</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs ml-4">└─ {iIdx + 1}</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{s.cliente}</div>
                        {s.celular && <div className="text-xs text-muted-foreground">{s.celular}</div>}
                      </td>
                      <td className="p-3">{s.sku ? <code className="bg-muted px-1 rounded text-xs">[{s.sku}]</code> : ""} {s.producto}</td>
                      <td className="p-3 font-medium">{s.cantidad}</td>
                      <td className="p-3">{s.categoria || "\u2014"}</td>
                      <td className="p-3">{s.fechaTope || "\u2014"}</td>
                      <td className="p-3">{s.creadoEn ? new Date(s.creadoEn).toLocaleDateString() : "\u2014"}</td>
                      <td className="p-3"><Badge variant={colorPrioridad(prioridad(s)) as any}>{prioridad(s)}</Badge></td>
                      <td className="p-3"><Badge variant={colorEstado(s.estado) as any}>{s.estado}</Badge>{s.respondidoPor && <span title={`Respondido por: ${s.respondidoPor}\nFecha: ${s.actualizadoEn ? new Date(s.actualizadoEn).toLocaleString() : "\u2014"}`} className="ml-1 cursor-help"><Info className="h-3 w-3 inline text-muted-foreground" /></span>}</td>
                      <td className="p-3">{s.vendedor}</td>
                      <td className="p-3 text-xs max-w-[150px] truncate" title={s.observacionesCompras}>{s.observacionesCompras || "\u2014"}</td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1 items-start min-w-[140px]">
                          {/* Vendedor: editar observaciones */}
                          {isVendedor && <Button size="sm" variant="ghost" onClick={() => openObsEdit(s)} title="Editar observaciones"><Edit2 className="h-4 w-4" /></Button>}
                          {/* Compras/Admin: editar */}
                          {isCompras && <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Edit2 className="h-4 w-4" /></Button>}
                          {/* Admin: eliminar */}
                          {isAdmin && <Button size="sm" variant="ghost" className="text-red-500" onClick={() => { setDeleteSolId(s.id); setDeletePassword(""); setDeleteOpen(true); }}><Trash2 className="h-4 w-4" /></Button>}
                          {/* Vendedor: confirmar/aceptar - disponible en Pendiente, En Proceso y Completada */}
                          {isVendedor && (s.estado === "Pendiente" || s.estado === "En Proceso" || s.estado === "Completada") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full justify-start gap-1 border-green-500 text-green-700 hover:bg-green-50 hover:text-green-800 font-medium text-xs"
                              title={s.estado === "Pendiente" ? "Aceptar solicitud" : s.estado === "En Proceso" ? "Confirmar entrega" : "Confirmar compra"}
                              onClick={() => confirmarCompra.mutate(s)}
                              disabled={confirmarCompra.isPending}
                            >
                              <CheckCircle className="h-4 w-4" />
                              {confirmarCompra.isPending ? "..." : s.estado === "Pendiente" ? "Aceptar" : s.estado === "En Proceso" ? "Entrega" : "Confirmar"}
                            </Button>
                          )}
                          {/* Vendedor: solicitar anulacion - disponible en Pendiente y En Proceso */}
                          {isVendedor && (s.estado === "Pendiente" || s.estado === "En Proceso") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full justify-start gap-1 border-red-400 text-red-600 hover:bg-red-50 hover:text-red-700 font-medium text-xs"
                              title="Solicitar anulacion"
                              onClick={() => { setAnularSol(s); setAnularMotivo(""); setAnularOpen(true); }}
                            >
                              <XCircle className="h-4 w-4" />
                              Anular
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </>
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
            <div>
              <Label>Categoría</Label>
              <Select value={editForm.categoria} onValueChange={v => setEditForm(f => ({ ...f, categoria: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {categorias.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
            <Button variant="destructive" onClick={() => anularSol && anularCompra.mutate({ id: anularSol.id, motivo: anularMotivo, respondidoPor: anularSol.respondidoPor })} disabled={!anularMotivo.trim() || anularCompra.isPending}>{anularCompra.isPending ? "Enviando..." : "Solicitar anulacion"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* DIALOG EDITAR OBSERVACIONES (vendedor) */}
      <Dialog open={obsOpen} onOpenChange={setObsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Observaciones - Solicitud #{obsSol?.id}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-medium">Cliente:</span> {obsSol?.cliente}</div>
              <div><span className="font-medium">Producto:</span> {obsSol?.sku ? `[${obsSol.sku}] ` : ""}{obsSol?.producto}</div>
            </div>
            <div>
              <Label>Observaciones</Label>
              <Textarea value={obsForm.observaciones} onChange={e => setObsForm(f => ({ ...f, observaciones: e.target.value }))} placeholder="Notas para compras..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setObsOpen(false)}>Cancelar</Button>
            <Button onClick={() => editarObsVendedor.mutate(obsForm)} disabled={editarObsVendedor.isPending}>{editarObsVendedor.isPending ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* DIALOGO ELIMINAR EN MASA (admin) */}
      <Dialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Eliminar {seleccionados.size} solicitudes</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Esta acción es <strong>irreversible</strong>. Ingresa tu contraseña para confirmar.</p>
          <div><Label>Tu contraseña</Label><Input type="password" placeholder="********" value={batchDeletePassword} onChange={e => setBatchDeletePassword(e.target.value)} autoFocus /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => batchEliminar.mutate({ ids: Array.from(seleccionados), password: batchDeletePassword })} disabled={!batchDeletePassword || batchEliminar.isPending}>{batchEliminar.isPending ? "Eliminando..." : "Eliminar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
