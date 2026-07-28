-- =============================================================================
-- reset-coolify-db.sql
-- Recrea el schema correcto en el DB de Coolify, compatible con validador-pagos
-- y con el conciliador-pagos.
--
-- EJECUTAR DESDE: Coolify UI → Projects → Apps Tecnotienda → validador-pagos-db → Terminal
--
-- En la terminal del container:
--   psql "$POSTGRES_URL" -f reset-coolify-db.sql
--
-- O pegar directamente en el shell de psql:
--   psql "$POSTGRES_URL"
--   \i reset-coolify-db.sql
-- =============================================================================

BEGIN;

-- 1. Eliminar tablas existentes (creadas por migrations del conciliador)
DROP TABLE IF EXISTS conciliaciones     CASCADE;
DROP TABLE IF EXISTS extractos          CASCADE;
DROP TABLE IF EXISTS pagos              CASCADE;
DROP TABLE IF EXISTS pagos_divisas      CASCADE;
DROP TABLE IF EXISTS pagos_validador    CASCADE;
DROP TABLE IF EXISTS solicitudes        CASCADE;
DROP TABLE IF EXISTS usuarios           CASCADE;

-- 2. Eliminar secuencias si quedaron huérfanas
DROP SEQUENCE IF EXISTS pagos_id_seq         CASCADE;
DROP SEQUENCE IF EXISTS pagos_divisas_id_seq CASCADE;
DROP SEQUENCE IF EXISTS solicitudes_id_seq   CASCADE;
DROP SEQUENCE IF EXISTS usuarios_id_seq      CASCADE;

-- 3. Eliminar drizzle migrations table para que el conciliador no intente correr
--    migrations sobre el schema incorrecto
DROP TABLE IF EXISTS "__drizzle_migrations" CASCADE;

-- =============================================================================
-- 4. Crear schema correcto (compatible con Railway / validador-pagos)
-- =============================================================================

CREATE TABLE pagos (
    id              serial          PRIMARY KEY,
    fecha_pago      text            NOT NULL,
    tipo_pago       text            NOT NULL,
    banco_emisor    text            NOT NULL,
    monto           text            NOT NULL,
    celular         text,
    banco_receptor  text            NOT NULL,
    referencia      text,
    rif             text,
    factura         text,
    estado          text            NOT NULL DEFAULT 'Pendiente',
    validado_por    text,
    vendedor        text            NOT NULL,
    observaciones   text,
    creado_en       timestamp       DEFAULT NOW(),
    cliente         text,
    megasoft        text,
    validado_en     timestamp,
    conciliado_en   timestamp,
    conciliado_por  text,
    registrado_por  text            NOT NULL DEFAULT '',
    conciliado_con  text            NOT NULL DEFAULT ''
);

CREATE TABLE pagos_divisas (
    id              serial          PRIMARY KEY,
    fecha           text            NOT NULL,
    nombre_pagador  text            NOT NULL,
    correo          text,
    monto           text            NOT NULL,
    tipo            text            NOT NULL,
    referencia      text,
    cliente         text,
    rif             text,
    factura         text,
    observaciones   text,
    estado          text            NOT NULL DEFAULT 'Pendiente',
    validado_por    text,
    vendedor        text            NOT NULL,
    creado_en       timestamp       DEFAULT NOW(),
    validado_en     timestamp
);

CREATE TABLE solicitudes (
    id                  serial      PRIMARY KEY,
    vendedor            text        NOT NULL,
    cliente             text        NOT NULL,
    celular             text,
    sku                 text,
    producto            text        NOT NULL,
    cantidad            text        NOT NULL,
    fecha_tope          text,
    observaciones       text,
    estado              text        NOT NULL DEFAULT 'Pendiente',
    creado_en           timestamp   DEFAULT NOW(),
    observaciones_compras text,
    actualizado_en      timestamp,
    respondido_por      text,
    categoria           text
);

