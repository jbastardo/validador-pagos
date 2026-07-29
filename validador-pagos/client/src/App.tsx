// App.tsx

import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import RegistrarPago from "@/pages/RegistrarPago";
import RegistrarDivisas from "@/pages/RegistrarDivisas";
import Conciliacion from "@/pages/Conciliacion";
import Usuarios from "@/pages/Usuarios";
import UploadCashea from "@/pages/UploadCashea";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import PerplexityAttribution from "@/components/PerplexityAttribution";
import Solicitudes from "@/pages/Solicitudes";
import DashboardSolicitudes from "@/pages/DashboardSolicitudes";
import Permisos from "@/pages/Permisos";

/**
 * PermRoute — renders `component` only when the current user has permission
 * for the given page key (checked against server-loaded permissions).
 * Admin role always has access to everything.
 */
function PermRoute({
  component: Component,
  pagina,
}: {
  component: () => JSX.Element;
  pagina: string;
}) {
  const { hasPermission } = useAuth();

  if (!hasPermission(pagina)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <div className="text-4xl">🚫</div>
        <h2 className="text-xl font-semibold text-foreground">No autorizado</h2>
        <p className="text-muted-foreground">No tienes permiso para acceder a esta página.</p>
      </div>
    );
  }
  return <Component />;
}

function AppRoutes() {
  const { user } = useAuth();
  if (!user) return <Login />;
  return (
    <Router hook={useHashLocation}>
      <Layout>
        <Switch>
          {/* Accesible a todos los roles autenticados */}
          <Route path="/">
            {() => <PermRoute component={Dashboard} pagina="dashboard" />}
          </Route>

          <Route path="/registrar">
            {() => <PermRoute component={RegistrarPago} pagina="registrar" />}
          </Route>

          <Route path="/registrar-divisas">
            {() => <PermRoute component={RegistrarDivisas} pagina="registrar-divisas" />}
          </Route>

          <Route path="/upload-cashea">
            {() => <PermRoute component={UploadCashea} pagina="upload-cashea" />}
          </Route>

          <Route path="/conciliacion">
            {() => <PermRoute component={Conciliacion} pagina="conciliacion" />}
          </Route>

          <Route path="/usuarios">
            {() => <PermRoute component={Usuarios} pagina="usuarios" />}
          </Route>

          <Route path="/solicitudes">
            {() => <PermRoute component={Solicitudes} pagina="solicitudes" />}
          </Route>

          <Route path="/dashboard-solicitudes">
            {() => <PermRoute component={DashboardSolicitudes} pagina="dashboard-solicitudes" />}
          </Route>

          {/* Permisos de roles: solo admin (hardcoded, no modificable desde la UI) */}
          <Route path="/permisos">
            {() => {
              const { user: u } = useAuth();
              if (u?.rol !== "admin") {
                return (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
                    <div className="text-4xl">🚫</div>
                    <h2 className="text-xl font-semibold text-foreground">No autorizado</h2>
                    <p className="text-muted-foreground">Solo administradores pueden acceder a esta página.</p>
                  </div>
                );
              }
              return <Permisos />;
            }}
          </Route>

          <Route component={NotFound} />
        </Switch>
        <PerplexityAttribution />
      </Layout>
    </Router>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRoutes />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
