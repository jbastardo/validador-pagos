#!/usr/bin/env bash
# =============================================================================
# migrate-data-to-coolify.sh
# Copia schema + datos desde Railway al PostgreSQL de Coolify.
# Ejecutar desde la TERMINAL DE COOLIFY o desde un contenedor dentro de la
# red Docker de Coolify (donde el hostname interno del DB es accesible).
#
# Uso:
#   bash migrate-data-to-coolify.sh
#
# Requiere: psql instalado en el contenedor/terminal donde se ejecuta.
# =============================================================================
set -euo pipefail

RAILWAY_DB="${RAILWAY_DB:-postgresql://postgres:<password>@switchyard.proxy.rlwy.net:38165/railway}"
COOLIFY_DB="${DATABASE_URL:-postgres://postgres:<password>@f4wkaziqfj8j8mmdemcej5wl:5432/railway}"

TABLES="conciliaciones extractos pagos pagos_divisas pagos_validador solicitudes usuarios"

echo "=========================================="
echo " Migración Railway → Coolify"
echo " $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=========================================="

# 1. Crear schema en Coolify DB
echo ""
echo "▶ Paso 1: Aplicando schema..."
psql "$COOLIFY_DB" <<'SQL'
-- Tablas
CREATE TABLE IF NOT EXISTS conciliaciones (id text NOT NULL, fecha text NOT NULL, pago_id text NOT NULL, extracto_id text NOT NULL, referencia_pago text NOT NULL, referencia_extracto text NOT NULL, monto_pago numeric NOT NULL, monto_extracto numeric NOT NULL, banco text NOT NULL, cliente text NOT NULL, conciliado_por text NOT NULL, conciliado_en text NOT NULL, tipo text NOT NULL, estado text NOT NULL, observaciones text NOT NULL);
CREATE TABLE IF NOT EXISTS extractos (id text NOT NULL, banco text NOT NULL, fecha text NOT NULL, monto text NOT NULL, referencia text, celular text, descripcion text, subido_por text NOT NULL, subido_en text NOT NULL, usado text NOT NULL, tipo text NOT NULL, creado_en text NOT NULL, archivo_origen text NOT NULL);
CREATE TABLE IF NOT EXISTS pagos (id int4 NOT NULL, fecha_pago text NOT NULL, tipo_pago text NOT NULL, banco_emisor text NOT NULL, monto text NOT NULL, celular text, banco_receptor text NOT NULL, referencia text, rif text, factura text, estado text NOT NULL, validado_por text, vendedor text NOT NULL, observaciones text, creado_en timestamp, cliente text, megasoft text, validado_en timestamp, conciliado_en timestamp, conciliado_por text, registrado_por text NOT NULL, conciliado_con text NOT NULL);
CREATE TABLE IF NOT EXISTS pagos_divisas (id int4 NOT NULL, fecha text NOT NULL, nombre_pagador text NOT NULL, correo text, monto text NOT NULL, tipo text NOT NULL, referencia text, cliente text, rif text, factura text, observaciones text, estado text NOT NULL, validado_por text, vendedor text NOT NULL, creado_en timestamp, validado_en timestamp);
CREATE TABLE IF NOT EXISTS pagos_validador (id text NOT NULL, numeric_id int4, fecha_pago text, tipo_pago text, banco_emisor text, monto text, celular text, banco_receptor text, referencia text, rif text, factura text, estado text, validado_por text, vendedor text, observaciones text, creado_en text, cliente text, megasoft text, validado_en text, conciliado_en text, conciliado_por text);
CREATE TABLE IF NOT EXISTS solicitudes (id int4 NOT NULL, vendedor text NOT NULL, cliente text NOT NULL, celular text, sku text, producto text NOT NULL, cantidad text NOT NULL, fecha_tope text, observaciones text, estado text NOT NULL, creado_en timestamp, observaciones_compras text, actualizado_en timestamp, respondido_por text, categoria text);
CREATE TABLE IF NOT EXISTS usuarios (id int4 NOT NULL, nombre text NOT NULL, email text NOT NULL, password text NOT NULL, rol text NOT NULL, activo text NOT NULL, solicitudes text NOT NULL, telegram_chat_id text, creado_en timestamp);

-- Secuencias
CREATE SEQUENCE IF NOT EXISTS pagos_id_seq;
CREATE SEQUENCE IF NOT EXISTS pagos_divisas_id_seq;
CREATE SEQUENCE IF NOT EXISTS solicitudes_id_seq;
CREATE SEQUENCE IF NOT EXISTS usuarios_id_seq;

-- PKs y Unique
ALTER TABLE conciliaciones ADD CONSTRAINT IF NOT EXISTS conciliaciones_pkey PRIMARY KEY (id);
ALTER TABLE extractos ADD CONSTRAINT IF NOT EXISTS extractos_pkey PRIMARY KEY (id);
ALTER TABLE pagos ADD CONSTRAINT IF NOT EXISTS pagos_pkey PRIMARY KEY (id);
ALTER TABLE pagos_divisas ADD CONSTRAINT IF NOT EXISTS pagos_divisas_pkey PRIMARY KEY (id);
ALTER TABLE pagos_validador ADD CONSTRAINT IF NOT EXISTS pagos_validador_pkey PRIMARY KEY (id);
ALTER TABLE solicitudes ADD CONSTRAINT IF NOT EXISTS solicitudes_pkey PRIMARY KEY (id);
ALTER TABLE usuarios ADD CONSTRAINT IF NOT EXISTS usuarios_email_unique UNIQUE (email);
ALTER TABLE usuarios ADD CONSTRAINT IF NOT EXISTS usuarios_pkey PRIMARY KEY (id);
SQL
echo "   ✓ Schema aplicado"

# 2. Copiar datos tabla por tabla
echo ""
echo "▶ Paso 2: Copiando datos (Railway → Coolify)..."
SNAPSHOT_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "   Timestamp snapshot: $SNAPSHOT_TS"
echo ""

for TABLE in $TABLES; do
  echo -n "   Copiando $TABLE... "
  ROWS=$(psql "$RAILWAY_DB" -t -A -c "SELECT COUNT(*) FROM $TABLE")
  psql "$RAILWAY_DB" -c "\copy $TABLE TO STDOUT CSV HEADER" | \
    psql "$COOLIFY_DB" -c "\copy $TABLE FROM STDIN CSV HEADER"
  echo "✓ ($ROWS filas)"
done

echo ""
echo "=========================================="
echo " ✅ Migración completa"
echo " Snapshot tomado en: $SNAPSHOT_TS"
echo " Guarda este timestamp para el delta sync."
echo "=========================================="
echo ""
echo "Para sincronizar cambios posteriores ejecuta:"
echo "  bash delta-sync.sh $SNAPSHOT_TS"
