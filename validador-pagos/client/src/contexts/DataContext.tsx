import { createContext, useContext, useState, type ReactNode } from "react";

export interface Pago {
  id: number;
  fechaPago: string;
  bancoEmisor: string;
  monto: string;
  celular: string;
  bancoReceptor: string;
  referencia: string;
  rif: string;
  factura: string;
  tipoPago: string;
  estado: string;
  validadoPor: string;
  vendedor: string;
  observaciones: string;
  creadoEn: string;
}

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  password: string;
  rol: string;
  activo: string;
}

const INITIAL_USUARIOS: Usuario[] = [
  { id: 1, nombre: "Juan Admin",       email: "juan@onprotec.com",           password: "admin123", rol: "admin",        activo: "true" },
  { id: 2, nombre: "Contabilidad",     email: "contabilidad@onprotec.com",   password: "conta123", rol: "contabilidad", activo: "true" },
  { id: 3, nombre: "Vendedor 1",       email: "vendedor1@onprotec.com",      password: "vend123",  rol: "vendedor",     activo: "true" },
  { id: 4, nombre: "Vendedor 2",       email: "vendedor2@onprotec.com",      password: "vend123",  rol: "vendedor",     activo: "true" },
  { id: 5, nombre: "Vendedor 3",       email: "vendedor3@onprotec.com",      password: "vend123",  rol: "vendedor",     activo: "true" },
  { id: 6, nombre: "Vendedor 4",       email: "vendedor4@onprotec.com",      password: "vend123",  rol: "vendedor",     activo: "true" },
  { id: 7, nombre: "Milagros Morales", email: "m.morales@onprotec.com",      password: "vend123",  rol: "vendedor",     activo: "true" },
];

const INITIAL_PAGOS: Pago[] = [
  { id: 1, fechaPago: "2026-03-11", bancoEmisor: "0102 Banco de Venezuela", monto: "555.00",   celular: "0424-2318804", bancoReceptor: "0102 Banco de Venezuela", referencia: "285689", rif: "J406854492", factura: "", tipoPago: "PagoMovil",     estado: "Pendiente",  validadoPor: "",                  vendedor: "vendedor1@onprotec.com", observaciones: "",                  creadoEn: "2026-03-11T10:00:00" },
  { id: 2, fechaPago: "2026-03-10", bancoEmisor: "0105 Banco Mercantil",    monto: "5000.00",  celular: "0414-8956325", bancoReceptor: "0102 Banco de Venezuela", referencia: "",       rif: "",            factura: "", tipoPago: "PagoMovil",     estado: "Verificado", validadoPor: "juan@onprotec.com", vendedor: "m.morales@onprotec.com", observaciones: "",                  creadoEn: "2026-03-10T09:00:00" },
  { id: 3, fechaPago: "2026-03-10", bancoEmisor: "0105 Banco Mercantil",    monto: "98500.00", celular: "",            bancoReceptor: "0134 Banesco",           referencia: "154839", rif: "",            factura: "", tipoPago: "Transferencia", estado: "Rechazado",  validadoPor: "juan@onprotec.com", vendedor: "m.morales@onprotec.com", observaciones: "Referencia no coincide", creadoEn: "2026-03-10T08:00:00" },
  { id: 4, fechaPago: "2026-03-06", bancoEmisor: "0151 Banco Fondo Común",  monto: "9500.00",  celular: "",            bancoReceptor: "0102 Banco de Venezuela", referencia: "2345690",rif: "",            factura: "", tipoPago: "Transferencia", estado: "Pendiente",  validadoPor: "",                  vendedor: "vendedor2@onprotec.com", observaciones: "",                  creadoEn: "2026-03-06T11:00:00" },
];

interface DataContextType {
  pagos: Pago[];
  usuarios: Usuario[];
  addPago: (pago: Omit<Pago, "id" | "creadoEn">) => { ok: boolean; error?: string; duplicado?: Partial<Pago> };
  updatePagoEstado: (id: number, estado: string, validadoPor: string, observaciones: string) => void;
  deletePago: (id: number) => void;
  addUsuario: (u: Omit<Usuario, "id">) => { ok: boolean; error?: string };
  updateUsuario: (id: number, data: Partial<Usuario>) => void;
  login: (email: string, password: string) => Usuario | null;
}

const DataContext = createContext<DataContextType>({} as DataContextType);

export function DataProvider({ children }: { children: ReactNode }) {
  const [pagos, setPagos]       = useState<Pago[]>(INITIAL_PAGOS);
  const [usuarios, setUsuarios] = useState<Usuario[]>(INITIAL_USUARIOS);
  const [nextPagoId, setNextPagoId] = useState(5);
  const [nextUserId, setNextUserId] = useState(8);

  const addPago = (pago: Omit<Pago, "id" | "creadoEn">) => {
    // Check duplicate by referencia
    if (pago.referencia && pago.referencia.trim() !== "") {
      const dup = pagos.find(
        p => p.referencia.trim() === pago.referencia.trim() && p.tipoPago === pago.tipoPago
      );
      if (dup) return { ok: false, error: "duplicado", duplicado: dup };
    }
    // Check duplicate by monto+fecha+tipo for PagoMovil
    if (pago.tipoPago === "PagoMovil") {
      const dup = pagos.find(
        p => p.monto === pago.monto && p.fechaPago === pago.fechaPago && p.tipoPago === pago.tipoPago
      );
      if (dup) return { ok: false, error: "duplicado", duplicado: dup };
    }
    const newPago: Pago = { ...pago, id: nextPagoId, creadoEn: new Date().toISOString() };
    setPagos(prev => [newPago, ...prev]);
    setNextPagoId(n => n + 1);
    return { ok: true };
  };

  const updatePagoEstado = (id: number, estado: string, validadoPor: string, observaciones: string) => {
    setPagos(prev => prev.map(p => p.id === id ? { ...p, estado, validadoPor, observaciones } : p));
  };

  const deletePago = (id: number) => {
    setPagos(prev => prev.filter(p => p.id !== id));
  };

  const addUsuario = (u: Omit<Usuario, "id">) => {
    if (usuarios.find(x => x.email === u.email)) {
      return { ok: false, error: "El email ya está registrado" };
    }
    const newUser: Usuario = { ...u, id: nextUserId };
    setUsuarios(prev => [...prev, newUser]);
    setNextUserId(n => n + 1);
    return { ok: true };
  };

  const updateUsuario = (id: number, data: Partial<Usuario>) => {
    setUsuarios(prev => prev.map(u => u.id === id ? { ...u, ...data } : u));
  };

  const login = (email: string, password: string): Usuario | null => {
    const u = usuarios.find(x => x.email === email && x.password === password && x.activo === "true");
    return u ?? null;
  };

  return (
    <DataContext.Provider value={{ pagos, usuarios, addPago, updatePagoEstado, deletePago, addUsuario, updateUsuario, login }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  return useContext(DataContext);
}