CREATE TABLE usuarios (
    id              serial          PRIMARY KEY,
    nombre          text            NOT NULL,
    email           text            NOT NULL UNIQUE,
    password        text            NOT NULL,
    rol             text            NOT NULL DEFAULT 'vendedor',
    activo          text            NOT NULL DEFAULT 'true',
    solicitudes     text            NOT NULL DEFAULT 'false',
    telegram_chat_id text,
    creado_en       timestamp       DEFAULT NOW()
);

CREATE TABLE extractos (
    id              text            PRIMARY KEY,
    banco           text            NOT NULL DEFAULT '',
    fecha           text            NOT NULL DEFAULT '',
    monto           text            NOT NULL DEFAULT '',
    referencia      text,
    celular         text,
    descripcion     text,
    subido_por      text            NOT NULL DEFAULT '',
    subido_en       text            NOT NULL DEFAULT '',
    usado           text            NOT NULL DEFAULT 'false',
    tipo            text            NOT NULL DEFAULT '',
    creado_en       text            NOT NULL DEFAULT '',
    archivo_origen  text            NOT NULL DEFAULT ''
);

CREATE TABLE conciliaciones (
    id                  text        PRIMARY KEY,
    fecha               text        NOT NULL DEFAULT '',
    pago_id             text        NOT NULL DEFAULT '',
    extracto_id         text        NOT NULL DEFAULT '',
    referencia_pago     text        NOT NULL DEFAULT '',
    referencia_extracto text        NOT NULL DEFAULT '',
    monto_pago          numeric     NOT NULL DEFAULT 0,
    monto_extracto      numeric     NOT NULL DEFAULT 0,
    banco               text        NOT NULL DEFAULT '',
    cliente             text        NOT NULL DEFAULT '',
    conciliado_por      text        NOT NULL DEFAULT '',
    conciliado_en       text        NOT NULL DEFAULT '',
    tipo                text        NOT NULL DEFAULT '',
    estado              text        NOT NULL DEFAULT '',
    observaciones       text        NOT NULL DEFAULT ''
);

CREATE TABLE pagos_validador (
    id              text            PRIMARY KEY,
    numeric_id      integer,
    fecha_pago      text            DEFAULT '',
    tipo_pago       text            DEFAULT '',
    banco_emisor    text            DEFAULT '',
    monto           text            DEFAULT '',
    celular         text            DEFAULT '',
    banco_receptor  text            DEFAULT '',
    referencia      text            DEFAULT '',
    rif             text            DEFAULT '',
    factura         text            DEFAULT '',
    estado          text            DEFAULT '',
    validado_por    text            DEFAULT '',
    vendedor        text            DEFAULT '',
    observaciones   text            DEFAULT '',
    creado_en       text            DEFAULT '',
    cliente         text            DEFAULT '',
    megasoft        text            DEFAULT '',
    validado_en     text            DEFAULT '',
    conciliado_en   text            DEFAULT '',
    conciliado_por  text            DEFAULT ''
);

-- =============================================================================
-- 5. Marcar las 3 migrations del conciliador como ya ejecutadas
--    Esto evita que el conciliador intente re-correr sus migrations
--    (que tienen schemas incompatibles) la próxima vez que arranque.
-- =============================================================================

CREATE TABLE "__drizzle_migrations" (
    id          serial      PRIMARY KEY,
    hash        text        NOT NULL,
    created_at  bigint
);

INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES
  ('0000_create_tables',        EXTRACT(EPOCH FROM NOW())::bigint * 1000),
  ('0001_add_missing_columns',  EXTRACT(EPOCH FROM NOW())::bigint * 1000),
  ('0002_rename_columns',       EXTRACT(EPOCH FROM NOW())::bigint * 1000);

COMMIT;

-- Verificar
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
SELECT 'pagos.id type: ' || data_type FROM information_schema.columns WHERE table_name='pagos' AND column_name='id';
