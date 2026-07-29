import { useState } from "react";
import { Router, Route, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";

import type { Usuario } from "@shared/schema";
import LoginPage from "@/pages/LoginPage";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Extractos from "@/pages/Extractos";
import ImportarPagos from "@/pages/ImportarPagos";
import Historial from "@/pages/Historial";
import Usuarios from "@/pages/Usuarios";
import Conciliacion from "@/pages/Conciliacion";
import NotFound from "@/pages/not-found";

export default function App() {
  const [user, setUser] = useState<Usuario | null>(null);

  if (!user) {
    return (
      <QueryClientProvider client={queryClient}>
        <LoginPage onLogin={setUser} />
        <Toaster />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <Layout user={user} onLogout={() => setUser(null)}>
          <Switch>
            <Route path="/" component={() => <Dashboard user={user} />} />
            <Route path="/extractos" component={() => <Extractos user={user} />} />
            <Route path="/importar" component={() => <ImportarPagos user={user} />} />
            <Route path="/historial" component={() => <Historial user={user} />} />
            <Route path="/conciliacion" component={() => <Conciliacion user={user} />} />
            {user.rol === "admin" && (
              <Route path="/usuarios" component={() => <Usuarios user={user} />} />
            )}
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}
