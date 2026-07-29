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

/**
 * RoleRoute — renders `component` only when the current user has one of the
 * allowed roles.  An optional `extraCheck` predicate supports additional
 * per-route conditions (e.g. the `solicitudes` feature flag on vendedor).
 * When access is denied the user sees a friendly "No autorizado" screen.
 */
function RoleRoute({
  component: Component,
  allowedRoles,
  extraCheck,
}: {
  component: () => JSX.Element;
  allowedRoles: string[];
  extraCheck?: (user: NonNullable<ReturnType<typeof useAuth>["user"]>) => boolean;
}) {
  const { user } = useAuth();
  const allowed =
    user &&
    allowedRoles.includes(user.rol) &&
    (extraCheck ? extraCheck(user) : true);

  if (!allowed) {
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
          {/* Accessible to all authenticated roles */}
          <Route path="/" component={Dashboard} />

          {/* admin, vendedor, supervisor_caja */}
          <Route path="/registrar">
            {() => (
              <RoleRoute
                component={RegistrarPago}
                allowedRoles={["admin", "vendedor", "supervisor_caja"]}
              />
            )}
          </Route>

          {/* admin, vendedor, supervisor_caja */}
          <Route path="/registrar-divisas">
            {() => (
              <RoleRoute
                component={RegistrarDivisas}
                allowedRoles={["admin", "vendedor", "supervisor_caja"]}
              />
            )}
          </Route>

          {/* admin, contabilidad, supervisor_caja, vendedor */}
          <Route path="/upload-cashea">
            {() => (
              <RoleRoute
                component={UploadCashea}
                allowedRoles={["admin", "contabilidad", "supervisor_caja", "vendedor"]}
              />
            )}
          </Route>

          {/* admin, contabilidad, cajero, vendedor, supervisor_caja */}
          <Route path="/conciliacion">
            {() => (
              <RoleRoute
                component={Conciliacion}
                allowedRoles={["admin", "contabilidad", "cajero", "vendedor", "supervisor_caja"]}
              />
            )}
          </Route>

          {/* admin only */}
          <Route path="/usuarios">
            {() => <RoleRoute component={Usuarios} allowedRoles={["admin"]} />}
          </Route>

          {/* admin, compras — and vendedor only when solicitudes feature flag is on */}
          <Route path="/solicitudes">
            {() => (
              <RoleRoute
                component={Solicitudes}
                allowedRoles={["admin", "vendedor", "compras"]}
                extraCheck={(u) => u.rol !== "vendedor" || Boolean(u.solicitudes)}
              />
            )}
          </Route>

          {/* admin, compras */}
          <Route path="/dashboard-solicitudes">
            {() => (
              <RoleRoute
                component={DashboardSolicitudes}
                allowedRoles={["admin", "compras"]}
              />
            )}
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
