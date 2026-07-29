import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHashLocation } from "wouter/use-hash-location";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Pago, Extracto, Usuario } from "@shared/schema";
import { BANCOS, formatMonto, formatFecha, getBancoNombre } from "@shared/schema";
import { GitMerge, Search, CheckCircle2, XCircle, Clock, Eye } from "lucide-react";

interface Props { user: Usuario; }

function getEstadoDesdeHash() {
  const hash = window.location.hash;
  const idx = hash.indexOf("?");
  if (idx === -1) return "";
  const params = new URLSearchParams(hash.substring(idx + 1));
  return params.get("estado") || "";
}

export default function Conciliacion({ user }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [location] = useHashLocation();

  const [filtroEstado, setFiltroEstado] = useState(getEstadoDesdeHash);
  const [filtroBanco, setFiltroBanco] = useState("all");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [selectedPago, setSelectedPago] = useState<Pago | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [matchExtractos, setMatchExtractos] = useState<Extracto[]>([]);
  const [selectedExtracto, setSelectedExtracto] = useState<Extracto | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState("Conciliado");
  const [obs, setObs] = useState("");
  const [loadingMatch, setLoadingMatch] = useState(false);

  const params = new URLSearchParams();
  if (filtroEstado && filtroEstado !== "all") params.append("estado", filtroEstado);
  if (filtroBanco && filtroBanco !== "all") params.append("banco", filtroBanco);
  if (fechaDesde) params.append("fechaDesde", fechaDesde);
  if (fechaHasta) params.append("fechaHasta", fechaHasta);

  const { data: pagos = [], isLoading } = useQuery<Pago[]>({
    queryKey: ["/api/pagos", filtroEstado, filtroBanco, fechaDesde, fechaHasta],
    queryFn: async () => {
      const res = await fetch(`/api/pagos?${params.toString()}`);
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const filtrados = pagos.filter((p) => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return (
      (p.referencia ?? "").includes(q) ||
      (p.cliente ?? "").toLowerCase().includes(q) ||
      (p.rif ?? "").toLowerCase().includes(q) ||
      (p.factura ?? "").toLowerCase().includes(q)
    );
  });

  async function abrirDetalle(pago: Pago) {
    setSelectedPago(pago);
    setSelectedExtracto(null);
    setObs(pago.observaciones);
    setNuevoEstado(pago.estado === "Pendiente" ? "Conciliado" : pago.estado);
    setDialogOpen(true);
    setMatchExtractos([]);

    // Buscar match automáticamente
    setLoadingMatch(true);
    try {
      const res = await fetch("/api/pagos/buscar-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banco: pago.banco, referencia: pago.referencia, monto: pago.monto, fecha: pago.fecha }),
      });
      const data = await res.json();
      const all = [
        ...(data.exacto ? [data.exacto] : []),
        ...(data.parciales || []),
      ];
      setMatchExtractos(all);
      if (data.exacto) setSelectedExtracto(data.exacto);
    } catch { /* silencioso */ }
    setLoadingMatch(false);
  }

  const conciliarMut = useMutation({
    mutationFn: async () => {
      if (!selectedPago) throw new Error("No pago");
      const res = await fetch(`/api/pagos/${selectedPago.id}/conciliar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extractoId: selectedExtracto?.id || "",
          estado: nuevoEstado,
          observaciones: obs,
        }),
      });
      if (!res.ok) throw new Error("Error al conciliar");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pagos"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Pago actualizado correctamente" });
      setDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center gap-3">
        <GitMerge className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Conciliación</h1>
          <p className="text-muted-foreground text-sm">Gestión y verificación de pagos contra extractos bancarios</p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Estado</Label>
              <Select value={filtroEstado || "all"} onValueChange={(v) => setFiltroEstado(v === "all" ? "" : v)}>
                <SelectTrigger className="h-8 w-44 text-sm" data-testid="select-filtro-estado">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="Pendiente">Pendiente</SelectItem>
                  <SelectItem value="Conciliado">Conciliado</SelectItem>
                  <SelectItem value="NoConciliado">No Conciliado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Banco</Label>
              <Select value={filtroBanco} onValueChange={setFiltroBanco}>
                <SelectTrigger className="h-8 w-44 text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {BANCOS.map((b) => <SelectItem key={b.codigo} value={b.codigo}>{b.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="h-8 w-36 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="h-8 w-36 text-sm" />
            </div>
            <div className="space-y-1 flex-1 min-w-[160px]">
              <Label className="text-xs text-muted-foreground">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Ref, cliente, RIF, factura..."
                  className="h-8 text-sm pl-7"
                  data-testid="input-busqueda"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">
            {filtrados.length} pago{filtrados.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : filtrados.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No hay pagos que mostrar</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Fecha</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Banco</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Referencia</th>
                    <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Monto</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Cliente</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Factura</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Estado</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((p) => (
                    <tr
                      key={p.id}
                      data-testid={`row-pago-${p.id}`}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-3 py-2.5 text-xs">{formatFecha(p.fecha)}</td>
                      <td className="px-3 py-2.5 text-xs font-mono">{p.banco}</td>
                      <td className="px-3 py-2.5 text-xs font-mono">{p.referencia}</td>
                      <td className="px-3 py-2.5 text-xs text-right font-medium">Bs {formatMonto(p.monto)}</td>
                      <td className="px-3 py-2.5 text-xs max-w-[120px] truncate">{p.cliente || <span className="text-muted-foreground italic">—</span>}</td>
                      <td className="px-3 py-2.5 text-xs">{p.factura || <span className="text-muted-foreground italic">—</span>}</td>
                      <td className="px-3 py-2.5">
                        <EstadoBadge estado={p.estado} />
                      </td>
                      <td className="px-3 py-2.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => abrirDetalle(p)}
                          data-testid={`button-detalle-${p.id}`}
                        >
                          <Eye className="w-3 h-3" />
                          Detalle
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal conciliar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Detalle del pago — {selectedPago?.referencia}</DialogTitle>
          </DialogHeader>

          {selectedPago && (
            <div className="space-y-4">
              {/* Info pago */}
              <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-3">
                <Field label="Fecha" value={formatFecha(selectedPago.fecha)} />
                <Field label="Banco" value={selectedPago.banco} />
                <Field label="Referencia" value={selectedPago.referencia} mono />
                <Field label="Monto" value={`Bs ${formatMonto(selectedPago.monto)}`} />
                <Field label="Cliente" value={selectedPago.cliente || "—"} />
                <Field label="RIF" value={selectedPago.rif || "—"} />
                <Field label="Factura" value={selectedPago.factura || "—"} />
                <Field label="Registrado por" value={selectedPago.registradoPor} />
              </div>

              {/* Matches */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Coincidencias en extractos:</p>
                {loadingMatch ? (
                  <Skeleton className="h-16" />
                ) : matchExtractos.length === 0 ? (
                  <p className="text-xs text-destructive bg-destructive/10 rounded p-2">Sin coincidencias en extractos cargados</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {matchExtractos.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => setSelectedExtracto(selectedExtracto?.id === e.id ? null : e)}
                        className={`w-full text-left rounded border p-2 text-xs transition-colors ${
                          selectedExtracto?.id === e.id
                            ? "border-success bg-success/10"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <div className="flex justify-between">
                          <span className="font-mono">{e.referencia}</span>
                          <span className="text-success font-medium">Bs {formatMonto(e.monto)}</span>
                        </div>
                        <p className="text-muted-foreground">{formatFecha(e.fecha)} — {e.descripcion}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Nuevo estado */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Estado</Label>
                  <Select value={nuevoEstado} onValueChange={setNuevoEstado}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pendiente">Pendiente</SelectItem>
                      <SelectItem value="Conciliado">Conciliado</SelectItem>
                      <SelectItem value="NoConciliado">No Conciliado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Observaciones</Label>
                  <Input
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    className="h-8 text-sm"
                    placeholder="Opcional"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              size="sm"
              onClick={() => conciliarMut.mutate()}
              disabled={conciliarMut.isPending}
              data-testid="button-confirmar-conciliar"
            >
              {conciliarMut.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === "Conciliado") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30">
        <CheckCircle2 className="w-3 h-3" /> Conciliado
      </span>
    );
  }
  if (estado === "NoConciliado") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30">
        <XCircle className="w-3 h-3" /> No Conciliado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/30">
      <Clock className="w-3 h-3" /> Pendiente
    </span>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xs font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
