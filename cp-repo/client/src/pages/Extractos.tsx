import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import type { Extracto, Usuario } from "@shared/schema";
import { BANCOS, formatMonto, formatFecha, extractBancoCode } from "@shared/schema";
import { FileSpreadsheet, Upload, Filter } from "lucide-react";

interface Props { user: Usuario; }

export default function Extractos({ user }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [bancoCarga, setBancoCarga] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

  const [filtroB, setFiltroB] = useState("all");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const { data: allExtractos = [], isLoading } = useQuery<Extracto[]>({
    queryKey: ["/api/extractos"],
    queryFn: async () => {
      const res = await fetch("/api/extractos");
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const extractos = useMemo(() => {
    let filtered = allExtractos;
    if (filtroB && filtroB !== "all") {
      filtered = filtered.filter(e => extractBancoCode(e.banco) === extractBancoCode(filtroB));
    }
    if (fechaDesde) {
      filtered = filtered.filter(e => e.fecha >= fechaDesde);
    }
    if (fechaHasta) {
      filtered = filtered.filter(e => e.fecha <= fechaHasta);
    }
    return filtered;
  }, [allExtractos, filtroB, fechaDesde, fechaHasta]);

  async function handleUpload() {
    if (!fileRef.current?.files?.[0]) {
      toast({ title: "Selecciona un archivo", variant: "destructive" });
      return;
    }
    if (!bancoCarga) {
      toast({ title: "Selecciona el banco", variant: "destructive" });
      return;
    }
    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append("file", fileRef.current.files[0]);
      fd.append("banco", bancoCarga);
      fd.append("cargadoPor", user.nombre || user.username || "");

      const res = await fetch("/api/extractos/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setUploadResult(data);
      qc.invalidateQueries({ queryKey: ["/api/extractos"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      if (fileRef.current) fileRef.current.value = "";
      toast({ title: "Extracto cargado", description: `${data.guardados} ingresos guardados.` });
    } catch (e: any) {
      toast({ title: "Error al cargar", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Extractos Bancarios</h1>
          <p className="text-muted-foreground text-sm">Carga y consulta de extractos — solo ingresos</p>
        </div>
      </div>

      {/* Upload card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Cargar Extracto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Banco</Label>
              <Select value={bancoCarga} onValueChange={setBancoCarga}>
                <SelectTrigger data-testid="select-banco-carga" className="h-9">
                  <SelectValue placeholder="Seleccionar banco..." />
                </SelectTrigger>
                <SelectContent>
                  {BANCOS.map((b) => (
                    <SelectItem key={b.codigo} value={b.codigo}>
                      {b.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Archivo Excel / CSV</Label>
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                ref={fileRef}
                data-testid="input-file-extracto"
                className="h-9 text-sm file:text-xs file:font-medium file:text-primary cursor-pointer"
              />
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleUpload}
                disabled={uploading}
                className="h-9 w-full"
                data-testid="button-upload-extracto"
              >
                {uploading ? "Procesando..." : "Cargar extracto"}
              </Button>
            </div>
          </div>

          {/* Resultado upload */}
          {uploadResult && (
            <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm space-y-1">
              <p className="font-medium text-foreground">Resultado de la carga:</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
                <span>Total filas: <strong className="text-foreground">{uploadResult.total}</strong></span>
                <span>Ingresos: <strong className="text-success">{uploadResult.ingresos}</strong></span>
                <span>Guardados: <strong className="text-primary">{uploadResult.guardados}</strong></span>
                <span>Duplicados: <strong className="text-warning">{uploadResult.duplicados}</strong></span>
              </div>
              <p className="text-xs text-muted-foreground">
                Débitos/comisiones omitidos: {uploadResult.omitidos}
              </p>
              {uploadResult.autoValidados > 0 && (
                <p className="text-xs font-medium text-primary">
                  Pagos auto-validados y conciliados: {uploadResult.autoValidados}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <Filter className="w-4 h-4 text-muted-foreground mb-2" />
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Banco</Label>
              <Select value={filtroB} onValueChange={setFiltroB}>
                <SelectTrigger className="h-8 w-48 text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los bancos</SelectItem>
                  {BANCOS.map((b) => (
                    <SelectItem key={b.codigo} value={b.codigo}>{b.nombre}</SelectItem>
                  ))}
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
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFiltroB("all"); setFechaDesde(""); setFechaHasta(""); }}>
              Limpiar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">
            Mostrando {extractos.length} de {allExtractos.length} ingreso{allExtractos.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : extractos.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No hay extractos cargados
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Fecha</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Banco</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Referencia</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Monto Bs</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Descripción</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Archivo</th>
                  </tr>
                </thead>
                <tbody>
                  {extractos.map((e, i) => (
                    <tr
                      key={e.id}
                      data-testid={`row-extracto-${e.id}`}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-xs">{formatFecha(e.fecha)}</td>
                      <td className="px-4 py-2.5 text-xs font-mono">{e.banco}</td>
                      <td className="px-4 py-2.5 text-xs font-mono">{e.referencia}</td>
                      <td className="px-4 py-2.5 text-xs text-right font-medium text-success">
                        {formatMonto(e.monto)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs truncate">{e.descripcion}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground truncate max-w-[120px]">{e.archivoOrigen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
