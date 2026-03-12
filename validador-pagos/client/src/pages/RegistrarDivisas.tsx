import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { DollarSign, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";

const TIPOS_DIVISA = ["Zelle", "Binance", "Banesco Panamá"];

const schema = z.object({
  fecha:         z.string().min(1, "Fecha requerida"),
  nombrePagador: z.string().min(1, "Nombre del pagador requerido"),
  correo:        z.string().optional(),
  monto:         z.string().min(1, "Monto requerido"),
  tipo:          z.string().min(1, "Tipo de pago requerido"),
  referencia:    z.string().optional(),
  cliente:       z.string().optional(),
  rif:           z.string().optional(),
  factura:       z.string().optional(),
  observaciones: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.tipo === "Banesco Panamá" && !data.referencia?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Referencia requerida para Banesco Panamá", path: ["referencia"] });
  }
});

type FormValues = z.infer<typeof schema>;

export default function RegistrarDivisas() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [success, setSuccess] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fecha: new Date().toISOString().split("T")[0],
      nombrePagador: "", correo: "", monto: "", tipo: "",
      referencia: "", cliente: "", rif: "", factura: "", observaciones: "",
    },
  });

  const tipoSeleccionado = form.watch("tipo");

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const res = await apiRequest("POST", "/api/pagos-divisas", {
        ...data,
        monto: data.monto.replace(",", "."),
        vendedor: user?.email ?? "",
      });
      const json = await res.json();
      if (!res.ok) throw json;
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pagos-divisas"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      setSuccess(true);
      form.reset({
        fecha: new Date().toISOString().split("T")[0],
        nombrePagador: "", correo: "", monto: "", tipo: "",
        referencia: "", cliente: "", rif: "", factura: "", observaciones: "",
      });
      setTimeout(() => setSuccess(false), 4000);
      toast({ title: "Pago en divisas registrado correctamente" });
    },
    onError: (err: any) => {
      toast({ title: "Error al registrar", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold">Registrar Pago en Divisas</h1>
        <p className="text-sm text-muted-foreground">Zelle, Binance o Banesco Panamá</p>
      </div>

      {/* Selector de tipo */}
      <div className="grid grid-cols-3 gap-3">
        {TIPOS_DIVISA.map(tipo => (
          <button
            key={tipo}
            type="button"
            onClick={() => form.setValue("tipo", tipo, { shouldValidate: true })}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
              tipoSeleccionado === tipo
                ? "border-violet-500 bg-violet-50 dark:bg-violet-950"
                : "border-border bg-card"
            }`}
          >
            <DollarSign className={`w-6 h-6 ${tipoSeleccionado === tipo ? "text-violet-600" : "text-muted-foreground"}`} />
            <span className={`text-xs font-semibold text-center leading-tight ${tipoSeleccionado === tipo ? "text-violet-700" : "text-foreground"}`}>
              {tipo}
            </span>
          </button>
        ))}
      </div>

      {success && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <p className="text-sm font-semibold text-green-700">Pago en divisas registrado — guardado en Google Sheets</p>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Datos del Pago</CardTitle></CardHeader>
            <CardContent className="space-y-4">

              <FormField control={form.control} name="fecha" render={({ field }) => (
                <FormItem><FormLabel>Fecha</FormLabel><FormControl>
                  <Input type="date" value={field.value} onChange={e => field.onChange(e.target.value)} data-testid="input-fecha-div" />
                </FormControl><FormMessage /></FormItem>
              )} />

              <FormField control={form.control} name="nombrePagador" render={({ field }) => (
                <FormItem><FormLabel>Nombre del Pagador</FormLabel><FormControl>
                  <Input placeholder="Nombre completo" {...field} data-testid="input-nombre-pagador" />
                </FormControl><FormMessage /></FormItem>
              )} />

              <FormField control={form.control} name="correo" render={({ field }) => (
                <FormItem><FormLabel>Correo (opcional)</FormLabel><FormControl>
                  <Input type="email" placeholder="correo@ejemplo.com" {...field} data-testid="input-correo-div" />
                </FormControl><FormMessage /></FormItem>
              )} />

              <FormField control={form.control} name="monto" render={({ field }) => (
                <FormItem><FormLabel>Monto ($)</FormLabel><FormControl>
                  <Input placeholder="Ej: 100.00" {...field} data-testid="input-monto-div" />
                </FormControl><FormMessage /></FormItem>
              )} />

              <FormField control={form.control} name="tipo" render={({ field }) => (
                <FormItem><FormLabel>Tipo de Pago</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecciona el tipo" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {TIPOS_DIVISA.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="referencia" render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Referencia {tipoSeleccionado === "Banesco Panamá" && <span className="text-red-500">*</span>}
                    {tipoSeleccionado !== "Banesco Panamá" && <span className="text-muted-foreground text-xs"> (opcional)</span>}
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Número de confirmación" {...field} data-testid="input-ref-div" />
                  </FormControl><FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="cliente" render={({ field }) => (
                <FormItem><FormLabel>Cliente (opcional)</FormLabel><FormControl>
                  <Input placeholder="Nombre del cliente" {...field} data-testid="input-cliente-div" />
                </FormControl><FormMessage /></FormItem>
              )} />

              <FormField control={form.control} name="rif" render={({ field }) => (
                <FormItem><FormLabel>RIF (opcional)</FormLabel><FormControl>
                  <Input placeholder="J-123456789" {...field} data-testid="input-rif-div" />
                </FormControl><FormMessage /></FormItem>
              )} />

              <FormField control={form.control} name="factura" render={({ field }) => (
                <FormItem><FormLabel>Factura (opcional)</FormLabel><FormControl>
                  <Input placeholder="FAC-0001" {...field} data-testid="input-factura-div" />
                </FormControl><FormMessage /></FormItem>
              )} />

              <FormField control={form.control} name="observaciones" render={({ field }) => (
                <FormItem><FormLabel>Observaciones (opcional)</FormLabel><FormControl>
                  <Input placeholder="Notas adicionales" {...field} data-testid="input-obs-div" />
                </FormControl><FormMessage /></FormItem>
              )} />

            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white"
            disabled={mutation.isPending || !tipoSeleccionado}
            data-testid="button-submit-div"
          >
            {mutation.isPending
              ? <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
              : <DollarSign className="w-4 h-4" />}
            {mutation.isPending ? "Guardando..." : "Registrar Pago en Divisas"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
