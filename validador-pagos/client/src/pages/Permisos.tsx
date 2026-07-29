import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { KeyRound, Loader2 } from "lucide-react";

// Páginas gestionadas por el sistema de permisos
const PAGINAS = [
  { key: "registrar",             label: "Pagos en Bs",           desc: "Registrar pagos en bolívares" },
  { key: "registrar-divisas",     label: "Pago en Divisas",        desc: "Registrar pagos en divisas" },
  { key: "upload-cashea",         label: "Importar Cashea",        desc: "Subir archivo de pagos Cashea" },
  { key: "conciliacion",          label: "Resumen de Pagos",       desc: "Ver y conciliar pagos" },
  { key: "solicitudes",           label: "Solicitudes",            desc: "Crear y gestionar solicitudes de productos" },
  { key: "dashboard-solicitudes", label: "Dashboard Solicitudes",  desc: "Panel de control de solicitudes (compras)" },
  { key: "usuarios",              label: "Usuarios",               desc: "Crear y gestionar usuarios del sistema" },
];

// Roles editables (admin siempre tiene acceso — no se edita)
const ROLES = [
  { key: "vendedor",       label: "Vendedor",           color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  { key: "contabilidad",   label: "Contabilidad",       color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  { key: "cajero",         label: "Cajero",             color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  { key: "compras",        label: "Compras",            color: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300" },
  { key: "supervisor_caja",label: "Supervisor de Caja", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300" },
];

interface PermisoRow {
  rol: string;
  pagina: string;
  permitido: string; // "true" | "false"
}

export default function Permisos() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery<PermisoRow[]>({
    queryKey: ["permisos-roles"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/permisos-roles");
      if (!res.ok) throw new Error("Error al cargar permisos");
      return res.json();
    },
  });

  // Build a lookup: { "vendedor:registrar": true, ... }
  const lookup: Record<string, boolean> = {};
  for (const row of rows) {
    lookup[`${row.rol}:${row.pagina}`] = row.permitido === "true";
  }

  const mutation = useMutation({
    mutationFn: async ({ rol, pagina, permitido }: { rol: string; pagina: string; permitido: boolean }) => {
      const res = await apiRequest("PATCH", "/api/permisos-roles", {
        adminEmail: user?.email,
        rol,
        pagina,
        permitido,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? "Error al guardar");
      return body;
    },
    onMutate: async ({ rol, pagina, permitido }) => {
      // Optimistic update
      await qc.cancelQueries({ queryKey: ["permisos-roles"] });
      const prev = qc.getQueryData<PermisoRow[]>(["permisos-roles"]);
      qc.setQueryData<PermisoRow[]>(["permisos-roles"], old => {
        if (!old) return old;
        const exists = old.find(r => r.rol === rol && r.pagina === pagina);
        if (exists) {
          return old.map(r => r.rol === rol && r.pagina === pagina ? { ...r, permitido: permitido ? "true" : "false" } : r);
        }
        return [...old, { rol, pagina, permitido: permitido ? "true" : "false" }];
      });
      return { prev };
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["permisos-roles"], ctx.prev);
      toast({ title: err.message ?? "Error al guardar", variant: "destructive" });
    },
    onSuccess: (_data, { rol, pagina, permitido }) => {
      const rolLabel = ROLES.find(r => r.key === rol)?.label ?? rol;
      const paginaLabel = PAGINAS.find(p => p.key === pagina)?.label ?? pagina;
      toast({
        title: permitido ? "Permiso activado" : "Permiso desactivado",
        description: `${rolLabel} → ${paginaLabel}`,
      });
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
          <KeyRound className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Permisos de Roles</h1>
          <p className="text-sm text-muted-foreground">
            Activa o desactiva el acceso a cada sección para cada rol. Los cambios se aplican inmediatamente.
          </p>
        </div>
      </div>

      {/* Note about admin */}
      <div className="rounded-lg border border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950 px-4 py-3 text-sm text-purple-800 dark:text-purple-200">
        <strong>Administrador</strong> siempre tiene acceso a todas las secciones. Su columna no es editable.
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Cargando permisos…
        </div>
      ) : (
        /* Matrix table — scrollable horizontally on small screens */
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground w-56 min-w-[200px]">
                  Página / Sección
                </th>
                {/* Admin column — always enabled */}
                <th className="px-4 py-3 text-center font-semibold min-w-[110px]">
                  <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 font-medium">
                    Admin
                  </Badge>
                </th>
                {ROLES.map(rol => (
                  <th key={rol.key} className="px-4 py-3 text-center font-semibold min-w-[110px]">
                    <Badge className={`${rol.color} font-medium`}>{rol.label}</Badge>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {PAGINAS.map((pagina, idx) => (
                <tr key={pagina.key} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{pagina.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{pagina.desc}</div>
                  </td>

                  {/* Admin — always on, disabled */}
                  <td className="px-4 py-3 text-center">
                    <Switch checked={true} disabled className="opacity-60 cursor-not-allowed" />
                  </td>

                  {ROLES.map(rol => {
                    const key = `${rol.key}:${pagina.key}`;
                    const checked = lookup[key] ?? false;
                    const isPending = mutation.isPending &&
                      (mutation.variables as any)?.rol === rol.key &&
                      (mutation.variables as any)?.pagina === pagina.key;

                    return (
                      <td key={rol.key} className="px-4 py-3 text-center">
                        <Switch
                          checked={checked}
                          disabled={isPending}
                          onCheckedChange={val =>
                            mutation.mutate({ rol: rol.key, pagina: pagina.key, permitido: val })
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
