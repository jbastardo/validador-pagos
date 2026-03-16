import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { PlusCircle, AlertTriangle, CheckCircle2, Smartphone, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { BANCOS_EMISOR, BANCOS_RECEPTOR } from "@shared/schema";

const schema = z.object({
  fechaPago:     z.string().min(1, "Fecha requerida"),
  bancoEmisor:   z.string().min(1, "Banco emisor requerido"),
  monto:         z.string().min(1, "Monto requerido"),
  celular:       z.string().optional(),
  bancoReceptor: z.string().min(1, "Banco receptor requerido"),
  referencia:    z.string().optional(),
  rif:           z.string().optional(),
  factura:       z.string().optional(),
  cliente:       z.string().optional(),
  tipoPago:      z.enum(["PagoMovil","Transferencia"]),
  observaciones: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.tipoPago === "Transferencia" && !data.referencia?.trim()) {
    ctx.addIssue({ code: "custom", path: ["referencia"], message: "La referencia es obligatoria para transferencias" });
  }
  if (data.tipoPago === "PagoMovil" && !data.celular?.trim()) {
    ctx.addIssue({ code: "custom", path: ["celular"], message: "El número de celular es obligatorio para Pago Móvil" });
  }
});
type FormValues = z.infer<typeof schema>;

