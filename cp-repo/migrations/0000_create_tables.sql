CREATE TABLE IF NOT EXISTS "usuarios" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"password" text DEFAULT '' NOT NULL,
	"rol" text DEFAULT 'operador' NOT NULL,
	"activo" text DEFAULT 'true' NOT NULL
);

CREATE TABLE IF NOT EXISTS "extractos" (
	"id" text PRIMARY KEY NOT NULL,
	"fecha" text DEFAULT '' NOT NULL,
	"banco" text DEFAULT '' NOT NULL,
	"referencia" text DEFAULT '' NOT NULL,
	"monto" numeric DEFAULT '0' NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"tipo" text DEFAULT '' NOT NULL,
	"creado_en" text DEFAULT '' NOT NULL,
	"archivo_origen" text DEFAULT '' NOT NULL,
	"subido_por" text DEFAULT '' NOT NULL
);

CREATE TABLE IF NOT EXISTS "pagos" (
	"id" text PRIMARY KEY NOT NULL,
	"fecha" text DEFAULT '' NOT NULL,
	"banco" text DEFAULT '' NOT NULL,
	"referencia" text DEFAULT '' NOT NULL,
	"monto" numeric DEFAULT '0' NOT NULL,
	"cliente" text DEFAULT '' NOT NULL,
	"rif" text DEFAULT '' NOT NULL,
	"factura" text DEFAULT '' NOT NULL,
	"estado" text DEFAULT 'Pendiente' NOT NULL,
	"registrado_por" text DEFAULT '' NOT NULL,
	"observaciones" text DEFAULT '' NOT NULL,
	"conciliado_con" text DEFAULT '' NOT NULL,
	"creado_en" text DEFAULT '' NOT NULL
);

CREATE TABLE IF NOT EXISTS "conciliaciones" (
	"id" text PRIMARY KEY NOT NULL,
	"fecha" text DEFAULT '' NOT NULL,
	"pago_id" text DEFAULT '' NOT NULL,
	"extracto_id" text DEFAULT '' NOT NULL,
	"referencia_pago" text DEFAULT '' NOT NULL,
	"referencia_extracto" text DEFAULT '' NOT NULL,
	"monto_pago" numeric DEFAULT '0' NOT NULL,
	"monto_extracto" numeric DEFAULT '0' NOT NULL,
	"banco" text DEFAULT '' NOT NULL,
	"cliente" text DEFAULT '' NOT NULL,
	"conciliado_por" text DEFAULT '' NOT NULL,
	"conciliado_en" text DEFAULT '' NOT NULL,
	"tipo" text DEFAULT '' NOT NULL,
	"estado" text DEFAULT '' NOT NULL,
	"observaciones" text DEFAULT '' NOT NULL
);

CREATE TABLE IF NOT EXISTS "pagos_validador" (
	"id" text PRIMARY KEY NOT NULL,
	"numeric_id" integer,
	"fecha_pago" text DEFAULT '',
	"tipo_pago" text DEFAULT '',
	"banco_emisor" text DEFAULT '',
	"monto" text DEFAULT '',
	"celular" text DEFAULT '',
	"banco_receptor" text DEFAULT '',
	"referencia" text DEFAULT '',
	"rif" text DEFAULT '',
	"factura" text DEFAULT '',
	"estado" text DEFAULT '',
	"validado_por" text DEFAULT '',
	"vendedor" text DEFAULT '',
	"observaciones" text DEFAULT '',
	"creado_en" text DEFAULT '',
	"cliente" text DEFAULT '',
	"megasoft" text DEFAULT '',
	"validado_en" text DEFAULT '',
	"conciliado_en" text DEFAULT '',
	"conciliado_por" text DEFAULT ''
);
