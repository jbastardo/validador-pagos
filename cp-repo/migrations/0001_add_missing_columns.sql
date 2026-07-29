-- Migration: 0001_add_missing_columns
-- Adds any columns that may be missing from tables created outside of the
-- normal migration flow (e.g. if 0000_create_tables.sql ran only partially).
-- All statements use IF NOT EXISTS so they are safe to re-run.

-- ─── extractos ────────────────────────────────────────────────────────────────
ALTER TABLE "extractos" ADD COLUMN IF NOT EXISTS "descripcion" text NOT NULL DEFAULT '';
ALTER TABLE "extractos" ADD COLUMN IF NOT EXISTS "tipo" text NOT NULL DEFAULT '';
ALTER TABLE "extractos" ADD COLUMN IF NOT EXISTS "creado_en" text NOT NULL DEFAULT '';
ALTER TABLE "extractos" ADD COLUMN IF NOT EXISTS "archivo_origen" text NOT NULL DEFAULT '';
ALTER TABLE "extractos" ADD COLUMN IF NOT EXISTS "subido_por" text NOT NULL DEFAULT '';

-- ─── pagos ────────────────────────────────────────────────────────────────────
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "cliente" text NOT NULL DEFAULT '';
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "rif" text NOT NULL DEFAULT '';
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "factura" text NOT NULL DEFAULT '';
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "estado" text NOT NULL DEFAULT 'Pendiente';
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "registrado_por" text NOT NULL DEFAULT '';
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "observaciones" text NOT NULL DEFAULT '';
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "conciliado_con" text NOT NULL DEFAULT '';
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "creado_en" text NOT NULL DEFAULT '';

-- ─── usuarios ─────────────────────────────────────────────────────────────────
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "nombre" text NOT NULL DEFAULT '';
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "email" text NOT NULL DEFAULT '';
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "password" text NOT NULL DEFAULT '';
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "rol" text NOT NULL DEFAULT 'operador';
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "activo" text NOT NULL DEFAULT 'true';

-- ─── conciliaciones ───────────────────────────────────────────────────────────
ALTER TABLE "conciliaciones" ADD COLUMN IF NOT EXISTS "fecha" text NOT NULL DEFAULT '';
ALTER TABLE "conciliaciones" ADD COLUMN IF NOT EXISTS "pago_id" text NOT NULL DEFAULT '';
ALTER TABLE "conciliaciones" ADD COLUMN IF NOT EXISTS "extracto_id" text NOT NULL DEFAULT '';
ALTER TABLE "conciliaciones" ADD COLUMN IF NOT EXISTS "referencia_pago" text NOT NULL DEFAULT '';
ALTER TABLE "conciliaciones" ADD COLUMN IF NOT EXISTS "referencia_extracto" text NOT NULL DEFAULT '';
ALTER TABLE "conciliaciones" ADD COLUMN IF NOT EXISTS "monto_pago" numeric NOT NULL DEFAULT '0';
ALTER TABLE "conciliaciones" ADD COLUMN IF NOT EXISTS "monto_extracto" numeric NOT NULL DEFAULT '0';
ALTER TABLE "conciliaciones" ADD COLUMN IF NOT EXISTS "banco" text NOT NULL DEFAULT '';
ALTER TABLE "conciliaciones" ADD COLUMN IF NOT EXISTS "cliente" text NOT NULL DEFAULT '';
ALTER TABLE "conciliaciones" ADD COLUMN IF NOT EXISTS "conciliado_por" text NOT NULL DEFAULT '';
ALTER TABLE "conciliaciones" ADD COLUMN IF NOT EXISTS "conciliado_en" text NOT NULL DEFAULT '';
ALTER TABLE "conciliaciones" ADD COLUMN IF NOT EXISTS "tipo" text NOT NULL DEFAULT '';
ALTER TABLE "conciliaciones" ADD COLUMN IF NOT EXISTS "estado" text NOT NULL DEFAULT '';
ALTER TABLE "conciliaciones" ADD COLUMN IF NOT EXISTS "observaciones" text NOT NULL DEFAULT '';

-- ─── pagos_validador ──────────────────────────────────────────────────────────
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "numeric_id" integer;
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "fecha_pago" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "tipo_pago" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "banco_emisor" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "monto" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "celular" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "banco_receptor" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "referencia" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "rif" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "factura" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "estado" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "validado_por" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "vendedor" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "observaciones" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "creado_en" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "cliente" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "megasoft" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "validado_en" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "conciliado_en" text DEFAULT '';
ALTER TABLE "pagos_validador" ADD COLUMN IF NOT EXISTS "conciliado_por" text DEFAULT '';
