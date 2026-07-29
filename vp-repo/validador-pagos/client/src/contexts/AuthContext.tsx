import { createContext, useContext, useState, type ReactNode } from "react";

interface AuthUser {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  solicitudes?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  permissions: Record<string, boolean>;
  hasPermission: (pagina: string) => boolean;
  login: (user: AuthUser, permissions: Record<string, boolean>) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  permissions: {},
  hasPermission: () => false,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  const login = (u: AuthUser, perms: Record<string, boolean>) => {
    setUser(u);
    setPermissions(perms);
  };

  const logout = () => {
    setUser(null);
    setPermissions({});
  };

  // admin always has access to everything regardless of DB values
  const hasPermission = (pagina: string): boolean => {
    if (!user) return false;
    if (user.rol === "admin") return true;
    return permissions[pagina] === true;
  };

  return (
    <AuthContext.Provider value={{ user, permissions, hasPermission, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
