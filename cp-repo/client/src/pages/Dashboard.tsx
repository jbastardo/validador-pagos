import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHashLocation } from "wouter/use-hash-location";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import { extractBancoCode, getBancoNombre } from "@shared/schema";
import type { Usuario, Stats } from "@shared/schema";
import {
  CheckCircle2,
  Clock,
  XCircle,
  FileSpreadsheet,
  AlertTriangle,
  LayoutDashboard,
  Trash2,
  Building2,
} from "lucide-react";

interface Props { user: Usuario; }

interface ExtractosStats {
  total: number;
  porBanco: { banco: string; count: number }[];
}

export default function Dashboard({ user }: Props) {
  const [, navigate] = useHashLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [confirmarLimpiar, setConfirmarLimpiar] = useState(false);
    const [confirmarDeduplicar, setConfirmarDeduplicar] = useState(false);

  const params = new URLSearchParams();
  if (fechaDesde) params.append("fechaDesde", fechaDesde);
  if (fechaHasta) params.append("fechaHasta", fechaHasta);

  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["/api/stats", fechaDesde, fechaHasta],
    queryFn: async () => {
      const res = await fetch(`/api/stats?${params.toString()}`);
      if (!res.ok) throw new Error("Error cargando estadísticas");
      return res.json();
    },
  });

  // Cargar extractos para mostrar cuántos hay cargados por banco
  const { data: extractosList, isLoading: loadingExtractos } = useQuery<any[]>({
    queryKey: ["/api/extractos"],
    queryFn: async () => {
      const res = await fetch("/api/extractos");
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const extractosStats: ExtractosStats = {
    total: extractosList?.length ?? 0,
    porBanco: (() => {
      if (!extractosList) return [];
      const mapa: Record<string, number> = {};
      for (const e of extractosList) {
        const b = extractBancoCode(e.banco);
        mapa[b] = (mapa[b] ?? 0) + 1;
      }
      return Object.entries(mapa)
        .map(([b, count]) => ({ banco: getBancoNombre(b), count }))
        .sort((a, b) => b.count - a.count);
    })(),
  };

  // Mutación limpiar extractos
  const limpiarMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/extractos/limpiar", {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Extractos eliminados",
        description: `Se borraron ${data.borrados} registros del extracto bancario.`,
      });
      qc.invalidateQueries({ queryKey: ["/api/extractos"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      setConfirmarLimpiar(false);
    },
    onError: (e: any) => {
      toast({ title: "Error al limpiar", description: e.message, variant: "destructive" });
      setConfirmarLimpiar(false);
    },
  });

  function irA(estado: string) {
    navigate(`/conciliacion?estado=${estado}`);
  }
  
  // Mutación deduplicar extractos
  const deduplicarMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/extractos/deduplicar", {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Deduplicación completada",
        description: `Se eliminaron ${data.duplicados} registros duplicados. Quedan ${data.registrosFinales} registros únicos.`,
      });
      qc.invalidateQueries({ queryKey: ["/api/extractos"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      setConfirmarDeduplicar(false);
    },
    onError: (e: any) => {
      toast({ title: "Error al deduplicar", description: e.message, variant: "destructive" });
      setConfirmarDeduplicar(false);
    },
  });

  const isAdmin = user?.rol === "admin";

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <LayoutDashboard className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Resumen de conciliación bancaria</p>
        </div>
      </div>

      {/* Filtro fechas */}
      <Card className="border-border">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="h-8 text-sm w-40"
                data-testid="input-fecha-desde"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="h-8 text-sm w-40"
                data-testid="input-fecha-hasta"
              />
            </div>
            {(fechaDesde || fechaHasta) && (
              <button
                onClick={() => { setFechaDesde(""); setFechaHasta(""); }}
                className="text-xs text-muted-foreground hover:text-foreground underline pb-1"
              >
                Limpiar fechas
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="Pendientes"
            value={stats?.pendientes ?? 0}
            colorClass="text-warning"
            bgClass="bg-warning/10"
            clickable
            onClick={() => irA("Pendiente")}
            data-testid="card-pendientes"
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5" />}
            label="Conciliados"
            value={stats?.conciliados ?? 0}
            colorClass="text-success"
            bgClass="bg-success/10"
            clickable
            onClick={() => irA("Conciliado")}
            data-testid="card-conciliados"
          />
          <StatCard
            icon={<XCircle className="w-5 h-5" />}
            label="No Conciliados"
            value={stats?.noConciliados ?? 0}
            colorClass="text-destructive"
            bgClass="bg-destructive/10"
            clickable
            onClick={() => irA("NoConciliado")}
            data-testid="card-no-conciliados"
          />
          <StatCard
            icon={<FileSpreadsheet className="w-5 h-5" />}
            label="Total Pagos"
            value={stats?.totalPagos ?? 0}
            colorClass="text-primary"
            bgClass="bg-primary/10"
            clickable
            onClick={() => irA("")}
            data-testid="card-total-pagos"
          />
          <StatCard
            icon={<FileSpreadsheet className="w-5 h-5" />}
            label="Ingresos en Extractos"
            value={stats?.totalExtractos ?? 0}
            colorClass="text-secondary"
            bgClass="bg-secondary/10"
            data-testid="card-extractos"
          />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5" />}
            label="Extractos sin Match"
            value={stats?.extractosSinMatch ?? 0}
            colorClass="text-warning"
            bgClass="bg-warning/10"
            subtitle="Ingresos no conciliados"
            data-testid="card-sin-match"
          />
        </div>
      )}

      {/* ── Extractos cargados + botón limpiar ── */}
      <Card className="border-border">
        <CardHeader className="pb-3 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Extractos bancarios cargados</CardTitle>
            </div>
            {extractosStats.total > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive h-8 text-xs"
                onClick={() => setConfirmarLimpiar(true)}
                disabled={limpiarMutation.isPending}
                data-testid="button-limpiar-extractos"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpiar todos los extractos
              </Button>
            )}
            {extractosStats.total > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-amber-600 border-amber-400/40 hover:bg-amber-100/10 hover:text-amber-700 h-8 text-xs"
                onClick={() => setConfirmarDeduplicar(true)}
                disabled={deduplicarMutation.isPending}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Deduplicar extractos
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {loadingExtractos ? (
            <div className="flex gap-2">
              <Skeleton className="h-7 w-32 rounded-full" />
              <Skeleton className="h-7 w-28 rounded-full" />
            </div>
          ) : extractosStats.total === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay extractos cargados. Ve a{" "}
              <button
                className="text-primary underline"
                onClick={() => navigate("/extractos")}
              >
                Extractos
              </button>{" "}
              para subir los archivos bancarios.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {extractosStats.porBanco.map((b) => (
                  <div
                    key={b.banco}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-sm"
                  >
                    <span className="font-medium text-foreground">{b.banco}</span>
                    <Badge variant="secondary" className="text-xs px-1.5 h-5">
                      {b.count} ops
                    </Badge>
                  </div>
                ))}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/5 text-sm">
                  <span className="font-semibold text-primary">Total</span>
                  <Badge className="text-xs px-1.5 h-5 bg-primary text-primary-foreground">
                    {extractosStats.total} ops
                  </Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Al subir un extracto, los registros ya existentes se omiten automáticamente (deduplicación por banco + referencia + monto + fecha).
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bienvenida */}
      <Card className="border-border bg-accent/30">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm text-muted-foreground">
            Bienvenido, <span className="font-semibold text-foreground">{user.nombre || user.username}</span>.
            Haz clic en cualquier tarjeta para filtrar las operaciones correspondientes.
          </p>
        </CardContent>
      </Card>

      {/* Dialog de confirmación limpiar */}
      <AlertDialog open={confirmarLimpiar} onOpenChange={setConfirmarLimpiar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Limpiar todos los extractos?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará los <strong>{extractosStats.total} registros</strong> de extractos
              bancarios cargados actualmente ({extractosStats.porBanco.map(b => `${b.banco}: ${b.count}`).join(", ")}).
              <br /><br />
              Los pagos conciliados <strong>no</strong> se verán afectados. Después podrás volver a subir los extractos correctos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => limpiarMutation.mutate()}
              data-testid="button-confirmar-limpiar"
            >
              {limpiarMutation.isPending ? "Eliminando..." : "Sí, limpiar todo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        
      {/* Dialog de confirmación deduplicar */}
      <AlertDialog open={confirmarDeduplicar} onOpenChange={setConfirmarDeduplicar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Deduplicar extractos bancarios?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción analizará los <strong>{extractosStats.total} registros</strong> de extractos
              y eliminará los duplicados (misma combinación de banco + referencia + monto + fecha).
              <br /><br />
              Los registros únicos se conservarán. Las conciliaciones existentes <strong>no</strong> se verán afectadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => deduplicarMutation.mutate()}
            >
              {deduplicarMutation.isPending ? "Deduplicando..." : "Sí, deduplicar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  colorClass,
  bgClass,
  clickable,
  onClick,
  subtitle,
  "data-testid": testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  colorClass: string;
  bgClass: string;
  clickable?: boolean;
  onClick?: () => void;
  subtitle?: string;
  "data-testid"?: string;
}) {
  return (
    <Card
      className={`border-border transition-all ${clickable ? "cursor-pointer hover:shadow-md hover:scale-[1.01]" : ""}`}
      onClick={clickable ? onClick : undefined}
      data-testid={testId}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <div className={`p-2 rounded-lg ${bgClass}`}>
            <span className={colorClass}>{icon}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
