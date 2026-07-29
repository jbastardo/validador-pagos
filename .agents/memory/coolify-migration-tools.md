---
name: Coolify Migration Tools
description: Toolbox completo para migraciones Railway → Coolify. Secrets disponibles, endpoints API, patrón clone+delta. Válido para migraciones futuras de otros servicios del proyecto ONPROTEC.
---

# Coolify Migration Toolbox — ONPROTEC

## Servidor Coolify
- **URL:** https://coolify.tutecnotienda.site
- **Versión:** 4.1.2
- **Server UUID:** `w3zpdku0mcyj5bsibfmss5by`
- **Destination UUID:** `o7k9v6jcumvy9lhluh787m61` (red Docker: coolify)
- **IP pública:** 190.142.178.96

## Proyecto Coolify
- **Nombre:** Apps Tecnotienda
- **Project UUID:** `eo5v2d4pmgvwexatnddyrs4h`
- **Environment:** production
- **Environment UUID:** `ek1ykyuroo0trdqrd9d6tsrz`

## Secrets disponibles (Replit)
| Secret | Uso |
|--------|-----|
| `Coolify_API` | Bearer token para API de Coolify |
| `Railway_API` | Token para Railway GraphQL API |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | PAT para GitHub API (40 chars, classic token) |

## Railway API
- **Endpoint GraphQL:** `https://backboard.railway.app/graphql/v2`
- **Auth header:** `Authorization: Bearer $Railway_API`
- **Obtener proyectos:**
  ```bash
  curl -s -X POST https://backboard.railway.app/graphql/v2 \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $Railway_API" \
    -d '{"query":"{ projects { edges { node { id name } } } }"}'
  ```
- **Obtener env vars de un servicio:**
  ```bash
  curl -s -X POST https://backboard.railway.app/graphql/v2 \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $Railway_API" \
    -d '{"query":"{ variables(projectId: \"<id>\", environmentId: \"<envId>\", serviceId: \"<svcId>\") }"}'
  ```
- **Proyecto ONPROTEC:** id `faabdfc1-af40-485a-89f3-edd135684824`, environment production `ebf3b836-48c7-48f6-8de2-dba45ef6fe9f`

## Coolify API — Endpoints clave

### Crear PostgreSQL
```bash
curl -s -X POST "https://coolify.tutecnotienda.site/api/v1/databases/postgresql" \
  -H "Authorization: Bearer $Coolify_API" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "<nombre>",
    "project_uuid": "eo5v2d4pmgvwexatnddyrs4h",
    "environment_name": "production",
    "environment_uuid": "ek1ykyuroo0trdqrd9d6tsrz",
    "server_uuid": "w3zpdku0mcyj5bsibfmss5by",
    "postgres_user": "postgres",
    "postgres_password": "<password>",
    "postgres_db": "railway",
    "instant_deploy": true
  }'
# Retorna: { "uuid": "...", "internal_db_url": "postgres://...@<uuid>:5432/railway" }
```

### Habilitar acceso público al DB (para operaciones externas)
```bash
curl -s -X PATCH "https://coolify.tutecnotienda.site/api/v1/databases/<uuid>" \
  -H "Authorization: Bearer $Coolify_API" -H "Content-Type: application/json" \
  -d '{"is_public": true, "public_port": 54320}'
# NOTA: El puerto puede estar bloqueado por firewall externo. Usar internal_db_url desde dentro de Coolify.
```

### Crear SSH deploy key en Coolify
```bash
ssh-keygen -t ed25519 -f /tmp/<name>_key -N "" -C "coolify-<name>"
curl -s -X POST "https://coolify.tutecnotienda.site/api/v1/security/keys" \
  -H "Authorization: Bearer $Coolify_API" -H "Content-Type: application/json" \
  -d "{\"name\": \"<name>-deploy-key\", \"private_key\": $(cat /tmp/<name>_key | jq -Rs .)}"
# Retorna: { "uuid": "..." }
```

### Agregar deploy key a GitHub repo
```bash
curl -s -X POST \
  -H "Authorization: token $GITHUB_PERSONAL_ACCESS_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/<owner>/<repo>/keys" \
  -d "{\"title\": \"coolify-<name>\", \"key\": \"$(cat /tmp/<name>_key.pub)\", \"read_only\": true}"
```

### Crear aplicación desde repo privado (deploy key)
```bash
curl -s -X POST "https://coolify.tutecnotienda.site/api/v1/applications/private-deploy-key" \
  -H "Authorization: Bearer $Coolify_API" -H "Content-Type: application/json" \
  -d '{
    "name": "<nombre>",
    "project_uuid": "eo5v2d4pmgvwexatnddyrs4h",
    "environment_name": "production",
    "environment_uuid": "ek1ykyuroo0trdqrd9d6tsrz",
    "server_uuid": "w3zpdku0mcyj5bsibfmss5by",
    "private_key_uuid": "<key_uuid>",
    "git_repository": "git@github.com:<owner>/<repo>.git",
    "git_branch": "main",
    "build_pack": "nixpacks",
    "ports_exposes": "3000",
    "instant_deploy": false
  }'
# Retorna: { "uuid": "...", "domains": "http://..." }
```

