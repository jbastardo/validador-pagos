#!/usr/bin/env bash
# =============================================================================
# delta-sync.sh
# Sincroniza filas NUEVAS desde Railway hacia Coolify creadas DESPUÉS del
# snapshot inicial. Usar justo antes del cutover final de dominios.
#
# Uso:
#   bash delta-sync.sh <TIMESTAMP_SNAPSHOT>
#   bash delta-sync.sh 2026-07-28T15:25:56Z
#
# Ejecutar desde la TERMINAL DE COOLIFY o contenedor con acceso a la red
# interna de Coolify.
#
# Requiere: psql instalado.
# =============================================================================
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "❌ Error: debes pasar el timestamp del snapshot inicial."
  echo "   Uso: bash delta-sync.sh 2026-07-28T15:25:56Z"
  exit 1
fi

SNAPSHOT_TS="$1"
RAILWAY_DB="${RAILWAY_DB:-postgresql://postgres:<password>@switchyard.proxy.rlwy.net:38165/railway}"
COOLIFY_DB="${DATABASE_URL:-postgres://postgres:<password>@f4wkaziqfj8j8mmdemcej5wl:5432/railway}"

echo "=========================================="
echo " Delta Sync Railway → Coolify"
echo " Desde: $SNAPSHOT_TS"
echo " Hasta: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=========================================="

# ─── Tablas con columna creado_en (timestamp de creación) ───────────────────
sync_by_created_en() {
  local TABLE="$1"
  echo -n "   Sync $TABLE (por creado_en)... "
  ROWS=$(psql "$RAILWAY_DB" -t -A -c \
    "SELECT COUNT(*) FROM $TABLE WHERE creado_en::timestamptz > '$SNAPSHOT_TS'::timestamptz")
  if [ "$ROWS" -eq 0 ]; then
    echo "sin cambios"
    return
  fi
  # UPSERT: exportar nuevas filas e insertar ignorando conflictos de PK
  TMP=$(mktemp /tmp/delta_XXXX.csv)
  psql "$RAILWAY_DB" -c \
    "\copy (SELECT * FROM $TABLE WHERE creado_en::timestamptz > '$SNAPSHOT_TS'::timestamptz) TO STDOUT CSV HEADER" > "$TMP"
  psql "$COOLIFY_DB" -c "\copy $TABLE FROM '$TMP' CSV HEADER" 2>/dev/null || \
    psql "$COOLIFY_DB" <<SQL
      CREATE TEMP TABLE _delta_$TABLE (LIKE $TABLE);
      \copy _delta_$TABLE FROM '$TMP' CSV HEADER
      INSERT INTO $TABLE SELECT * FROM _delta_$TABLE ON CONFLICT DO NOTHING;
      DROP TABLE _delta_$TABLE;
SQL
  rm -f "$TMP"
  echo "✓ ($ROWS filas nuevas)"
}

# ─── Tablas con id incremental (fallback si no hay creado_en) ────────────────
sync_by_max_id() {
  local TABLE="$1"
  echo -n "   Sync $TABLE (por id)... "
  MAX_ID=$(psql "$COOLIFY_DB" -t -A -c "SELECT COALESCE(MAX(id::int), 0) FROM $TABLE" 2>/dev/null || echo "0")
  ROWS=$(psql "$RAILWAY_DB" -t -A -c "SELECT COUNT(*) FROM $TABLE WHERE id::int > $MAX_ID")
  if [ "$ROWS" -eq 0 ]; then
    echo "sin cambios"
    return
  fi
  TMP=$(mktemp /tmp/delta_XXXX.csv)
  psql "$RAILWAY_DB" -c "\copy (SELECT * FROM $TABLE WHERE id::int > $MAX_ID) TO STDOUT CSV HEADER" > "$TMP"
  psql "$COOLIFY_DB" -c "\copy $TABLE FROM '$TMP' CSV HEADER"
  rm -f "$TMP"
  echo "✓ ($ROWS filas nuevas)"
}

echo ""
echo "▶ Sincronizando tablas con timestamp..."
for T in pagos pagos_divisas solicitudes; do
  sync_by_created_en "$T"
done

echo ""
echo "▶ Sincronizando tablas por ID..."
for T in conciliaciones extractos usuarios; do
  sync_by_max_id "$T"
done

# pagos_validador no tuvo filas — solo sincronizar si hay datos
echo -n "   Sync pagos_validador... "
TOTAL=$(psql "$RAILWAY_DB" -t -A -c "SELECT COUNT(*) FROM pagos_validador" 2>/dev/null || echo "0")
if [ "$TOTAL" -gt 0 ]; then
  sync_by_max_id "pagos_validador"
else
  echo "vacía, omitida"
fi

echo ""
echo "=========================================="
echo " ✅ Delta sync completo"
echo " Coolify ahora está al día con Railway."
echo "=========================================="
echo ""
echo "Siguientes pasos para cutover final:"
echo "  1. Actualizar DNS: CNAME de pagos.onprotec.com → coolify app"
echo "  2. Actualizar DNS: CNAME de conciliador.onprotec.com → coolify app"
echo "  3. Agregar dominios en Coolify UI → Settings → Domains"
echo "  4. Esperar propagación DNS (5-60 min)"
echo "  5. Desactivar servicios en Railway"
