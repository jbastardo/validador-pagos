import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Trash2, RefreshCw, FileSpreadsheet, CheckCircle2, AlertCircle, Info, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { BANCOS_RECEPTOR_META as BANCOS } from "@shared/schema";

interface Movimiento {
  id: string; banco: string; fecha: string; monto: string;
  referencia: string; celular: string; descripcion: string;
  subidoPor: string; subidoEn: string; usado: string;
}

interface ExtractoStats {
  byBanco: Record<string, { total: number; usados: number; disponibles: number; ultimaSubida: string }>;
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function fmtMonto(m: string) {
  const n = parseFloat(m);
  if (isNaN(n)) return m;
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Tarjeta por banco ──────────────────────────────────────────────────────────
function BancoCard({ banco, stats, user }: {
  banco: typeof BANCOS[0];
  stats: ExtractoStats["byBanco"][string] | undefined;
  user: any;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showMovs, setShowMovs] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Lista de movimientos (solo cuando el panel está abierto)
  const { data: movs = [], isFetching } = useQuery<Movimiento[]>({
    queryKey: ["extracto", banco.codigo],
    queryFn: () => apiRequest("GET", `/api/extractos/${banco.codigo}`).then(r => r.json()),
    enabled: showMovs,
    staleTime: 30000,
  });

  const colorMap: Record<string, string> = {
    blue:    "bg-blue-50 border-blue-200 text-blue-700",
    violet:  "bg-violet-50 border-violet-200 text-violet-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
  };
  const badgeColor = colorMap[banco.color] ?? "bg-gray-50 border-gray-200 text-gray-700";

  // Upload
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast({ title: "Formato incorrecto", description: "Solo se aceptan archivos Excel (.xlsx, .xls)", variant: "destructive" });
      return;
    }
    setUploading(true);
    setWarnings([]);
    try {
      const form = new FormData();
      form.append("archivo", file);
      form.append("subidoPor", user?.email ?? "desconocido");
      const res = await apiRequest("POST", `/api/extractos/${banco.codigo}`, form, true);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Error al subir");
      if (data.warnings?.length) setWarnings(data.warnings);
      toast({ title: "Extracto importado", description: `${data.total} movimientos cargados${data.skipped ? `, ${data.skipped} omitidos` : ""}` });
      qc.invalidateQueries({ queryKey: ["extracto-stats"] });
      qc.invalidateQueries({ queryKey: ["extracto", banco.codigo] });
    } catch (err: any) {
      toast({ title: "Error al importar", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Delete banco
  const deleteMut = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/extractos/${banco.codigo}`).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: "Extracto limpiado", description: `${data.count} movimientos eliminados` });
      qc.invalidateQueries({ queryKey: ["extracto-stats"] });
      qc.invalidateQueries({ queryKey: ["extracto", banco.codigo] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const disponibles = stats?.disponibles ?? 0;
  const total       = stats?.total ?? 0;
  const usados      = stats?.usados ?? 0;

  return (
    <Card className="border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${badgeColor}`}>
              <FileSpreadsheet className="w-3 h-3" />
              {banco.nombre}
            </div>
            {total > 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                  <CheckCircle2 className="w-3 h-3" />{disponibles} disponibles
                </span>
                {usados > 0 && <span className="text-muted-foreground">{usados} usados</span>}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Sin movimientos cargados</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              {uploading ? "Subiendo..." : "Subir extracto"}
            </Button>
            {total > 0 && (
              <>
                <Button size="sm" variant="ghost" className="gap-1.5 h-8 text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => { if (confirm(`¿Limpiar todos los movimientos de ${banco.nombre}?`)) deleteMut.mutate(); }}
                  disabled={deleteMut.isPending}>
                  <Trash2 className="w-3 h-3" /> Limpiar
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowMovs(v => !v)}>
                  {showMovs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </>
            )}
          </div>
        </div>
        {stats?.ultimaSubida && (
          <p className="text-[11px] text-muted-foreground mt-1">Última carga: {fmtDate(stats.ultimaSubida)}</p>
        )}
        {warnings.length > 0 && (
          <div className="flex items-start gap-2 mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
            <ul className="text-xs text-amber-700 space-y-0.5">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
      </CardHeader>

      {showMovs && (
        <CardContent className="pt-0">
          {isFetching ? (
            <div className="flex justify-center py-6"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : movs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No hay movimientos cargados.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Fecha</th>
                    <th className="px-3 py-2 text-left font-medium">Monto (Bs.)</th>
                    <th className="px-3 py-2 text-left font-medium">Referencia</th>
                    <th className="px-3 py-2 text-left font-medium">Celular</th>
                    <th className="px-3 py-2 text-left font-medium">Descripción</th>
                    <th className="px-3 py-2 text-left font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {movs.map(m => (
                    <tr key={m.id} className={`hover:bg-muted/30 transition-colors ${m.usado === "true" ? "opacity-50" : ""}`}>
                      <td className="px-3 py-2 tabular-nums">{m.fecha}</td>
                      <td className="px-3 py-2 tabular-nums font-medium">{fmtMonto(m.monto)}</td>
                      <td className="px-3 py-2 tabular-nums">{m.referencia || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{m.celular || "—"}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate text-muted-foreground">{m.descripcion || "—"}</td>
                      <td className="px-3 py-2">
                        {m.usado === "true"
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold"><CheckCircle2 className="w-3 h-3"/>Conciliado</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">Disponible</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────────
export default function Extractos() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: stats, isLoading } = useQuery<ExtractoStats>({
    queryKey: ["extracto-stats"],
    queryFn: () => apiRequest("GET", "/api/extractos-stats").then(r => r.json()),
    staleTime: 30000,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["extracto-stats"] });
    BANCOS.forEach(b => qc.invalidateQueries({ queryKey: ["extracto", b.codigo] }));
    setRefreshing(false);
  };

  const totalMovs = Object.values(stats?.byBanco ?? {}).reduce((s, b) => s + b.total, 0);
  const totalDisp = Object.values(stats?.byBanco ?? {}).reduce((s, b) => s + b.disponibles, 0);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Extractos Bancarios</h1>
          <p className="text-sm text-muted-foreground">
            Sube los extractos Excel de los bancos receptores para habilitar la conciliación automática de pagos.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2 h-9 shrink-0">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Resumen global */}
      {!isLoading && totalMovs > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl border bg-card">
            <p className="text-xs text-muted-foreground mb-1">Movimientos cargados</p>
            <p className="text-2xl font-bold tabular-nums">{totalMovs.toLocaleString()}</p>
          </div>
          <div className="p-4 rounded-xl border bg-card">
            <p className="text-xs text-muted-foreground mb-1">Disponibles para conciliar</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-600">{totalDisp.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Cómo funciona */}
      <div className="flex gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-xs text-blue-800 space-y-1.5">
          <p className="font-semibold">¿Cómo funciona la conciliación automática?</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-700">
            <li>Sube el extracto Excel del banco (el archivo que descargas de la banca en línea).</li>
            <li>El sistema detecta automáticamente las columnas de fecha, monto, referencia y celular.</li>
            <li>Al registrar un nuevo pago, se busca un movimiento del extracto con <strong>fecha ±1 día</strong>, <strong>monto exacto</strong> y <strong>referencia o celular</strong> coincidente.</li>
            <li>Si hay match, el pago queda automáticamente como <strong>Verificado</strong> sin intervención manual.</li>
          </ol>
          <p className="text-blue-600 pt-1">Los movimientos ya usados quedan marcados para no conciliar dos pagos con el mismo movimiento.</p>
        </div>
      </div>

      {/* Tarjetas por banco */}
      {isLoading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-4">
          {BANCOS.map(b => (
            <BancoCard key={b.codigo} banco={b} stats={stats?.byBanco[b.codigo]} user={user} />
          ))}
        </div>
      )}
    </div>
  );
}
