// App.tsx correcto:

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
import Solicitudes from "@/pages/Solicitudes"; import DashboardSolicitudes from "@/pages/DashboardSolicitudes";

function AdminRoute({ component: Component }: { component: () => JSX.Element }) {
  const { user } = useAuth();
  if (user?.rol !== "admin") {
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
          <Route path="/" component={Dashboard} />
          <Route path="/registrar" component={RegistrarPago} />
          <Route path="/registrar-divisas" component={RegistrarDivisas} />
          <Route path="/upload-cashea" component={UploadCashea} />
          <Route path="/conciliacion" component={Conciliacion} />
          <Route path="/usuarios">{() => <AdminRoute component={Usuarios} />}</Route>
          <Route path="/solicitudes" component={Solicitudes} />           <Route path="/dashboard-solicitudes" component={DashboardSolicitudes} />
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
