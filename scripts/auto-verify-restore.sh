#!/usr/bin/env bash
# =============================================================================
# auto-verify-restore.sh
# Wrapper alrededor de verify-restore.sh que:
#   1. Captura toda la salida en una variable
#   2. Registra un JSON estructurado en LOG_FILE (queryable con jq)
#   3. Envía alerta de Telegram si hay FAILs (requiere env vars)
#
# VARIABLES DE ENTORNO:
#   TELEGRAM_BOT_TOKEN  — token del bot de Telegram (ej. 123456:ABC...)
#   TELEGRAM_CHAT_ID    — ID del chat/grupo donde enviar alertas
#   LOG_FILE            — ruta al log JSON (default: /var/log/verify-restore/results.jsonl)
#   SCRIPT_DIR          — directorio del verify-restore.sh
#
# CÓMO SE INVOCA:
#   Este script es llamado automáticamente por el contenedor verify-cron cada día.
#   También puede ejecutarse manualmente para probar:
#     TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=-1001234 bash scripts/auto-verify-restore.sh
#
# SALIDA LOG (formato JSONL — una línea JSON por ejecución):
#   { "ts": "2026-07-30T03:30:01Z", "result": "PASS"|"FAIL",
#     "backup_file": "...", "failures": 0,
#     "table_results": [ { "table": "pagos", "restored": 8989, "expected": 8989, "ok": true } ],
#     "duration_s": 42, "alert_sent": true }
# =============================================================================
set -uo pipefail

# ── Configuración ──────────────────────────────────────────────────────────────
SCRIPT_DIR="${SCRIPT_DIR:-$(dirname "$(realpath "$0")")}"
VERIFY_SCRIPT="${SCRIPT_DIR}/verify-restore.sh"
LOG_FILE="${LOG_FILE:-/var/log/verify-restore/results.jsonl}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

START_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
START_EPOCH=$(date +%s)

log() { echo "[$(date -u +%H:%M:%SZ)] [auto-verify] $*"; }

# ── Asegurar directorio de logs ────────────────────────────────────────────────
mkdir -p "$(dirname "$LOG_FILE")"

# ── Verificar que el script objetivo existe ────────────────────────────────────
if [[ ! -f "$VERIFY_SCRIPT" ]]; then
  log "ERROR: No se encontró $VERIFY_SCRIPT"
  exit 1
fi

log "=== Iniciando verificación automática de restore ==="
log "Script: $VERIFY_SCRIPT"
log "Log: $LOG_FILE"

# ── Ejecutar verify-restore.sh y capturar salida completa ─────────────────────
RAW_OUTPUT=$(bash "$VERIFY_SCRIPT" 2>&1) || true
VERIFY_EXIT=$?
END_EPOCH=$(date +%s)
DURATION=$((END_EPOCH - START_EPOCH))

# ── Determinar resultado global ────────────────────────────────────────────────
# El exit code del script es 0 = PASS, 1 = FAIL
if [[ $VERIFY_EXIT -eq 0 ]]; then
  RESULT="PASS"
else
  RESULT="FAIL"
fi

# ── Extraer backup file de la salida ──────────────────────────────────────────
BACKUP_FILE=$(echo "$RAW_OUTPUT" | grep -oP 'Backup encontrado: \K[^\s]+' || echo "unknown")

