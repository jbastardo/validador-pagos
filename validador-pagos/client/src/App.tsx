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
import Extractos from "@/pages/Extractos";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import PerplexityAttribution from "@/components/PerplexityAttribution";
import Solicitudes from "@/pages/Solicitudes";

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
          <Route path="/conciliacion" component={Conciliacion} />
          <Route path="/usuarios" component={Usuarios} />
          <Route path="/extractos" component={Extractos} />
          <Route path="/solicitudes" component={Solicitudes} />
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
