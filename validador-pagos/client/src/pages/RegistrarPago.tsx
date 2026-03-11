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

const BANCOS_EMISOR = [
  "0102 Banco de Venezuela","0104 Venezolano de Crédito","0105 Banco Mercantil",
  "0108 Banco Provincial","0114 Banco del Caribe (Bancaribe)","0115 Banco Exterior",
  "0116 Banco Occidental de Descuento","0128 Banco Caroni","0134 Banesco",
  "0137 Banco Sofitasa","0138 Banco Plaza","0146 Bangente","0149 Banco del Pueblo Soberano",
  "0151 Banco Fondo Común (BFC)","0156 100% Banco","0157 DELSUR Banco Universal",
  "0163 Banco del Tesoro","0166 Banco Agrícola de Venezuela","0168 Bancrecer",
  "0169 Mi Banco","0171 Banco Activo","0172 Bancamiga","0174 Banplus",
  "0175 Bicentenario Banco Universal","0177 Banfanb",
];

const BANCOS_RECEPTOR = [
  "0102 Banco de Venezuela",
  "0134 Banesco",
  "0191 BNC (Banco Nacional de Crédito)",
];

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
      const res = await apiRequest("POST", "/api/pagos", { ...data, monto: data.monto.replace(",","."), vendedor: user?.email ?? "", cliente: data.cliente ?? "" });
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
            <p className="text-xs text-red-600 mt-1">Ya existe un pago con referencia <strong>{duplicado.referencia||"—"}</strong> por <strong>Bs. {parseFloat(duplicado.monto||"0").toLocaleString("es-VE",{minimumFractionDigits:2})}</strong> del <strong>{duplicado.fechaPago}</strong>.</p>
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
                  <Input placeholder="Ej: 5000.00" {...field} data-testid="input-monto"/>
                </FormControl><FormMessage/></FormItem>
              )}/>

              <FormField control={form.control} name="referencia" render={({field})=>(
                <FormItem><FormLabel>Número de Referencia {tipoPago==="Transferencia"&&<span className="text-red-500">*</span>}</FormLabel><FormControl>
                  <Input placeholder="Número de confirmación" {...field} data-testid="input-referencia"/>
                </FormControl><FormMessage/></FormItem>
              )}/>

              {tipoPago==="PagoMovil"&&<FormField control={form.control} name="celular" render={({field})=>(
                <FormItem><FormLabel>Número de Celular</FormLabel><FormControl>
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
