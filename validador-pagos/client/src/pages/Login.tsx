import { useState } from "react";
import { ShieldCheck, Eye, EyeOff, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast({ title: "Campos requeridos", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/login", { email, password });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Credenciales incorrectas");

      // Cargar permisos del rol desde el servidor
      let permsMap: Record<string, boolean> = {};
      try {
        const permsRes = await apiRequest("GET", `/api/permisos-roles?rol=${encodeURIComponent(data.rol)}`);
        if (permsRes.ok) {
          const rows: Array<{ pagina: string; permitido: string }> = await permsRes.json();
          for (const row of rows) {
            permsMap[row.pagina] = row.permitido === "true";
          }
        }
      } catch {
        // Si falla la carga de permisos, el admin siempre tiene acceso;
        // otros roles verán "No autorizado" hasta que se restaure la conexión.
      }

      login(data, permsMap);
      toast({ title: `Bienvenido, ${data.nombre}` });
    } catch (err: any) {
      toast({ title: err.message ?? "Credenciales incorrectas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary shadow-lg">
              <ShieldCheck className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Validador de Pagos</h1>
          <p className="text-sm text-muted-foreground">Onprotec · Gestión y conciliación</p>
        </div>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Iniciar sesión</CardTitle>
            <CardDescription>Ingresa tus credenciales para acceder</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input id="email" type="email" placeholder="usuario@onprotec.com"
                  value={email} onChange={e => setEmail(e.target.value)} data-testid="input-email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Input id="password" type={showPass ? "text" : "password"} placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)} className="pr-10" data-testid="input-password" />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full gap-2" disabled={loading} data-testid="button-login">
                {loading ? <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" /> : <LogIn className="w-4 h-4" />}
                {loading ? "Ingresando..." : "Ingresar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
