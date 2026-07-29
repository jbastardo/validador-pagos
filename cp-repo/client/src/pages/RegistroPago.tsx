import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Extracto, Usuario, BuscarMatchResult } from "@shared/schema";
import { BANCOS, formatMonto, formatFecha, getBancoNombre } from "@shared/schema";
import { PlusCircle, Search, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Props { user: Usuario; }

const EMPTY_FORM = {
  fecha: new Date().toISOString().split("T")[0],
  banco: "",
  referencia: "",
  monto: "",
  cliente: "",
  rif: "",
  factura: "",
  observaciones: "",
};

export default function RegistroPago({ user }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [matchResult, setMatchResult] = useState<BuscarMatchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedExtracto, setSelectedExtracto] = useState<Extracto | null>(null);

  function setField(k: keyof typeof EMPTY_FORM, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
    // Limpiar match al cambiar campos clave
    if (["banco", "referencia", "monto"].includes(k)) {
      setMatchResult(null);
      setSelectedExtracto(null);
    }
  }

  async function buscarMatch() {
    if (!form.banco || !form.referencia) {
      toast({ title: "Completa banco y referencia", variant: "destructive" });
      return;
    }
    setSearching(true);
    try {
      const res = await fetch("/api/pagos/buscar-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          banco: form.banco,
          referencia: form.referencia,
          monto: form.monto,
          fecha: form.fecha,
        }),
      });
      const data: BuscarMatchResult = await res.json();
      if (!res.ok) throw new Error((data as any).error);
      setMatchResult(data);

      if (data.exacto) {
        setSelectedExtracto(data.exacto);
        toast({ title: "Match exacto encontrado", description: `Referencia ${data.exacto.referencia}` });
      } else if (data.parciales.length > 0) {
        toast({ title: "Matches parciales encontrados", description: `${data.parciales.length} posibles coincidencias` });
      } else {
        toast({ title: "Sin coincidencia", description: "No se encontró en extractos", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }

  const registrarMut = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/pagos", {
        ...form,
        monto: parseFloat(form.monto) || 0,
        registradoPor: user.username,
      });
    },
    onSuccess: async (res) => {
      const data = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/pagos"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });

      // Si hay extracto seleccionado, conciliar automáticamente
      if (selectedExtracto && data.id) {
        try {
          await fetch(`/api/pagos/${data.id}/conciliar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              extractoId: selectedExtracto.id,
              estado: "Conciliado",
              observaciones: form.observaciones,
            }),
          });
          qc.invalidateQueries({ queryKey: ["/api/pagos"] });
          qc.invalidateQueries({ queryKey: ["/api/stats"] });
          toast({ title: "Pago registrado y conciliado", description: `Conciliado con extracto ${selectedExtracto.referencia}` });
        } catch {
          toast({ title: "Pago registrado", description: "No se pudo conciliar automáticamente" });
        }
      } else {
        toast({ title: "Pago registrado", description: "Estado: Pendiente de conciliación" });
      }

      setForm(EMPTY_FORM);
      setMatchResult(null);
      setSelectedExtracto(null);
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <PlusCircle className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Registrar Pago</h1>
          <p className="text-muted-foreground text-sm">Registra un pago de cliente y busca coincidencia en extractos</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Datos del pago</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Fecha */}
            <div className="space-y-1.5">
              <Label className="text-sm">Fecha del pago</Label>
              <Input
                type="date"
                value={form.fecha}
                onChange={(e) => setField("fecha", e.target.value)}
                className="h-9"
                data-testid="input-fecha-pago"
              />
            </div>

            {/* Banco */}
            <div className="space-y-1.5">
              <Label className="text-sm">Banco receptor</Label>
              <Select value={form.banco} onValueChange={(v) => setField("banco", v)}>
                <SelectTrigger data-testid="select-banco-pago" className="h-9">
                  <SelectValue placeholder="Seleccionar banco..." />
                </SelectTrigger>
                <SelectContent>
                  {BANCOS.map((b) => (
                    <SelectItem key={b.codigo} value={b.codigo}>{b.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Referencia */}
            <div className="space-y-1.5">
              <Label className="text-sm">Referencia bancaria</Label>
              <Input
                value={form.referencia}
                onChange={(e) => setField("referencia", e.target.value)}
                placeholder="N° de referencia"
                className="h-9 font-mono"
                data-testid="input-referencia"
              />
            </div>

            {/* Monto */}
            <div className="space-y-1.5">
              <Label className="text-sm">Monto (Bs)</Label>
              <Input
                value={form.monto}
                onChange={(e) => setField("monto", e.target.value)}
                placeholder="0.00"
                type="number"
                step="0.01"
                className="h-9"
                data-testid="input-monto"
              />
            </div>

            {/* Cliente */}
            <div className="space-y-1.5">
              <Label className="text-sm">Cliente</Label>
              <Input
                value={form.cliente}
                onChange={(e) => setField("cliente", e.target.value)}
                placeholder="Nombre del cliente"
                className="h-9"
                data-testid="input-cliente"
              />
            </div>

            {/* RIF */}
            <div className="space-y-1.5">
              <Label className="text-sm">RIF</Label>
              <Input
                value={form.rif}
                onChange={(e) => setField("rif", e.target.value)}
                placeholder="J-00000000-0"
                className="h-9"
                data-testid="input-rif"
              />
            </div>

            {/* Factura */}
            <div className="space-y-1.5">
              <Label className="text-sm">N° Factura</Label>
              <Input
                value={form.factura}
                onChange={(e) => setField("factura", e.target.value)}
                placeholder="Número de factura"
                className="h-9"
                data-testid="input-factura"
              />
            </div>

            {/* Observaciones */}
            <div className="space-y-1.5">
              <Label className="text-sm">Observaciones</Label>
              <Input
                value={form.observaciones}
                onChange={(e) => setField("observaciones", e.target.value)}
                placeholder="Opcional"
                className="h-9"
                data-testid="input-observaciones"
              />
            </div>
          </div>

          {/* Buscar match */}
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Buscar en extractos</p>
              <p className="text-xs text-muted-foreground">Compara la referencia y monto contra los ingresos bancarios cargados</p>
            </div>
            <Button
              variant="outline"
              onClick={buscarMatch}
              disabled={searching || !form.banco || !form.referencia}
              data-testid="button-buscar-match"
              className="gap-2"
            >
              <Search className="w-4 h-4" />
              {searching ? "Buscando..." : "Buscar match"}
            </Button>
          </div>

          {/* Resultado match */}
          {matchResult && (
            <MatchResult
              result={matchResult}
              selectedExtracto={selectedExtracto}
              onSelect={setSelectedExtracto}
            />
          )}

          <Separator />

          {/* Estado seleccionado */}
          {selectedExtracto && (
            <div className="rounded-lg bg-success/10 border border-success/30 p-3 flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              <div className="text-sm">
                <p className="text-success font-medium">Extracto seleccionado para conciliar</p>
                <p className="text-muted-foreground text-xs">
                  {formatFecha(selectedExtracto.fecha)} — Ref: {selectedExtracto.referencia} — Bs {formatMonto(selectedExtracto.monto)}
                </p>
              </div>
              <button
                className="ml-auto text-muted-foreground hover:text-foreground text-xs underline"
                onClick={() => setSelectedExtracto(null)}
              >
                Deseleccionar
              </button>
            </div>
          )}

          <Button
            onClick={() => registrarMut.mutate()}
            disabled={registrarMut.isPending || !form.fecha || !form.banco || !form.referencia || !form.monto}
            className="w-full"
            data-testid="button-registrar-pago"
          >
            {registrarMut.isPending
              ? "Registrando..."
              : selectedExtracto
              ? "Registrar y conciliar"
              : "Registrar pago (pendiente)"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function MatchResult({
  result,
  selectedExtracto,
  onSelect,
}: {
  result: BuscarMatchResult;
  selectedExtracto: Extracto | null;
  onSelect: (e: Extracto) => void;
}) {
  const all = [
    ...(result.exacto ? [{ ...result.exacto, _esExacto: true }] : []),
    ...result.parciales.map((e) => ({ ...e, _esExacto: false })),
  ];

  if (all.length === 0) {
    return (
      <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 flex items-center gap-2 text-sm">
        <XCircle className="w-4 h-4 text-destructive shrink-0" />
        <span className="text-destructive">No se encontró coincidencia en extractos cargados.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Selecciona el extracto correspondiente:</p>
      {all.map((e) => {
        const isSelected = selectedExtracto?.id === e.id;
        return (
          <button
            key={e.id}
            data-testid={`card-match-${e.id}`}
            onClick={() => onSelect(e)}
            className={`w-full text-left rounded-lg border p-3 text-sm transition-all ${
              isSelected
                ? "border-success bg-success/10"
                : "border-border hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {e._esExacto ? (
                  <Badge className="text-xs bg-success/15 text-success border border-success/30 px-1.5">Exacto</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs px-1.5">Parcial</Badge>
                )}
                <span className="font-mono text-xs">{e.referencia}</span>
              </div>
              <span className="font-medium text-success text-xs">Bs {formatMonto(e.monto)}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatFecha(e.fecha)} — {e.banco} — {e.descripcion}
            </p>
          </button>
        );
      })}
    </div>
  );
}
