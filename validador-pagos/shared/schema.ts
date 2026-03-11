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
