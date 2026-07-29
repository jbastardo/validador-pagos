import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { Usuario } from "@shared/schema";

interface Props {
  onLogin: (user: Usuario) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error de autenticación");
      onLogin(data as Usuario);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <svg
            aria-label="Conciliador de Pagos"
            viewBox="0 0 40 40"
            fill="none"
            className="w-10 h-10"
          >
            <circle cx="20" cy="20" r="18" stroke="hsl(175 55% 50%)" strokeWidth="2.5" />
            <path d="M12 15 Q20 10 28 15" stroke="hsl(175 55% 50%)" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d="M28 25 Q20 30 12 25" stroke="hsl(220 65% 65%)" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d="M28 11 L28 16 L23 16" stroke="hsl(175 55% 50%)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M12 29 L12 24 L17 24" stroke="hsl(220 65% 65%)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">Conciliador</h1>
            <p className="text-blue-300/70 text-xs">de Pagos Bancarios</p>
          </div>
        </div>

        <Card className="border-slate-700/50 bg-slate-900/80 backdrop-blur shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-white text-lg">Iniciar sesión</CardTitle>
            <CardDescription className="text-slate-400 text-sm">
              Ingresa tus credenciales para continuar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-slate-300 text-sm">Correo electrónico</Label>
                <Input
                  id="email"
                  data-testid="input-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-teal-500"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-slate-300 text-sm">Contraseña</Label>
                <Input
                  id="password"
                  data-testid="input-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-teal-500"
                  required
                />
              </div>
              <Button
                type="submit"
                data-testid="button-login"
                className="w-full bg-teal-600 hover:bg-teal-500 text-white font-medium mt-2"
                disabled={loading}
              >
                {loading ? "Verificando..." : "Ingresar"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-slate-600 text-xs mt-6">
          <a href="https://www.perplexity.ai/computer" target="_blank" rel="noopener noreferrer" className="hover:text-slate-400 transition-colors">
            Created with Perplexity Computer
          </a>
        </p>
      </div>
    </div>
  );
}
