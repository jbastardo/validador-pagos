import {
  pgTable,
  text,
  numeric,
  integer,
} from "drizzle-orm/pg-core";

// ─── Drizzle table definitions ────────────────────────────────────────────────

export const usuariosTable = pgTable("usuarios", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull().default(""),
  email: text("email").notNull().default(""),
  password: text("password").notNull().default(""),
  rol: text("rol").notNull().default("operador"),
  activo: text("activo").notNull().default("true"),
});

export const extractosTable = pgTable("extractos", {
  id: text("id").primaryKey(),
  fecha: text("fecha").notNull().default(""),
  banco: text("banco").notNull().default(""),
  referencia: text("referencia").notNull().default(""),
  monto: numeric("monto").notNull().default("0"),
  descripcion: text("descripcion").notNull().default(""),
  tipo: text("tipo").notNull().default(""),
  creadoEn: text("creado_en").notNull().default(""),
  archivoOrigen: text("archivo_origen").notNull().default(""),
  // cargado_por is the actual column name in the DB (created by migration 0000/0001).
  // Migration 0002 renames it to subido_por; both names are handled safely.
  subidoPor: text("subido_por").notNull().default(""),
  // subido_en was added manually to the DB outside of migrations (NOT NULL, no default).
  // Migration 0002 adds DEFAULT '' so inserts that omit this field don't fail.
  subidoEn: text("subido_en").notNull().default(""),
});

export const pagosTable = pgTable("pagos", {
  id: text("id").primaryKey(),
  fecha: text("fecha").notNull().default(""),
  banco: text("banco").notNull().default(""),
  referencia: text("referencia").notNull().default(""),
  monto: numeric("monto").notNull().default("0"),
  cliente: text("cliente").notNull().default(""),
  rif: text("rif").notNull().default(""),
  factura: text("factura").notNull().default(""),
  estado: text("estado").notNull().default("Pendiente"),
  registradoPor: text("registrado_por").notNull().default(""),
  observaciones: text("observaciones").notNull().default(""),
  conciliadoCon: text("conciliado_con").notNull().default(""),
  creadoEn: text("creado_en").notNull().default(""),
});

export const conciliacionesTable = pgTable("conciliaciones", {
  id: text("id").primaryKey(),
  fecha: text("fecha").notNull().default(""),
  pagoId: text("pago_id").notNull().default(""),
  extractoId: text("extracto_id").notNull().default(""),
  referenciaPago: text("referencia_pago").notNull().default(""),
  referenciaExtracto: text("referencia_extracto").notNull().default(""),
  montoPago: numeric("monto_pago").notNull().default("0"),
  montoExtracto: numeric("monto_extracto").notNull().default("0"),
  banco: text("banco").notNull().default(""),
  cliente: text("cliente").notNull().default(""),
  conciliadoPor: text("conciliado_por").notNull().default(""),
  conciliadoEn: text("conciliado_en").notNull().default(""),
  tipo: text("tipo").notNull().default(""),
  estado: text("estado").notNull().default(""),
  observaciones: text("observaciones").notNull().default(""),
});

export const pagosValidadorTable = pgTable("pagos_validador", {
  id: text("id").primaryKey(),
  numericId: integer("numeric_id"),
  fechaPago: text("fecha_pago").default(""),
  tipoPago: text("tipo_pago").default(""),
  bancoEmisor: text("banco_emisor").default(""),
  monto: text("monto").default(""),
  celular: text("celular").default(""),
  bancoReceptor: text("banco_receptor").default(""),
  referencia: text("referencia").default(""),
  rif: text("rif").default(""),
  factura: text("factura").default(""),
  estado: text("estado").default(""),
  validadoPor: text("validado_por").default(""),
  vendedor: text("vendedor").default(""),
  observaciones: text("observaciones").default(""),
  creadoEn: text("creado_en").default(""),
  cliente: text("cliente").default(""),
  megasoft: text("megasoft").default(""),
  validadoEn: text("validado_en").default(""),
  conciliadoEn: text("conciliado_en").default(""),
  conciliadoPor: text("conciliado_por").default(""),
});

// ─── TypeScript types derived from tables ─────────────────────────────────────
export type InsertUsuario = typeof usuariosTable.$inferInsert;
export type SelectUsuario = typeof usuariosTable.$inferSelect;

// Legacy User type for storage.ts compatibility
export interface User {
  id: string;
  username: string;
}
export interface InsertUser {
  username: string;
}

// ─── Tipos compartidos frontend/backend

export interface Usuario {
  username: string;
  rol: string; // "admin" | "supervisor" | "operador"
  nombre: string;
}

export interface Extracto {
  id: string;
  fecha: string;
  banco: string;
  referencia: string;
  monto: number;
  descripcion: string;
  tipo: "ingreso" | "debito" | "comision";
  creadoEn: string;
  archivoOrigen: string;
  subidoPor: string;
  subidoEn: string;
}

export interface Pago {
  id: string;
  fecha: string;
  banco: string;
  referencia: string;
  monto: number;
  cliente: string;
  rif: string;
  factura: string;
  estado: "Pendiente" | "Conciliado" | "NoConciliado";
  registradoPor: string;
  observaciones: string;
  conciliadoCon: string;
  creadoEn: string;
}

export interface Stats {
  totalPagos: number;
  pendientes: number;
  conciliados: number;
  noConciliados: number;
  totalExtractos: number;
  extractosSinMatch: number;
}

export interface BuscarMatchResult {
  exacto: Extracto | null;
  parciales: Extracto[];
}

export const BANCOS = [
  { codigo: "0102", nombre: "Banco de Venezuela" },
  { codigo: "0134", nombre: "Banesco" },
  { codigo: "0191", nombre: "BNC (Banco Nacional de Crédito)" },
];

export function extractBancoCode(s: string): string {
  return (s || "").trim().substring(0, 4);
}

export function getBancoNombre(codigo: string) {
  const code = extractBancoCode(codigo);
  const b = BANCOS.find((b) => b.codigo === code);
  return b ? b.nombre : codigo;
}

export function formatMonto(n: number) {
  return new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function formatFecha(s: string) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}
