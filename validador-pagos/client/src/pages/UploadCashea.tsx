import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UploadResult {
  ok: boolean;
  total: number;
  validos: number;
  invalidos: number;
  guardados: number;
  duplicados: number;
  errores: string[];
}

export default function UploadCashea() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  const mutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/pagos/upload-cashea", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw { status: res.status, ...json };
      return json as UploadResult;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/pagos"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      setResult(data);
      setFile(null);
      
      if (data.guardados > 0) {
        toast({
          title: "Importación completada",
          description: `${data.guardados} pagos registrados exitosamente`,
        });
      } else {
        toast({
          title: "Sin pagos nuevos",
          description: "Todos los pagos ya existían o eran inválidos",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Error al procesar el archivo",
        description: err.message || "Error desconocido",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validar que sea Excel
      const validExtensions = [".xlsx", ".xls"];
      const fileName = selectedFile.name.toLowerCase();
      const isValid = validExtensions.some(ext => fileName.endsWith(ext));
      
      if (!isValid) {
        toast({
          title: "Archivo inválido",
          description: "Solo se permiten archivos Excel (.xlsx, .xls)",
          variant: "destructive",
        });
        return;
      }
      
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleUpload = () => {
    if (!file) {
      toast({ title: "Selecciona un archivo", variant: "destructive" });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("vendedor", user?.email || "Cashea");
    formData.append("rif", "J-00000000-0");

    mutation.mutate(formData);
  };

  const handleClearFile = () => {
    setFile(null);
    setResult(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold">Importar Pagos Cashea</h1>
        <p className="text-sm text-muted-foreground">
          Sube un archivo Excel con los pagos de Cashea para registrarlos en lote
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Subir Archivo Excel
          </CardTitle>
          <CardDescription>
            El archivo debe contener las siguientes columnas: Fecha, Referencia, Monto, Banco Emisor, Celular, Cliente/RIF (opcional)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file-upload">Archivo Excel</Label>
            <div className="flex gap-2">
              <Input
                id="file-upload"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                disabled={mutation.isPending}
              />
              {file && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleClearFile}
                  disabled={mutation.isPending}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {file && (
              <p className="text-sm text-muted-foreground">
                Archivo seleccionado: <span className="font-medium">{file.name}</span>
              </p>
            )}
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Importante:</strong> Los pagos duplicados (misma referencia) serán descartados automáticamente.
              Todos los pagos serán del tipo "Pago Móvil" y banco receptor BNC (0191).
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button
              onClick={handleUpload}
              disabled={!file || mutation.isPending}
              className="flex-1"
            >
              <Upload className="h-4 w-4 mr-2" />
              {mutation.isPending ? "Procesando..." : "Subir y Procesar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.guardados > 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-500" />
              )}
              Resultado de la Importación
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total de registros</p>
                <p className="text-2xl font-bold">{result.total}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Registros válidos</p>
                <p className="text-2xl font-bold text-green-500">{result.validos}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Pagos guardados</p>
                <p className="text-2xl font-bold text-blue-500">{result.guardados}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Duplicados descartados</p>
                <p className="text-2xl font-bold text-yellow-500">{result.duplicados}</p>
              </div>
              {result.invalidos > 0 && (
                <div className="space-y-1 col-span-2">
                  <p className="text-sm text-muted-foreground">Registros inválidos</p>
                  <p className="text-2xl font-bold text-red-500">{result.invalidos}</p>
                </div>
              )}
            </div>

            {result.errores && result.errores.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Errores encontrados:</p>
                <div className="bg-muted p-3 rounded-md max-h-60 overflow-y-auto">
                  <ul className="text-sm space-y-1">
                    {result.errores.slice(0, 20).map((error, i) => (
                      <li key={i} className="text-muted-foreground">
                        • {error}
                      </li>
                    ))}
                    {result.errores.length > 20 && (
                      <li className="text-muted-foreground italic">
                        ... y {result.errores.length - 20} errores más
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">Formato del Archivo Excel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2">
            <p>El archivo debe tener las siguientes columnas (en orden):</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li><strong>Fecha:</strong> Formato DD/MM/YYYY o fecha de Excel</li>
              <li><strong>Referencia:</strong> Número único del pago (obligatorio)</li>
              <li><strong>Monto:</strong> Cantidad en bolívares</li>
              <li><strong>Banco Emisor:</strong> Código de 4 dígitos (ej: 0102, 0134)</li>
              <li><strong>Celular:</strong> Número de celular 04XX-XXXXXXX</li>
              <li><strong>Cliente/RIF:</strong> Nombre del cliente o RIF (opcional)</li>
            </ol>
            <p className="text-muted-foreground mt-3">
              La primera fila debe contener los encabezados y será omitida.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
