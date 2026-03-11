import { Switch, Route } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import RegistrarPago from "@/pages/RegistrarPago";
import Conciliacion from "@/pages/Conciliacion";
import Usuarios from "@/pages/Usuarios";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import PerplexityAttribution from "@/components/PerplexityAttribution";

function AppRoutes() {
  const { user } = useAuth();
  if (!user) return <Login />;
  return (
    <Layout>
      <Switch hook={useHashLocation}>
        <Route path="/" component={Dashboard} />
        <Route path="/registrar" component={RegistrarPago} />
        <Route path="/conciliacion" component={Conciliacion} />
        <Route path="/usuarios" component={Usuarios} />
        <Route component={NotFound} />
      </Switch>
      <PerplexityAttribution />
    </Layout>
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