### Inyectar env vars (bulk)
```bash
curl -s -X PATCH "https://coolify.tutecnotienda.site/api/v1/applications/<uuid>/envs/bulk" \
  -H "Authorization: Bearer $Coolify_API" -H "Content-Type: application/json" \
  -d '{"data": [{"key": "NOMBRE_VAR", "value": "valor"}, ...]}'
```

### Disparar deploy
```bash
# El endpoint correcto verificar con:
# GET https://raw.githubusercontent.com/coollabsio/coolify/main/openapi.yaml | grep deploy
curl -s -X POST "https://coolify.tutecnotienda.site/api/v1/deploy?uuid=<app_uuid>&force=false" \
  -H "Authorization: Bearer $Coolify_API"
```

## Migración de datos: patrón pg_dump

### Problema de versión
El Replit tiene `pg_dump 16` pero Railway corre PostgreSQL 18. Usar `psql COPY` como alternativa:
```bash
# Exportar tabla por tabla (sin restricción de versión)
psql "$RAILWAY_DB" -c "\copy <tabla> TO '/tmp/<tabla>.csv' CSV HEADER"
# Importar
psql "$COOLIFY_DB" -c "\copy <tabla> FROM '/tmp/<tabla>.csv' CSV HEADER"
```

### DB interna de Coolify — inaccesible desde fuera del servidor
El puerto público del DB puede estar bloqueado por firewall. Para importar datos, ejecutar desde:
- Terminal de Coolify (UI → Terminal en el container del DB)
- Un contenedor conectado a la red `coolify`
- Los scripts `scripts/migrate-data-to-coolify.sh` y `scripts/delta-sync.sh`

## Apps migradas: validador-pagos y conciliador-pagos

| Servicio | UUID Coolify | Dominio temporal |
|----------|-------------|-----------------|
| validador-pagos | `homxoqh64gtzt6997cz8wwhm` | `homxoqh64gtzt6997cz8wwhm.190.142.178.96.sslip.io` |
| conciliador-pagos | `u11pa7oonmz0c8ejyntjc3za` | `u11pa7oonmz0c8ejyntjc3za.190.142.178.96.sslip.io` |
| validador-pagos-db | `f4wkaziqfj8j8mmdemcej5wl` | internal: `postgres://postgres:<password>@f4wkaziqfj8j8mmdemcej5wl:5432/railway` (password en Coolify UI → DB → credentials) |

## Snapshot inicial
- **Timestamp:** 2026-07-28T15:25:56Z
- **Filas exportadas:** conciliaciones 5338 | extractos 5834 | pagos 8950 | pagos_divisas 1078 | pagos_validador 0 | solicitudes 226 | usuarios 21

## Migración de datos completada
- **Timestamp migración inicial:** 2026-07-28T19:55:00Z
- **Filas importadas:** conciliaciones 5372 | extractos 5880 | pagos 8987 | pagos_divisas 1084 | solicitudes 226 | usuarios 21
- Ejecutado via: `docker exec f4wkaziqfj8j8mmdemcej5wl bash /tmp/migrate.sh`

## Delta sync completado
- **Timestamp:** 2026-07-28T23:22:00Z
- **Método:** postgres_fdw via Coolify scheduled task en container validador-pagos (homxoqh64gtzt6997cz8wwhm)
- **Conteos finales verificados:** conciliaciones 5378 | extractos 5891 | pagos 8989 | pagos_divisas 1085 | solicitudes 227 | usuarios 21
- **Todos los conteos coinciden con Railway** ✅
- **Técnica delta:** `INSERT INTO ... SELECT * FROM rw.<tabla> ON CONFLICT DO NOTHING` via postgres_fdw
- **Nota importante:** `\copy` falla al primer conflicto de PK; usar postgres_fdw + ON CONFLICT DO NOTHING para syncs futuros

## Fixes aplicados en Coolify
- **validador-pagos:** `base_directory=/validador-pagos`, puerto `8001:5000` ✅
- **conciliador-pagos:** `start_command="npm run build && npm start"` (nixpacks confundía vite.config.ts como sitio estático → corría solo Caddy sin Node.js), puerto `8002:5000` ✅
- **DB reset:** ejecutado via SSH+docker exec (Coolify WebSocket terminal da error). Comando: `docker exec -i <db-container> psql -U postgres -d railway`

## Scripts disponibles
- `scripts/migrate-data-to-coolify.sh` — copia inicial schema + datos (ejecutar desde Coolify terminal)
- `scripts/delta-sync.sh <TIMESTAMP>` — sync incremental para cutover final
