# Verify-Restore Automation

## Overview

The `verify-cron` service runs `scripts/verify-restore.sh` automatically every day at **03:30 AM UTC** — 30 minutes after Coolify's daily backup window.

## Components

| File | Purpose |
|------|---------|
| `scripts/verify-restore.sh` | Core restore+row-count verification logic |
| `scripts/auto-verify-restore.sh` | Wrapper: captures output, logs JSON, sends Telegram alert on failure |
| `services/verify-cron/Dockerfile` | Docker image with docker CLI + supercronic + scripts |
| `services/verify-cron/crontab` | Cron schedule (03:30 UTC daily) |
| `services/verify-cron/docker-compose.yml` | Coolify service definition |

## Log Format

Results are written as JSONL (one JSON object per line) to `/var/log/verify-restore/results.jsonl` (persisted in a Docker named volume).

```jsonc
{
  "ts": "2026-07-30T03:30:01Z",  // ISO-8601 UTC timestamp
  "result": "PASS",               // or "FAIL"
  "backup_file": "20260730T0300Z.dmp",
  "failures": 0,                  // number of tables with row-count mismatch
  "table_results": [
    { "table": "pagos",     "restored": 8989, "expected": 8989, "ok": true },
    { "table": "usuarios",  "restored": 21,   "expected": 21,   "ok": true }
  ],
  "duration_s": 47,
  "alert_sent": false,            // true if Telegram alert was sent
  "raw_output": "..."             // full script output for debugging
}
```

### Querying the log

```bash
# Last result
docker exec verify-cron-verify-cron-1 tail -1 /var/log/verify-restore/results.jsonl | jq '{ts, result, failures}'

# All FAILs in the past 30 days
docker exec verify-cron-verify-cron-1 cat /var/log/verify-restore/results.jsonl \
  | jq 'select(.result == "FAIL") | {ts, failures, table_results}'

# All results (summary table)
docker exec verify-cron-verify-cron-1 cat /var/log/verify-restore/results.jsonl \
  | jq -r '[.ts, .result, .failures, .duration_s] | @tsv' \
  | column -t
```

## Telegram Alerts

On failure, the service sends a Telegram message listing the tables that failed and the row-count diff.

### Setup

1. Create a Telegram bot via [@BotFather](https://t.me/BotFather) — note the token.
2. Get your group/chat ID (send a message to the group and call `getUpdates`).
3. In **Coolify → verify-cron service → Environment Variables**, set:
   - `TELEGRAM_BOT_TOKEN` = `123456:ABC-your-token`
   - `TELEGRAM_CHAT_ID` = `-1001234567890`
4. Redeploy the service.

If the env vars are not set, the service still runs and logs, but skips the Telegram alert.

## Coolify Service

The service is deployed as a Docker Compose stack named **verify-cron** in the Coolify project.

### Key configuration

- **Docker socket mount:** `/var/run/docker.sock` — required so the verification script can spin up a temporary PostgreSQL container.
- **Backup mount:** `/data/coolify/backups` (read-only) — where the `.dmp` files live.
- **Log volume:** `verify_restore_logs` — persists logs across container restarts.

### Manual trigger

```bash
# Run verification immediately (from the Coolify host or any container in the coolify network)
docker exec verify-cron-verify-cron-1 bash /scripts/auto-verify-restore.sh
```

### View cron log

```bash
docker exec verify-cron-verify-cron-1 tail -50 /var/log/verify-restore/cron.log
```

## Adjusting the Schedule

The schedule is baked into `services/verify-cron/crontab`. To change it:

1. Edit `crontab` — standard cron format: `minute hour day month weekday command`
2. Commit + push to GitHub.
3. Redeploy the service in Coolify.

Example: run at 04:00 AM instead of 03:30 AM:
```
0 4 * * * SCRIPT_DIR=/scripts LOG_FILE=/var/log/verify-restore/results.jsonl bash /scripts/auto-verify-restore.sh >> /var/log/verify-restore/cron.log 2>&1
```
