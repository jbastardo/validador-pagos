import { useState } from "react";
import { UserPlus, Edit2, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";

interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  activo: string;
}

const rolLabel: Record<string, string> = {
  admin: "Administrador",
  contabilidad: "Contabilidad",
  vendedor: "Vendedor",
  cajero: "Cajero",
  supervisor: "Supervisor",
};
const rolColors: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  contabilidad: "bg-blue-100 text-blue-700",
  vendedor: "bg-green-100 text-green-700",
  cajero: "bg-orange-100 text-orange-700",
  supervisor: "bg-indigo-100 text-indigo-700",
};

export default function Usuarios() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.rol === "admin";

  const { data: usuarios = [], isLoading } = useQuery<Usuario[]>({
    queryKey: ["/api/usuarios"],
  });

  const createMutation = useMutation({
    mutationFn: async (body: { nombre: string; email: string; password: string; rol: string }) => {
      const res = await apiRequest("POST", "/api/usuarios", body);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "Error al crear usuario");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/usuarios"] });
      toast({ title: "Usuario creado" });
      setDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: err.message ?? "Error al crear usuario", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Partial<Usuario & { password?: string }> }) => {
      const res = await apiRequest("PATCH", `/api/usuarios/${id}`, body);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "Error al actualizar usuario");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/usuarios"] });
      toast({ title: "Usuario actualizado" });
      setDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: err.message ?? "Error al actualizar usuario", variant: "destructive" });
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<Usuario | null>(null);
  const [form, setForm] = useState({ nombre: "", email: "", password: "", rol: "vendedor" });

  // ── Modal eliminar usuario (admin) ──
  const [deleteOpen,     setDeleteOpen]     = useState(false);
  const [deleteUserId,   setDeleteUserId]   = useState<number | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading,  setDeleteLoading]  = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) => {
      const res = await apiRequest("DELETE", `/api/usuarios/${id}`, { email: user?.email ?? "", password });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "Error al eliminar");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/usuarios"] });
      toast({ title: "Usuario eliminado" });
      setDeleteOpen(false);
      setDeletePassword("");
    },
    onError: (err: any) => toast({ title: err.message ?? "Error al eliminar", variant: "destructive" }),
  });

  const handleDeleteUser = async () => {
    if (deleteUserId === null || !deletePassword) return;
    setDeleteLoading(true);
    try {
      await deleteMutation.mutateAsync({ id: deleteUserId, password: deletePassword });
    } finally {
      setDeleteLoading(false);
    }
  };

  const openNew = () => {
    setEditUser(null);
    setForm({ nombre: "", email: "", password: "", rol: "vendedor" });
    setDialogOpen(true);
  };

  const openEdit = (u: Usuario) => {
    setEditUser(u);
    setForm({ nombre: u.nombre, email: u.email, password: "", rol: u.rol });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.nombre || !form.email) {
      toast({ title: "Campos requeridos", variant: "destructive" });
      return;
    }
    if (editUser) {
      const body: Partial<Usuario & { password?: string }> = {
        nombre: form.nombre,
        rol: form.rol,
      };
      if (form.password) body.password = form.password;
      updateMutation.mutate({ id: editUser.id, body });
    } else {
      if (!form.password) {
        toast({ title: "La contraseña es requerida", variant: "destructive" });
        return;
      }
      createMutation.mutate({ nombre: form.nombre, email: form.email, password: form.password, rol: form.rol });
    }
  };

  const toggleActivo = (u: Usuario) => {
    updateMutation.mutate({
      id: u.id,
      body: { activo: u.activo === "true" ? "false" : "true" },
    });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">Gestiona los vendedores y accesos del sistema</p>
        </div>
        <Button onClick={openNew} className="gap-2" data-testid="button-nuevo-usuario">
          <UserPlus className="w-4 h-4" /> Nuevo usuario
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                Cargando usuarios…
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-y border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Nombre</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">Email</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Rol</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Estado</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/20" data-testid={`row-usuario-${u.id}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-primary">{u.nombre.charAt(0).toUpperCase()}</span>
                          </div>
                          <span className="font-medium">{u.nombre}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${rolColors[u.rol] ?? ""}`}>
                          {rolLabel[u.rol] ?? u.rol}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.activo === "true" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {u.activo === "true" ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            onClick={() => openEdit(u)}
                            data-testid={`button-editar-${u.id}`}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={`h-8 px-2 ${u.activo === "true" ? "text-green-600" : "text-muted-foreground"}`}
                            onClick={() => toggleActivo(u)}
                            data-testid={`button-toggle-${u.id}`}
                          >
                            {u.activo === "true" ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          </Button>
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-red-500 hover:bg-red-50 hover:text-red-700"
                              onClick={() => { setDeleteUserId(u.id); setDeletePassword(""); setDeleteOpen(true); }}
                              data-testid={`button-delete-usuario-${u.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editUser ? "Editar usuario" : "Nuevo usuario"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre completo</Label>
              <Input
                placeholder="Juan Pérez"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                data-testid="input-nombre"
              />
            </div>
            {!editUser && (
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="usuario@onprotec.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  data-testid="input-email"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>{editUser ? "Nueva contraseña (opcional)" : "Contraseña"}</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                data-testid="input-password"
              />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={form.rol} onValueChange={(v) => setForm((f) => ({ ...f, rol: v }))}>
                <SelectTrigger data-testid="select-rol">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendedor">Vendedor</SelectItem>
                  <SelectItem value="cajero">Cajero</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="contabilidad">Contabilidad</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isPending} data-testid="button-guardar">
              {isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Modal eliminar usuario (admin) ── */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { if (!deleteLoading) { setDeleteOpen(o); if (!o) setDeletePassword(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-4 h-4" /> Eliminar usuario
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Esta acción es <span className="font-semibold text-foreground">irreversible</span>. El usuario será eliminado permanentemente.
              Ingresa tu contraseña para confirmar.
            </p>
            <div className="space-y-2">
              <Label>Tu contraseña</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && deletePassword) handleDeleteUser(); }}
                autoFocus
                data-testid="input-delete-password-usuario"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeletePassword(""); }} disabled={deleteLoading}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={!deletePassword || deleteLoading}
              data-testid="button-confirm-delete-usuario"
            >
              {deleteLoading ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
