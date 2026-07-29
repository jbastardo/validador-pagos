import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Usuario } from "@shared/schema";
import { Users, UserPlus, Pencil, Trash2, ShieldCheck, Eye, EyeOff } from "lucide-react";

interface Props { user: Usuario; }

interface UsuarioRow {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  activo: string;
}

const ROLES = [
  { value: "admin",     label: "Administrador" },
  { value: "gerencia",  label: "Gerencia" },
  { value: "operador",  label: "Operador" },
];

const rolColor: Record<string, string> = {
  admin:    "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  gerencia: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  operador: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

const EMPTY_FORM = { nombre: "", email: "", password: "", rol: "operador" };

export default function Usuarios({ user }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Formulario de creación / edición
  const [dialogOpen,    setDialogOpen]    = useState(false);
  const [editTarget,    setEditTarget]    = useState<UsuarioRow | null>(null);
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [showPassword,  setShowPassword]  = useState(false);

  // Confirmación de eliminación
  const [deleteTarget,  setDeleteTarget]  = useState<UsuarioRow | null>(null);
  const [deleteOpen,    setDeleteOpen]    = useState(false);

  const { data: usuarios = [], isLoading } = useQuery<UsuarioRow[]>({
    queryKey: ["/api/usuarios"],
    queryFn: async () => {
      const res = await fetch("/api/usuarios");
      if (!res.ok) throw new Error("Error al cargar usuarios");
      return res.json();
    },
  });

  const crearMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const res = await apiRequest("POST", "/api/usuarios", data);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al crear usuario");
      return json;
    },
    onSuccess: () => {
      toast({ title: "Usuario creado correctamente" });
      qc.invalidateQueries({ queryKey: ["/api/usuarios"] });
      cerrarDialog();
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const editarMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof EMPTY_FORM> & { activo?: string } }) => {
      const res = await apiRequest("PUT", `/api/usuarios/${id}`, data);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al editar usuario");
      return json;
    },
    onSuccess: () => {
      toast({ title: "Usuario actualizado" });
      qc.invalidateQueries({ queryKey: ["/api/usuarios"] });
      cerrarDialog();
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const eliminarMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/usuarios/${id}`, {});
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al eliminar");
      return json;
    },
    onSuccess: () => {
      toast({ title: "Usuario eliminado" });
      qc.invalidateQueries({ queryKey: ["/api/usuarios"] });
      setDeleteOpen(false);
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const abrirCrear = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setShowPassword(false);
    setDialogOpen(true);
  };

  const abrirEditar = (u: UsuarioRow) => {
    setEditTarget(u);
    setForm({ nombre: u.nombre, email: u.email, password: "", rol: u.rol });
    setShowPassword(false);
    setDialogOpen(true);
  };

  const cerrarDialog = () => {
    setDialogOpen(false);
    setEditTarget(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = () => {
    if (!form.nombre.trim() || !form.email.trim() || !form.rol) {
      toast({ title: "Nombre, email y rol son obligatorios", variant: "destructive" });
      return;
    }
    if (!editTarget && !form.password.trim()) {
      toast({ title: "La contraseña es obligatoria para nuevos usuarios", variant: "destructive" });
      return;
    }
    if (editTarget) {
      editarMutation.mutate({ id: editTarget.id, data: form });
    } else {
      crearMutation.mutate(form);
    }
  };

  const toggleActivo = (u: UsuarioRow) => {
    const nuevoActivo = u.activo === "true" ? "false" : "true";
    editarMutation.mutate({ id: u.id, data: { activo: nuevoActivo } });
  };

  const isPending = crearMutation.isPending || editarMutation.isPending;

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Usuarios</h1>
            <p className="text-sm text-muted-foreground">Gestión de acceso al Conciliador de Pagos</p>
          </div>
        </div>
        <Button onClick={abrirCrear} className="gap-2 h-9">
          <UserPlus className="w-4 h-4" />
          Nuevo usuario
        </Button>
      </div>

      {/* Aviso de acceso restringido */}
      <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm">
        <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-amber-700 dark:text-amber-400">
          Solo los usuarios con rol <strong>Administrador</strong> pueden acceder a esta sección y gestionar cuentas.
        </p>
      </div>

      {/* Tabla de usuarios */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold">
            {isLoading ? "Cargando..." : `${usuarios.length} usuario${usuarios.length !== 1 ? "s" : ""} registrado${usuarios.length !== 1 ? "s" : ""}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}
            </div>
          ) : usuarios.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>No hay usuarios registrados.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-y border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Nombre</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Email</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Rol</th>
                    <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Estado</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr
                      key={u.id}
                      className={`border-b border-border last:border-0 transition-colors ${
                        u.activo !== "true" ? "opacity-50 bg-muted/20" : "hover:bg-muted/20"
                      }`}
                    >
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                            {(u.nombre || u.email)[0]?.toUpperCase()}
                          </div>
                          {u.nombre || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={`border-0 text-xs ${rolColor[u.rol] ?? "bg-muted text-muted-foreground"}`}>
                          {ROLES.find((r) => r.value === u.rol)?.label ?? u.rol}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleActivo(u)}
                          disabled={u.email === user.username}
                          title={u.email === user.username ? "No puedes desactivarte a ti mismo" : ""}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                            u.activo === "true"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-200"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          } disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          {u.activo === "true" ? "Activo" : "Inactivo"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => abrirEditar(u)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            disabled={u.email === user.username}
                            onClick={() => { setDeleteTarget(u); setDeleteOpen(true); }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog crear / editar */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) cerrarDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Editar usuario" : "Nuevo usuario"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="u-nombre">Nombre completo</Label>
              <Input
                id="u-nombre"
                placeholder="Juan Pérez"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-email">Email</Label>
              <Input
                id="u-email"
                type="email"
                placeholder="juan@empresa.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                disabled={!!editTarget}
              />
              {editTarget && (
                <p className="text-xs text-muted-foreground">El email no se puede modificar.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-password">
                Contraseña {editTarget && <span className="text-muted-foreground text-xs">(dejar vacío para no cambiar)</span>}
              </Label>
              <div className="relative">
                <Input
                  id="u-password"
                  type={showPassword ? "text" : "password"}
                  placeholder={editTarget ? "Nueva contraseña (opcional)" : "Contraseña"}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-rol">Rol</Label>
              <Select value={form.rol} onValueChange={(v) => setForm((f) => ({ ...f, rol: v }))}>
                <SelectTrigger id="u-rol">
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cerrarDialog} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Guardando..." : editTarget ? "Guardar cambios" : "Crear usuario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              El usuario <strong>{deleteTarget?.nombre}</strong> ({deleteTarget?.email}) será desactivado permanentemente y no podrá iniciar sesión.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => deleteTarget && eliminarMutation.mutate(deleteTarget.id)}
            >
              {eliminarMutation.isPending ? "Eliminando..." : "Sí, eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
