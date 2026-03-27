import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Solicitud {
  id: string; vendedor: string; cliente: string; celular: string; sku: string;
  producto: string; cantidad: string;
  fechaTope: string; observaciones: string; estado: string; creadoEn: string;
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

  // --- Autocomplete cliente Odoo ---
  const [clienteQuery, setClienteQuery] = useState("");
  const [showClienteDD, setShowClienteDD] = useState(false);
  const debouncedCliente = useDebounce(clienteQuery, 350);
  const clienteRef = useRef<HTMLDivElement>(null);
  const { data: clientesOdoo = [] } = useQuery<OdooCliente[]>({
    queryKey: ["odoo-clientes", debouncedCliente],
    queryFn: () => fetch(`/api/odoo/clientes?q=${encodeURIComponent(debouncedCliente)}`).then(r => r.json()),
    enabled: debouncedCliente.length >= 2,
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
    enabled: debouncedSku.length >= 2,
  });

  useEffect(() => {
    if (debouncedSku.length < 2) {
      if (productoLocked) { setForm(f => ({ ...f, producto: "" })); setProductoLocked(false); }
      return;
    }
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

  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: string }) =>
      fetch(`/api/solicitudes/${id}/estado`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["solicitudes"] }),
  });

  const prioridad = (s: Solicitud) => {
    if (!s.fechaTope) return "Sin fecha";
    const dias = Math.ceil((new Date(s.fechaTope).getTime() - Date.now()) / 86400000);
    if (dias < 0) return "Vencida"; if (dias <= 3) return "Urgente"; if (dias <= 7) return "Alta"; return "Normal";
  };
  const colorPrioridad = (p: string) => (p === "Vencida" || p === "Urgente") ? "destructive" : p === "Alta" ? "default" : "secondary";
  const colorEstado = (e: string) => e === "Pendiente" ? "default" : e === "En Proceso" ? "secondary" : e === "Completada" ? "outline" : "destructive";
  const isCompras = user?.rol === "admin" || user?.rol === "compras";

  const selectCliente = (c: OdooCliente) => {
    const display = c.vat ? `${c.name} (${c.vat})` : c.name;
    setForm(f => ({ ...f, cliente: display, celular: c.mobile || c.phone || "" }));
    setClienteQuery(display); setShowClienteDD(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Solicitudes de Producto</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><PlusCircle className="mr-2 h-4 w-4" /> Nueva Solicitud</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nueva Solicitud</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">

              {/* CLIENTE - Autocomplete Odoo */}
              <div className="relative" ref={clienteRef}>
                <Label>Cliente * <span className="text-xs text-muted-foreground">(nombre, RIF o celular)</span></Label>
                <Input
                  value={clienteQuery}
                  onChange={e => { setClienteQuery(e.target.value); setForm(f => ({ ...f, cliente: e.target.value })); setShowClienteDD(true); }}
                  onFocus={() => clienteQuery.length >= 2 && setShowClienteDD(true)}
                  placeholder="Buscar en Odoo..."
                />
                {showClienteDD && debouncedCliente.length >= 2 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-56 overflow-auto">
                    {clientesOdoo.length > 0 ? clientesOdoo.map(c => (
                      <div key={c.id} className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-0" onMouseDown={() => selectCliente(c)}>
                        <div className="font-medium text-sm">{c.name}</div>
                        <div className="text-xs text-muted-foreground space-x-2">
                          {c.vat && <span>RIF: {c.vat}</span>}
                          {c.mobile && <span>Cel: {c.mobile}</span>}
                          {c.phone && !c.mobile && <span>Tel: {c.phone}</span>}
                          {c.email && <span>{c.email}</span>}
                        </div>
                      </div>
                    )) : (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        No encontrado.
                        <button className="ml-2 text-blue-600 underline text-xs" onMouseDown={e => { e.preventDefault(); setShowClienteDD(false); setShowCrearCliente(true); setNuevoCliente(n => ({ ...n, name: clienteQuery })); }}>
                          Crear nuevo cliente en Odoo
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* CREAR CLIENTE - panel inline */}
              {showCrearCliente && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 grid gap-3">
                  <p className="text-sm font-medium text-blue-800">Nuevo cliente en Odoo</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Nombre *</Label><Input value={nuevoCliente.name} onChange={e => setNuevoCliente(n => ({ ...n, name: e.target.value }))} placeholder="Nombre completo" /></div>
                    <div><Label className="text-xs">RIF / CI</Label><Input value={nuevoCliente.vat} onChange={e => setNuevoCliente(n => ({ ...n, vat: e.target.value }))} placeholder="J-123456789" /></div>
                    <div><Label className="text-xs">Celular</Label><Input value={nuevoCliente.mobile} onChange={e => setNuevoCliente(n => ({ ...n, mobile: e.target.value }))} placeholder="04XX-XXXXXXX" /></div>
                    <div><Label className="text-xs">Teléfono</Label><Input value={nuevoCliente.phone} onChange={e => setNuevoCliente(n => ({ ...n, phone: e.target.value }))} placeholder="0212-XXXXXXX" /></div>
                    <div className="col-span-2"><Label className="text-xs">Correo</Label><Input value={nuevoCliente.email} onChange={e => setNuevoCliente(n => ({ ...n, email: e.target.value }))} placeholder="correo@empresa.com" /></div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => crearClienteOdoo.mutate(nuevoCliente)} disabled={!nuevoCliente.name.trim() || crearClienteOdoo.isPending}>
                      {crearClienteOdoo.isPending ? "Guardando..." : "Crear en Odoo"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowCrearCliente(false)}>Cancelar</Button>
                  </div>
                </div>
              )}

              {/* CELULAR */}
              <div>
                <Label>Celular</Label>
                <Input value={form.celular} onChange={e => setForm(f => ({ ...f, celular: e.target.value }))} placeholder="04XX-XXXXXXX" />
              </div>

              {/* SKU + PRODUCTO */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>SKU</Label>
                  <Input value={form.sku} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, sku: v, producto: v ? f.producto : "" })); if (!e.target.value) setProductoLocked(false); }} placeholder="Ej: PROD-001" />
                </div>
                <div>
                  <Label>Producto * {productoLocked && <span className="text-xs text-green-600 font-normal">✓ Odoo</span>}</Label>
                  <Input value={form.producto} onChange={e => setForm(f => ({ ...f, producto: e.target.value }))} disabled={productoLocked} placeholder="Nombre del producto" className={productoLocked ? "bg-muted" : ""} />
                </div>
              </div>

              {/* CANTIDAD */}
              <div><Label>Cantidad *</Label><Input type="number" value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} /></div>

              {/* FECHA TOPE */}
              <div><Label>Fecha tope</Label><Input type="date" value={form.fechaTope} onChange={e => setForm(f => ({ ...f, fechaTope: e.target.value }))} /></div>

              {/* OBSERVACIONES */}
              <div><Label>Observaciones</Label><Textarea value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} /></div>

              <Button
                onClick={() => crear.mutate({ ...form, vendedor: user?.email || "" })}
                disabled={!form.cliente || !form.producto || !form.cantidad || crear.isPending}
              >
                {crear.isPending ? "Guardando..." : "Crear Solicitud"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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
              {isCompras && <th className="p-3 text-left">Acciones</th>}
            </tr></thead>
            <tbody>
              {solicitudes.map(s => (
                <tr key={s.id} className="border-b">
                  <td className="p-3">{s.id}</td>
                  <td className="p-3">{s.cliente}</td>
                  <td className="p-3">{s.celular || "—"}</td>
                  <td className="p-3">{s.sku ? `[${s.sku}] ` : ""}{s.producto}</td>
                  <td className="p-3">{s.cantidad}</td>
                  <td className="p-3">{s.fechaTope || "—"}</td>
                  <td className="p-3"><Badge variant={colorPrioridad(prioridad(s)) as any}>{prioridad(s)}</Badge></td>
                  <td className="p-3"><Badge variant={colorEstado(s.estado) as any}>{s.estado}</Badge></td>
                  <td className="p-3">{s.vendedor}</td>
                  {isCompras && <td className="p-3 space-x-1">
                    {s.estado === "Pendiente" && <Button size="sm" variant="outline" onClick={() => cambiarEstado.mutate({ id: s.id, estado: "En Proceso" })}>En Proceso</Button>}
                    {(s.estado === "Pendiente" || s.estado === "En Proceso") && <Button size="sm" onClick={() => cambiarEstado.mutate({ id: s.id, estado: "Completada" })}>Completar</Button>}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
