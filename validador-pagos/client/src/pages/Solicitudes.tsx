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
  id: string; vendedor: string; cliente: string; sku: string;
  producto: string; cantidad: string; fechaSolicitud: string;
  fechaEstimada: string; observaciones: string; estado: string; creadoEn: string;
}

interface OdooCliente { id: number; name: string; vat: string; phone: string; email: string; }

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
  const [form, setForm] = useState({ cliente: "", sku: "", producto: "", cantidad: "", fechaSolicitud: "", fechaEstimada: "", observaciones: "" });

  // Autocomplete cliente Odoo
  const [clienteQuery, setClienteQuery] = useState("");
  const [showClienteDD, setShowClienteDD] = useState(false);
  const debouncedCliente = useDebounce(clienteQuery, 350);
  const clienteRef = useRef<HTMLDivElement>(null);

  const { data: clientesOdoo = [] } = useQuery<OdooCliente[]>({
    queryKey: ["odoo-clientes", debouncedCliente],
    queryFn: () => fetch(`/api/odoo/clientes?q=${encodeURIComponent(debouncedCliente)}`).then(r => r.json()),
    enabled: debouncedCliente.length >= 2,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node))
        setShowClienteDD(false);
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
      setForm({ cliente: "", sku: "", producto: "", cantidad: "", fechaSolicitud: "", fechaEstimada: "", observaciones: "" });
      setClienteQuery("");
      toast({ title: "Solicitud creada" });
    },
  });

  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: string }) =>
      fetch(`/api/solicitudes/${id}/estado`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["solicitudes"] }),
  });

  const prioridad = (s: Solicitud) => {
    if (!s.fechaEstimada) return "Sin fecha";
    const dias = Math.ceil((new Date(s.fechaEstimada).getTime() - Date.now()) / 86400000);
    if (dias < 0) return "Vencida";
    if (dias <= 3) return "Urgente";
    if (dias <= 7) return "Alta";
    return "Normal";
  };

  const colorPrioridad = (p: string) => (p === "Vencida" || p === "Urgente") ? "destructive" : p === "Alta" ? "default" : "secondary";
  const colorEstado = (e: string) => e === "Pendiente" ? "default" : e === "En Proceso" ? "secondary" : e === "Completada" ? "outline" : "destructive";
  const isCompras = user?.rol === "admin" || user?.rol === "compras";

  const selectCliente = (c: OdooCliente) => {
    const display = c.vat ? `${c.name} (${c.vat})` : c.name;
    setForm({ ...form, cliente: display });
    setClienteQuery(display);
    setShowClienteDD(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Solicitudes de Producto</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><PlusCircle className="mr-2 h-4 w-4" /> Nueva Solicitud</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nueva Solicitud</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">

              {/* CLIENTE - Autocomplete Odoo */}
              <div className="relative" ref={clienteRef}>
                <Label>Cliente * <span className="text-xs text-muted-foreground">(busca por nombre, RIF o teléfono)</span></Label>
                <Input
                  value={clienteQuery}
                  onChange={e => {
                    setClienteQuery(e.target.value);
                    setForm({ ...form, cliente: e.target.value });
                    setShowClienteDD(true);
                  }}
                  onFocus={() => clienteQuery.length >= 2 && setShowClienteDD(true)}
                  placeholder="Escribe para buscar en Odoo..."
                />
                {showClienteDD && debouncedCliente.length >= 2 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-56 overflow-auto">
                    {clientesOdoo.length > 0 ? clientesOdoo.map(c => (
                      <div key={c.id} className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-0" onMouseDown={() => selectCliente(c)}>
                        <div className="font-medium text-sm">{c.name}</div>
                        <div className="text-xs text-muted-foreground space-x-3">
                          {c.vat && <span>RIF: {c.vat}</span>}
                          {c.phone && <span>{c.phone}</span>}
                          {c.email && <span>{c.email}</span>}
                        </div>
                      </div>
                    )) : (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No encontrado en Odoo. Puedes escribir el nombre manualmente.</div>
                    )}
                  </div>
                )}
              </div>

              {/* SKU + PRODUCTO */}
              <div className="grid grid-cols-2 gap-4">
                <div><Label>SKU</Label><Input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></div>
                <div><Label>Producto *</Label><Input value={form.producto} onChange={e => setForm({ ...form, producto: e.target.value })} /></div>
              </div>

              <div><Label>Cantidad *</Label><Input type="number" value={form.cantidad} onChange={e => setForm({ ...form, cantidad: e.target.value })} /></div>

              <div className="grid grid-cols-2 gap-4">
                <div><Label>Fecha solicitud *</Label><Input type="date" value={form.fechaSolicitud} onChange={e => setForm({ ...form, fechaSolicitud: e.target.value })} /></div>
                <div><Label>Fecha estimada</Label><Input type="date" value={form.fechaEstimada} onChange={e => setForm({ ...form, fechaEstimada: e.target.value })} /></div>
              </div>

              <div><Label>Observaciones</Label><Textarea value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} /></div>

              <Button
                onClick={() => crear.mutate({ ...form, vendedor: user?.email || "" })}
                disabled={!form.cliente || !form.producto || !form.cantidad || !form.fechaSolicitud || crear.isPending}
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
              <th className="p-3 text-left">Producto</th>
              <th className="p-3 text-left">Cant.</th>
              <th className="p-3 text-left">Fecha Est.</th>
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
                  <td className="p-3">{s.sku ? `[${s.sku}] ` : ""}{s.producto}</td>
                  <td className="p-3">{s.cantidad}</td>
                  <td className="p-3">{s.fechaEstimada || "—"}</td>
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
