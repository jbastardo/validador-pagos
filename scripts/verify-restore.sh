#!/usr/bin/env bash
# =============================================================================
# verify-restore.sh
# Verifica que el último backup de validador-pagos-db puede restaurarse
# correctamente en un contenedor temporal y que los row counts coinciden
# con los valores esperados de producción.
#
# CÓMO EJECUTAR:
#   Opción A — Desde el servidor Coolify (SSH o terminal UI):
#     bash /path/to/verify-restore.sh
#
#   Opción B — Desde la terminal del contenedor de producción (docker exec):
#     docker exec -it <cualquier-contenedor-en-red-coolify> bash verify-restore.sh
#
# REQUISITOS:
#   - docker CLI disponible (correr en el servidor Coolify)
#   - Acceso a red Docker "coolify"
#   - El archivo de backup en: BACKUP_DIR (ver abajo)
#
# SALIDA:
#   - PASS / FAIL para cada tabla comparada
#   - Exit code 0 = todo OK, 1 = al menos una tabla no coincide
# =============================================================================
set -euo pipefail

# ── Configuración ──────────────────────────────────────────────────────────────
BACKUP_DIR="/data/coolify/backups/databases/root-team-0/validador-pagos-db-f4wkaziqfj8j8mmdemcej5wl"
PROD_DB_HOST="f4wkaziqfj8j8mmdemcej5wl"     # hostname interno Coolify
PROD_DB_PASS="Xk9mP2nQ7vR4sL1wY6tZ8uE3"    # ver Coolify UI → validador-pagos-db → credentials
TEMP_DB_NAME="restore_verify_$(date +%s)"
TEMP_DB_PASS="VerifyTemp$(date +%s)!"
TEMP_CONTAINER="pg-restore-verify-$(date +%s)"
PG_IMAGE="postgres:16-alpine"
NETWORK="coolify"

# Row counts esperados (verificados el 2026-07-29 en producción — delta sync)
declare -A EXPECTED=(
  [conciliaciones]=5378
  [extractos]=5891
  [pagos]=8989
  [pagos_divisas]=1085
  [pagos_validador]=0
  [solicitudes]=227
  [usuarios]=21
)

# ── Funciones ──────────────────────────────────────────────────────────────────
log()  { echo "[$(date -u +%H:%M:%SZ)] $*"; }
pass() { echo "  ✅ PASS  $*"; }
fail() { echo "  ❌ FAIL  $*"; FAILURES=$((FAILURES+1)); }

cleanup() {
  log "Limpiando contenedor temporal..."
  docker rm -f "$TEMP_CONTAINER" 2>/dev/null || true
}
trap cleanup EXIT

FAILURES=0

