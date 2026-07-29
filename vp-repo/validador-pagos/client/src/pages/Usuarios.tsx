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
  compras: "Compras",
  supervisor_caja: "Supervisor de Caja",
};

const rolColors: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  contabilidad: "bg-blue-100 text-blue-700",
  vendedor: "bg-green-100 text-green-700",
  cajero: "bg-orange-100 text-orange-700",
  compras: "bg-teal-100 text-teal-700",
  supervisor_caja: "bg-indigo-100 text-indigo-700",
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
    mutationFn: async ({ id, body }: { id: number; body: Partial<Usuario> & { password?: string } }) => {
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

  // -- Modal eliminar usuario (admin) --
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

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
      const body: Partial<Usuario> & { password?: string } = {
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <p className="text-muted-foreground">Gestiona los vendedores y accesos del sistema</p>
        </div>
        <Button onClick={openNew}><UserPlus className="mr-2 h-4 w-4" /> Nuevo usuario</Button>
      </div>

      {isLoading ? (
        <p className="text-center py-8 text-muted-foreground">Cargando usuarios...</p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Nombre</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Rol</th>
              <th className="p-3 text-left">Estado</th>
              <th className="p-3 text-left">Acciones</th>
            </tr></thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-b">
                  <td className="p-3 flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${rolColors[u.rol] ?? "bg-gray-100 text-gray-700"}`}>
                      {u.nombre.charAt(0).toUpperCase()}
                    </span>
                    {u.nombre}
                  </td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${rolColors[u.rol] ?? "bg-gray-100 text-gray-700"}`}>
                      {rolLabel[u.rol] ?? u.rol}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={u.activo === "true" ? "text-green-600" : "text-red-500"}>
                      {u.activo === "true" ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="p-3 space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(u)} data-testid={`button-editar-${u.id}`}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActivo(u)} data-testid={`button-toggle-${u.id}`}>
                      {u.activo === "true" ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4 text-red-500" />}
                    </Button>
                    {isAdmin && (
                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => { setDeleteUserId(u.id); setDeletePassword(""); setDeleteOpen(true); }} data-testid={`button-delete-usuario-${u.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editUser ? "Editar usuario" : "Nuevo usuario"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Nombre completo</Label>
              <Input placeholder="Juan Perez" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} data-testid="input-nombre" />
            </div>
            {!editUser && (
              <div>
                <Label>Email</Label>
                <Input type="email" placeholder="usuario@onprotec.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} data-testid="input-email" />
              </div>
            )}
            <div>
              <Label>{editUser ? "Nueva contraseña (opcional)" : "Contraseña"}</Label>
              <Input type="password" placeholder="********" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} data-testid="input-password" />
            </div>
            <div>
              <Label>Rol</Label>
              <Select value={form.rol} onValueChange={(v) => setForm((f) => ({ ...f, rol: v }))}>
                <SelectTrigger data-testid="select-rol"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendedor">Vendedor</SelectItem>
                  <SelectItem value="cajero">Cajero</SelectItem>
                  <SelectItem value="compras">Compras</SelectItem>
                  <SelectItem value="supervisor_caja">Supervisor de Caja</SelectItem>
                  <SelectItem value="contabilidad">Contabilidad</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isPending}>{isPending ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal eliminar usuario (admin) */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { if (!deleteLoading) { setDeleteOpen(o); if (!o) setDeletePassword(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Eliminar usuario</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta accion es <strong>irreversible</strong>. El usuario sera eliminado permanentemente.
            Ingresa tu contraseña para confirmar.
          </p>
          <div>
            <Label>Tu contraseña</Label>
            <Input type="password" placeholder="********" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && deletePassword) handleDeleteUser(); }} autoFocus data-testid="input-delete-password-usuario" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeletePassword(""); }} disabled={deleteLoading}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteUser} disabled={!deletePassword || deleteLoading}>{deleteLoading ? "Eliminando..." : "Eliminar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
