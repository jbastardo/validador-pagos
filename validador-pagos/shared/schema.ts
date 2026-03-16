import { pgTable, serial, text, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const tipoPagoEnum = pgEnum("tipo_pago", ["PagoMovil", "Transferencia"]);
export const estadoEnum = pgEnum("estado", ["Pendiente", "Verificado", "Rechazado"]);

// Tabla principal de pagos
export const pagos = pgTable("pagos", {
  id: serial("id").primaryKey(),
  fechaPago: text("fecha_pago").notNull(),
  bancoEmisor: text("banco_emisor").notNull(),
  monto: text("monto").notNull(),
  celular: text("celular"),
  bancoReceptor: text("banco_receptor").notNull(),
  referencia: text("referencia"),
  rif: text("rif"),
  factura: text("factura"),
  tipoPago: text("tipo_pago").notNull(), // "PagoMovil" | "Transferencia"
  estado: text("estado").notNull().default("Pendiente"), // "Pendiente" | "Verificado" | "Rechazado"
  validadoPor: text("validado_por"),
  vendedor: text("vendedor").notNull(),
  observaciones: text("observaciones"),
  creadoEn: timestamp("creado_en").defaultNow(),
});

export const insertPagoSchema = createInsertSchema(pagos).omit({
  id: true,
  creadoEn: true,
});

export type InsertPago = z.infer<typeof insertPagoSchema>;
export type Pago = typeof pagos.$inferSelect;

// Tabla de usuarios (vendedores y contabilidad)
export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  rol: text("rol").notNull().default("vendedor"), // "vendedor" | "contabilidad" | "admin"
  activo: text("activo").notNull().default("true"),
  creadoEn: timestamp("creado_en").defaultNow(),
});

export const insertUsuarioSchema = createInsertSchema(usuarios).omit({
  id: true,
  creadoEn: true,
});

export type InsertUsuario = z.infer<typeof insertUsuarioSchema>;
export type Usuario = typeof usuarios.$inferSelect;

// ─── BANCOS (fuente única de verdad) ─────────────────────────────────────────
export const BANCOS_EMISOR = [
  "0102 Banco de Venezuela",
  "0104 Venezolano de Crédito",
  "0105 Banco Mercantil",
  "0108 Banco Provincial",
  "0114 Bancaribe",
  "0115 Banco Exterior",
  "0116 Banco Occidental de Descuento",
  "0128 Banco Caroní",
  "0134 Banesco",
  "0137 Banco Sofitasa",
  "0138 Banco Plaza",
  "0146 Bangente",
  "0149 Banco del Pueblo Soberano",
  "0151 BFC Banco Fondo Común",
  "0156 100% Banco",
  "0157 DELSUR Banco Universal",
  "0163 Banco del Tesoro",
  "0166 Banco Agrícola de Venezuela",
  "0168 Bancrecer",
  "0169 Mi Banco",
  "0171 Banco Activo",
  "0172 Bancamiga",
  "0174 Banplus",
  "0175 Bicentenario Banco Universal",
  "0177 Banfanb",
  "0191 BNC (Banco Nacional de Crédito)",
];

export const BANCOS_RECEPTOR = [
  "0102 Banco de Venezuela",
  "0134 Banesco",
  "0191 BNC (Banco Nacional de Crédito)",
];

export const BANCOS_RECEPTOR_META = [
  { codigo: "0102", nombre: "Banco de Venezuela", color: "blue" },
  { codigo: "0134", nombre: "Banesco",            color: "violet" },
  { codigo: "0191", nombre: "BNC",                color: "emerald" },
];

export function extractBancoCode(s: string): string {
  return (s || "").trim().substring(0, 4);
}