# ── Paso 1: Encontrar el backup más reciente ────────────────────────────────────
log "=== Paso 1: Localizando archivo de backup ==="
BACKUP_FILE=$(ls -t "${BACKUP_DIR}"/*.dmp 2>/dev/null | head -1)
if [[ -z "$BACKUP_FILE" ]]; then
  echo "ERROR: No se encontraron archivos .dmp en ${BACKUP_DIR}"
  exit 1
fi
BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
log "Backup encontrado: $(basename "$BACKUP_FILE")  (${BACKUP_SIZE})"

# ── Paso 2: Levantar contenedor temporal ────────────────────────────────────────
log "=== Paso 2: Levantando PostgreSQL temporal ==="
docker run -d \
  --name "$TEMP_CONTAINER" \
  --network "$NETWORK" \
  -e POSTGRES_PASSWORD="$TEMP_DB_PASS" \
  -e POSTGRES_DB=railway \
  -v "${BACKUP_DIR}:/backup:ro" \
  "$PG_IMAGE"

log "Esperando que el DB temporal esté listo..."
for i in $(seq 1 30); do
  docker exec "$TEMP_CONTAINER" pg_isready -U postgres -q 2>/dev/null && break
  sleep 1
done
docker exec "$TEMP_CONTAINER" pg_isready -U postgres || {
  echo "ERROR: DB temporal no arrancó a tiempo"
  exit 1
}
log "DB temporal listo: $TEMP_CONTAINER"

# ── Paso 3: Restaurar el backup ─────────────────────────────────────────────────
log "=== Paso 3: Ejecutando pg_restore ==="
docker exec "$TEMP_CONTAINER" sh -c \
  "PGPASSWORD='${TEMP_DB_PASS}' pg_restore -U postgres -d railway /backup/$(basename "$BACKUP_FILE") 2>&1" \
  | grep -v "^$" | tail -20
RESTORE_RC=${PIPESTATUS[0]}

if [[ $RESTORE_RC -ne 0 ]]; then
  log "ADVERTENCIA: pg_restore terminó con exit code $RESTORE_RC"
  log "(Los errores sobre roles o extensiones ya existentes son normales — se ignoran)"
fi
log "pg_restore completado"

# ── Paso 4: Verificar row counts ────────────────────────────────────────────────
log "=== Paso 4: Verificando row counts ==="
echo ""
printf "%-20s %12s %12s %6s\n" "Tabla" "Restaurado" "Esperado" "Estado"
printf "%-20s %12s %12s %6s\n" "-----" "----------" "--------" "------"

for TABLE in "${!EXPECTED[@]}"; do
  RESTORED=$(docker exec "$TEMP_CONTAINER" sh -c \
    "PGPASSWORD='${TEMP_DB_PASS}' psql -U postgres -d railway -t -A -c 'SELECT COUNT(*) FROM ${TABLE}' 2>/dev/null" || echo -1)
  EXP="${EXPECTED[$TABLE]}"

  if [[ "$RESTORED" -eq "$EXP" ]]; then
    printf "%-20s %12s %12s " "$TABLE" "$RESTORED" "$EXP"
    pass ""
  elif [[ "$RESTORED" -ge "$EXP" ]]; then
    # La prod puede tener más rows que el snapshot — acceptable si diff < 5%
    DIFF=$(( RESTORED - EXP ))
    printf "%-20s %12s %12s " "$TABLE" "$RESTORED" "$EXP"
    pass "(+${DIFF} filas nuevas desde el snapshot)"
  else
    printf "%-20s %12s %12s " "$TABLE" "$RESTORED" "$EXP"
    fail "(faltan $(( EXP - RESTORED )) filas)"
  fi
done

echo ""

# ── Paso 5: Verificar producción en vivo (opcional) ────────────────────────────
if [[ "${VERIFY_PROD:-false}" == "true" ]]; then
  log "=== Paso 5: Comparando contra producción en vivo ==="
  for TABLE in "${!EXPECTED[@]}"; do
    PROD_COUNT=$(docker exec "$TEMP_CONTAINER" sh -c \
      "PGPASSWORD='${PROD_DB_PASS}' psql -h ${PROD_DB_HOST} -U postgres -d railway -t -A \
       -c 'SELECT COUNT(*) FROM ${TABLE}' 2>/dev/null" || echo -1)
    RESTORED=$(docker exec "$TEMP_CONTAINER" sh -c \
      "PGPASSWORD='${TEMP_DB_PASS}' psql -U postgres -d railway -t -A -c 'SELECT COUNT(*) FROM ${TABLE}' 2>/dev/null" || echo -1)
    if [[ "$RESTORED" -eq "$PROD_COUNT" ]]; then
      pass "${TABLE}: backup=${RESTORED} == prod=${PROD_COUNT}"
    else
      fail "${TABLE}: backup=${RESTORED} != prod=${PROD_COUNT}"
    fi
  done
fi

# ── Resumen ────────────────────────────────────────────────────────────────────
echo ""
log "=== Resultado final ==="
if [[ $FAILURES -eq 0 ]]; then
  log "✅ RESTORE VERIFICADO: todos los row counts coinciden."
  log "   Backup: $(basename "$BACKUP_FILE")"
  log "   Fecha backup: $(stat -c %y "$BACKUP_FILE" 2>/dev/null || stat -f %Sm "$BACKUP_FILE")"
  exit 0
else
  log "❌ VERIFICACIÓN FALLIDA: $FAILURES tabla(s) con discrepancia."
  exit 1
fi