export default function RegistrarPago() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [duplicado, setDuplicado] = useState<any>(null);
  const [success,   setSuccess]   = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fechaPago: new Date().toISOString().split("T")[0], bancoEmisor:"", monto:"", celular:"", bancoReceptor:"", referencia:"", rif:"", factura:"", cliente:"", tipoPago:"PagoMovil", observaciones:"" },
  });

  const tipoPago = form.watch("tipoPago");

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const refDigits  = (data.referencia ?? "").replace(/\D/g, "").slice(-10);
      const refTrimmed  = refDigits.padStart(10, "0");  // siempre 10 dígitos, rellena con ceros a la izquierda
      const res = await apiRequest("POST", "/api/pagos", { ...data, referencia: refTrimmed, monto: data.monto.replace(",","."), vendedor: user?.email ?? "", cliente: data.cliente ?? "" });
      const json = await res.json();
      if (!res.ok) throw { status: res.status, ...json };
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pagos"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      setDuplicado(null); setSuccess(true);
      form.reset({ fechaPago: new Date().toISOString().split("T")[0], bancoEmisor:"", monto:"", celular:"", bancoReceptor:"", referencia:"", rif:"", factura:"", cliente:"", tipoPago:"PagoMovil", observaciones:"" });
      setTimeout(() => setSuccess(false), 4000);
      toast({ title: "Pago registrado en Google Sheets" });
    },
    onError: (err: any) => {
      if (err.status === 409) { setDuplicado(err.duplicado); toast({ title: "Pago duplicado detectado", variant: "destructive" }); }
      else toast({ title: "Error al registrar", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold">Registrar Pago</h1>
        <p className="text-sm text-muted-foreground">Ingresa los datos del comprobante de pago</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(["PagoMovil","Transferencia"] as const).map(tipo => (
          <button key={tipo} type="button" onClick={() => form.setValue("tipoPago", tipo)}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${tipoPago===tipo?(tipo==="PagoMovil"?"border-blue-500 bg-blue-50":"border-emerald-500 bg-emerald-50"):"border-border bg-card"}`}>
            {tipo==="PagoMovil"
              ? <Smartphone className={`w-7 h-7 ${tipoPago===tipo?"text-blue-600":"text-muted-foreground"}`}/>
              : <ArrowRightLeft className={`w-7 h-7 ${tipoPago===tipo?"text-emerald-600":"text-muted-foreground"}`}/>}
            <span className={`text-sm font-semibold ${tipoPago===tipo?(tipo==="PagoMovil"?"text-blue-700":"text-emerald-700"):"text-foreground"}`}>{tipo==="PagoMovil"?"Pago Móvil":"Transferencia"}</span>
          </button>
        ))}
      </div>

      {duplicado && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5"/>
          <div>
            <p className="text-sm font-semibold text-red-700">Pago duplicado detectado</p>
            <p className="text-xs text-red-600 mt-1">Ya existe un pago con referencia <strong>{duplicado.referencia||"—"}</strong> por <strong>Bs. {parseFloat(duplicado.monto||"0").toLocaleString("es-ES",{minimumFractionDigits:2})}</strong> del <strong>{duplicado.fechaPago}</strong>.</p>
          </div>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle2 className="w-5 h-5 text-green-600"/>
          <p className="text-sm font-semibold text-green-700">Pago registrado exitosamente — guardado en Google Sheets</p>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Datos del Pago</CardTitle></CardHeader>
            <CardContent className="space-y-4">

              <FormField control={form.control} name="fechaPago" render={({field})=>(
                <FormItem><FormLabel>Fecha de Pago</FormLabel><FormControl>
                  <Input type="date" value={field.value} onChange={e=>field.onChange(e.target.value)} data-testid="input-fecha"/>
                </FormControl><FormMessage/></FormItem>
              )}/>

              <FormField control={form.control} name="bancoEmisor" render={({field})=>(
                <FormItem><FormLabel>Banco Emisor</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecciona el banco que envía"/></SelectTrigger></FormControl>
                    <SelectContent>{BANCOS_EMISOR.map(b=><SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                  </Select><FormMessage/>
                </FormItem>
              )}/>

              <FormField control={form.control} name="bancoReceptor" render={({field})=>(
                <FormItem><FormLabel>Banco Receptor</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecciona el banco que recibe"/></SelectTrigger></FormControl>
                    <SelectContent>{BANCOS_RECEPTOR.map(b=><SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                  </Select><FormMessage/>
                </FormItem>
              )}/>

              <FormField control={form.control} name="monto" render={({field})=>(
                <FormItem><FormLabel>Monto (Bs.)</FormLabel><FormControl>
                  <Input placeholder="Ej: 5000,00" {...field} data-testid="input-monto"/>
                </FormControl><FormMessage/></FormItem>
              )}/>

              <FormField control={form.control} name="referencia" render={({field})=>(
                <FormItem><FormLabel>Número de Referencia {tipoPago==="Transferencia"&&<span className="text-red-500">*</span>}</FormLabel><FormControl>
                  <Input
                    placeholder="Últimos 10 dígitos"
                    maxLength={10}
                    {...field}
                    onChange={e => field.onChange(e.target.value.replace(/\D/g, "").slice(-10))}
                    data-testid="input-referencia"
                  />
                </FormControl><FormMessage/></FormItem>
              )}/>

              {tipoPago==="PagoMovil"&&<FormField control={form.control} name="celular" render={({field})=>(
                <FormItem><FormLabel>Número de Celular <span className="text-red-500">*</span></FormLabel><FormControl>
                  <Input placeholder="0424-1234567" {...field} data-testid="input-celular"/>
                </FormControl><FormMessage/></FormItem>
              )}/>}

              <FormField control={form.control} name="cliente" render={({field})=>(
                <FormItem><FormLabel>Cliente</FormLabel><FormControl>
                  <Input placeholder="Nombre del cliente" {...field} data-testid="input-cliente"/>
                </FormControl><FormMessage/></FormItem>
              )}/>

              <FormField control={form.control} name="rif" render={({field})=>(
                <FormItem><FormLabel>RIF del Pagador (opcional)</FormLabel><FormControl>
                  <Input placeholder="J-123456789" {...field} data-testid="input-rif"/>
                </FormControl><FormMessage/></FormItem>
              )}/>

              <FormField control={form.control} name="factura" render={({field})=>(
                <FormItem><FormLabel>Número de Factura (opcional)</FormLabel><FormControl>
                  <Input placeholder="FAC-0001" {...field} data-testid="input-factura"/>
                </FormControl><FormMessage/></FormItem>
              )}/>

              <FormField control={form.control} name="observaciones" render={({field})=>(
                <FormItem><FormLabel>Observaciones (opcional)</FormLabel><FormControl>
                  <Input placeholder="Notas adicionales" {...field} data-testid="input-obs"/>
                </FormControl><FormMessage/></FormItem>
              )}/>

            </CardContent>
          </Card>
          <Button type="submit" className="w-full gap-2" disabled={mutation.isPending} data-testid="button-submit">
            {mutation.isPending ? <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"/> : <PlusCircle className="w-4 h-4"/>}
            {mutation.isPending ? "Guardando en Sheets..." : "Registrar Pago"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