# ── Extraer resultados por tabla ───────────────────────────────────────────────
# Parsear líneas como:
#   pagos                    8989         8989   ✅ PASS
#   conciliaciones           5378         5378   ✅ PASS
#   extractos                  42         5891   ❌ FAIL  (faltan 5849 filas)
TABLE_JSON_ARRAY="[]"
TABLE_JSON_ARRAY=$(echo "$RAW_OUTPUT" | awk '
  /✅ PASS|❌ FAIL/ {
    # formato: tabla   restored   expected   PASS/FAIL
    split($0, parts, /[[:space:]]+/)
    table = ""
    restored = ""
    expected = ""
    ok = "true"
    # buscar campos no vacíos
    idx = 1
    for (i = 1; i <= length(parts); i++) {
      p = parts[i]
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", p)
      if (p == "") continue
      if (idx == 1) { table = p; idx++ }
      else if (idx == 2) { restored = p; idx++ }
      else if (idx == 3) { expected = p; idx++ }
      else if (p ~ /FAIL/) { ok = "false"; break }
      else if (p ~ /PASS/) { ok = "true"; break }
    }
    if (table != "" && restored != "" && expected != "") {
      printf "{\"table\":\"%s\",\"restored\":%s,\"expected\":%s,\"ok\":%s}\n",
        table, restored, expected, ok
    }
  }
' | jq -sc '.')

# Contar fallos en tablas
FAILURES=$(echo "$RAW_OUTPUT" | grep -c "❌ FAIL" || echo 0)

# ── Construir entrada JSON para el log ────────────────────────────────────────
JSON_ENTRY=$(jq -cn \
  --arg ts       "$START_TS" \
  --arg result   "$RESULT" \
  --arg backup   "$BACKUP_FILE" \
  --argjson failures "$FAILURES" \
  --argjson tables  "${TABLE_JSON_ARRAY:-[]}" \
  --argjson duration "$DURATION" \
  --arg raw_output "$RAW_OUTPUT" \
  '{
    ts: $ts,
    result: $result,
    backup_file: $backup,
    failures: $failures,
    table_results: $tables,
    duration_s: $duration,
    raw_output: $raw_output,
    alert_sent: false
  }')

# ── Enviar alerta de Telegram si hay fallos ────────────────────────────────────
ALERT_SENT=false
if [[ "$RESULT" == "FAIL" ]]; then
  if [[ -n "$TELEGRAM_BOT_TOKEN" && -n "$TELEGRAM_CHAT_ID" ]]; then
    # Construir mensaje con tablas fallidas
    FAILED_TABLES=$(echo "$RAW_OUTPUT" | grep "❌ FAIL" | head -20)
    MESSAGE="🚨 *Verify-Restore FALLÓ* — $(date -u +%Y-%m-%d)

*Backup:* \`${BACKUP_FILE}\`
*Fallos:* ${FAILURES} tabla(s)

*Tablas con error:*
\`\`\`
${FAILED_TABLES}
\`\`\`

Revisar log completo en el servidor:
\`tail -1 ${LOG_FILE} | jq .\`"

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d chat_id="${TELEGRAM_CHAT_ID}" \
      -d parse_mode="Markdown" \
      --data-urlencode "text=${MESSAGE}" 2>/dev/null)

    if [[ "$HTTP_CODE" == "200" ]]; then
      ALERT_SENT=true
      log "✅ Alerta de Telegram enviada (HTTP 200)"
    else
      log "⚠️  Alerta de Telegram falló (HTTP ${HTTP_CODE})"
    fi
  else
    log "⚠️  TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID no configurados — se omite alerta"
  fi
fi

# Actualizar JSON con el estado real del alert
JSON_ENTRY=$(echo "$JSON_ENTRY" | jq --argjson alert "$ALERT_SENT" '.alert_sent = $alert')

# ── Escribir al log ────────────────────────────────────────────────────────────
echo "$JSON_ENTRY" >> "$LOG_FILE"
log "Resultado registrado en $LOG_FILE"

# ── Resumen en stdout ──────────────────────────────────────────────────────────
echo ""
echo "========================================="
echo " RESULTADO: $RESULT"
echo " Backup:    $BACKUP_FILE"
echo " Duración:  ${DURATION}s"
echo " Fallos:    $FAILURES tabla(s)"
echo " Alerta:    $ALERT_SENT"
echo "========================================="
echo ""
echo "$RAW_OUTPUT"
echo ""

# ── Exit code ─────────────────────────────────────────────────────────────────
exit $VERIFY_EXIT
