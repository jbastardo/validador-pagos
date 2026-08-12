import { pgTable, serial, text, numeric, timestamp, pgEnum, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const tipoPagoEnum = pgEnum("tipo_pago", ["PagoMovil", "Transferencia"]);
export const estadoPagoEnum = pgEnum("estado_pago", ["Pendiente", "Verificado", "Rechazado", "Rechazado Megasoft"]);
export const estadoSolicitudEnum = pgEnum("estado_solicitud", ["Pendiente", "En Proceso", "Completada", "Cancelada", "Agotado", "No Concretado"]);

// Tabla principal de pagos (BS)
export const pagos = pgTable("pagos", {
  id: serial("id").primaryKey(),
  fechaPago: text("fecha_pago").notNull(),
  tipoPago: text("tipo_pago").notNull(), // "PagoMovil" | "Transferencia"
  bancoEmisor: text("banco_emisor").notNull(),
  monto: text("monto").notNull(),
  celular: text("celular"),
  bancoReceptor: text("banco_receptor").notNull(),
  referencia: text("referencia"),
  rif: text("rif"),
  factura: text("factura"),
  estado: text("estado").notNull().default("Pendiente"), // "Pendiente" | "Verificado" | "Rechazado" | "Rechazado Megasoft"
  validadoPor: text("validado_por"),
  vendedor: text("vendedor").notNull(),
  observaciones: text("observaciones"),
  creadoEn: timestamp("creado_en").defaultNow(),
  cliente: text("cliente"),
  megasoft: text("megasoft"),
  validadoEn: timestamp("validado_en"),
  conciliadoEn: timestamp("conciliado_en"),
  conciliadoPor: text("conciliado_por"),
});

export const insertPagoSchema = createInsertSchema(pagos).omit({
  id: true,
  creadoEn: true,
  validadoEn: true,
  conciliadoEn: true,
});

export type InsertPago = z.infer<typeof insertPagoSchema>;
export type Pago = typeof pagos.$inferSelect;

// Tabla de usuarios
export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  rol: text("rol").notNull().default("vendedor"), // "vendedor" | "contabilidad" | "admin" | "cajero" | "compras" | "supervisor_caja"
  activo: text("activo").notNull().default("true"),
  solicitudes: text("solicitudes").notNull().default("false"),
  telegramChatId: text("telegram_chat_id"),
  creadoEn: timestamp("creado_en").defaultNow(),
});

export const insertUsuarioSchema = createInsertSchema(usuarios).omit({
  id: true,
  creadoEn: true,
});

export type InsertUsuario = z.infer<typeof insertUsuarioSchema>;
export type Usuario = typeof usuarios.$inferSelect;

// Tabla de pagos en divisas
export const pagosDivisas = pgTable("pagos_divisas", {
  id: serial("id").primaryKey(),
  fecha: text("fecha").notNull(),
  nombrePagador: text("nombre_pagador").notNull(),
  correo: text("correo"),
  monto: text("monto").notNull(),
  tipo: text("tipo").notNull(),
  referencia: text("referencia"),
  cliente: text("cliente"),
  rif: text("rif"),
  factura: text("factura"),
  observaciones: text("observaciones"),
  estado: text("estado").notNull().default("Pendiente"),
  validadoPor: text("validado_por"),
  vendedor: text("vendedor").notNull(),
  creadoEn: timestamp("creado_en").defaultNow(),
  validadoEn: timestamp("validado_en"),
});

export const insertPagoDivisaSchema = createInsertSchema(pagosDivisas).omit({
  id: true,
  creadoEn: true,
  validadoEn: true,
});

export type InsertPagoDivisa = z.infer<typeof insertPagoDivisaSchema>;
export type PagoDivisa = typeof pagosDivisas.$inferSelect;

// Tabla de solicitudes de productos
export const solicitudes = pgTable("solicitudes", {
  id: serial("id").primaryKey(),
  vendedor: text("vendedor").notNull(),
  cliente: text("cliente").notNull(),
  celular: text("celular"),
  sku: text("sku"),
  producto: text("producto").notNull(),
  cantidad: text("cantidad").notNull(),
  fechaTope: text("fecha_tope"),
  observaciones: text("observaciones"),
  estado: text("estado").notNull().default("Pendiente"),
  creadoEn: timestamp("creado_en").defaultNow(),
  observacionesCompras: text("observaciones_compras"),
  actualizadoEn: timestamp("actualizado_en"),
  respondidoPor: text("respondido_por"),
  categoria: text("categoria"),
});

export const insertSolicitudSchema = createInsertSchema(solicitudes).omit({
  id: true,
  creadoEn: true,
  actualizadoEn: true,
});

export type InsertSolicitud = z.infer<typeof insertSolicitudSchema>;
export type Solicitud = typeof solicitudes.$inferSelect;

// Tabla de mensajes de solicitudes (chat unificado web + Telegram)
export const solicitudMensajes = pgTable("solicitud_mensajes", {
  id: serial("id").primaryKey(),
  solicitudId: integer("solicitud_id").notNull(),
  autor: text("autor").notNull(),
  autorNombre: text("autor_nombre"),
  mensaje: text("mensaje"),
  adjuntoUrl: text("adjunto_url"),
  adjuntoNombre: text("adjunto_nombre"),
  adjuntoTipo: text("adjunto_tipo"),
  source: text("source").default("web"), // "web" | "telegram"
  creadoEn: timestamp("creado_en").defaultNow(),
});
export type SolicitudMensaje = typeof solicitudMensajes.$inferSelect;

// Tabla para rastrear mensajes de notificación enviados por Telegram
// Permite rutear respuestas al chat de la solicitud correcta
export const telegramNotificaciones = pgTable("telegram_notificaciones", {
  id: serial("id").primaryKey(),
  telegramMessageId: text("telegram_message_id").notNull(),
  solicitudId: integer("solicitud_id").notNull(),
  destinatarioEmail: text("destinatario_email"),
  creadoEn: timestamp("creado_en").defaultNow(),
});
export type TelegramNotificacion = typeof telegramNotificaciones.$inferSelect;


// Tabla de extractos bancarios (Conciliador)
export const extractos = pgTable("extractos", {
  id: text("id").primaryKey(),
  banco: text("banco").notNull(),
  fecha: text("fecha").notNull(),
  monto: text("monto").notNull(),
  referencia: text("referencia"),
  celular: text("celular"),
  descripcion: text("descripcion"),
  subidoPor: text("subido_por").notNull(),
  subidoEn: text("subido_en").notNull(),
  usado: text("usado").notNull().default("false"),
});

export const insertExtractoSchema = createInsertSchema(extractos);

export type InsertExtracto = z.infer<typeof insertExtractoSchema>;
export type Extracto = typeof extractos.$inferSelect;

// Tabla de permisos de roles (RBAC dinámico)
export const permisosRoles = pgTable("permisos_roles", {
  rol:       text("rol").notNull(),
  pagina:    text("pagina").notNull(),
  permitido: text("permitido").notNull().default("false"), // "true" | "false"
});

export type PermisoRol = typeof permisosRoles.$inferSelect;

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
