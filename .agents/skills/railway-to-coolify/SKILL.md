---
name: railway-to-coolify
description: Migrar aplicaciones completas de Railway a Coolify, incluyendo base de datos PostgreSQL, variables de entorno, y código. Usar cuando el usuario mencione migrar desde Railway, mover apps a su propio servidor, pasar de Railway a self-hosted, o cuando quiera dejar de pagar Railway y hostear en Coolify. Cubre: creación de DB, deploy keys de GitHub, importación de datos, sync incremental, cutover final.
---

# Railway → Coolify Migration

Skill completo para migrar aplicaciones Node.js/fullstack con PostgreSQL de Railway a un servidor Coolify self-hosted.

## Prerrequisitos

- Servidor Coolify 4.x corriendo y accesible
- Secretos Replit: `Coolify_API`, `Railway_API`, `GITHUB_PERSONAL_ACCESS_TOKEN`
- Leer `.agents/memory/coolify-migration-tools.md` para UUIDs del proyecto ONPROTEC si es una migración al mismo servidor

---

## Fase 1: Preparar Coolify

### 1.1 Crear la base de datos PostgreSQL

Ver `coolify-management` skill → sección "Crear una base de datos PostgreSQL nueva".

Guardar la `internal_db_url` que devuelve — es la `DATABASE_URL` para las apps.

> ⚠️ El acceso público al DB (`is_public: true`) puede estar bloqueado por firewall. Usar siempre la URL interna desde containers en la red `coolify`.

### 1.2 Crear deploy key para el repo de GitHub

```bash
# Generar par de llaves
ssh-keygen -t ed25519 -f /tmp/<nombre>_key -N "" -C "coolify-<nombre>"

# Registrar en Coolify
curl -s -X POST "https://<coolify-url>/api/v1/security/keys" \
  -H "Authorization: Bearer $Coolify_API" -H "Content-Type: application/json" \
  -d "{\"name\": \"<nombre>-deploy-key\", \"private_key\": $(cat /tmp/<nombre>_key | jq -Rs .)}"
# Guardar el uuid retornado

# Agregar al repo de GitHub (read-only)
curl -s -X POST \
  -H "Authorization: token $GITHUB_PERSONAL_ACCESS_TOKEN" \
  "https://api.github.com/repos/<owner>/<repo>/keys" \
  -d "{\"title\": \"coolify-<nombre>\", \"key\": \"$(cat /tmp/<nombre>_key.pub)\", \"read_only\": true}"
```

### 1.3 Crear la aplicación en Coolify

```bash
curl -s -X POST "https://<coolify-url>/api/v1/applications/private-deploy-key" \
  -H "Authorization: Bearer $Coolify_API" -H "Content-Type: application/json" \
  -d '{
    "name": "<nombre>",
    "project_uuid": "<project_uuid>",
    "environment_name": "production",
    "environment_uuid": "<env_uuid>",
    "server_uuid": "<server_uuid>",
    "private_key_uuid": "<key_uuid>",
    "git_repository": "git@github.com:<owner>/<repo>.git",
    "git_branch": "main",
    "build_pack": "nixpacks",
    "ports_exposes": "3000",
    "instant_deploy": false
  }'
# Guardar el uuid de la app
```

Si es un monorepo, configurar `base_directory`:

```bash
curl -s -X PATCH "https://<coolify-url>/api/v1/applications/<app_uuid>" \
  -H "Authorization: Bearer $Coolify_API" -H "Content-Type: application/json" \
  -d '{"base_directory": "/<subcarpeta>"}'
```

### 1.4 Inyectar variables de entorno

Obtener todas las env vars desde Railway:

```bash
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $Railway_API" \
  -d '{"query":"{ variables(projectId: \"<project_id>\", environmentId: \"<env_id>\", serviceId: \"<svc_id>\") }"}'
```

Inyectarlas en Coolify (bulk):

```bash
curl -s -X PATCH "https://<coolify-url>/api/v1/applications/<app_uuid>/envs/bulk" \
  -H "Authorization: Bearer $Coolify_API" -H "Content-Type: application/json" \
  -d '{"data": [{"key": "DATABASE_URL", "value": "<internal_db_url>"}, ...]}'
```

> ⚠️ Reemplazar `DATABASE_URL` y cualquier URL que apunte a servicios Railway por sus equivalentes en Coolify. Las URLs `*.railway.app` no son accesibles desde Coolify.

---

## Fase 2: Migración de datos

### Problema de versión de pg_dump

El Replit corre `pg_dump 16` pero Railway puede correr PostgreSQL 17/18. Usar `psql COPY` en lugar de pg_dump:

```bash
# Exportar tabla por tabla desde Railway
psql "$RAILWAY_DB_URL" -c "\copy <tabla> TO '/tmp/<tabla>.csv' CSV HEADER"

# Importar en Coolify (via docker exec en el container del DB)
# Primero copiar el CSV al container
docker cp /tmp/<tabla>.csv <coolify-db-container>:/tmp/

# Luego importar
docker exec <coolify-db-container> psql -U postgres -d railway \
  -c "\copy <tabla> FROM '/tmp/<tabla>.csv' CSV HEADER"
```

### Delta sync antes del cutover

Para evitar pérdida de datos durante el tiempo de migración, usar postgres_fdw para sincronizar las filas nuevas:

```sql
-- Instalar extensión en la DB de Coolify (via Coolify terminal)
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

CREATE SERVER railway_server
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host '<railway-host>', port '5432', dbname 'railway');

CREATE USER MAPPING FOR postgres
  SERVER railway_server
  OPTIONS (user 'postgres', password '<railway-password>');

CREATE SCHEMA rw;
IMPORT FOREIGN SCHEMA public FROM SERVER railway_server INTO rw;

-- Sync tabla a tabla
INSERT INTO public.<tabla>
  SELECT * FROM rw.<tabla>
  ON CONFLICT DO NOTHING;
```

> ⚠️ `\copy` falla al primer conflicto de PK; siempre usar `INSERT ... ON CONFLICT DO NOTHING` para syncs incrementales.

---

## Fase 3: Primer deploy y verificación

```bash
# Disparar deploy
curl -s -X POST "https://<coolify-url>/api/v1/deploy?uuid=<app_uuid>&force=false" \
  -H "Authorization: Bearer $Coolify_API"

# Esperar y verificar
sleep 90 && curl -s "https://pagos.tutecnotienda.site/api/health" | jq .
```

Trampas comunes al primer deploy — ver `coolify-management` skill sección "Trampas conocidas":
- nixpacks detecta `vite.config.ts` como sitio estático → configurar `start_command` explícito
- URLs sslip.io entre servicios → usar dominios personalizados
- Puerto host duplicado → asignar puerto único (8001, 8002…)

---

## Fase 4: Cutover final

1. Poner Railway en modo mantenimiento o escalar a 0 instancias.
2. Hacer un último delta sync (Fase 2).
3. Apuntar los DNS del dominio al nuevo servidor Coolify.
4. Verificar que el dominio resuelve correctamente y la app responde.
5. Dar de baja el servicio en Railway.

---

## Checklist de migración

- [ ] DB creada en Coolify con `internal_db_url` guardada
- [ ] Deploy key generada y registrada en GitHub
- [ ] App creada en Coolify con `base_directory` correcto si es monorepo
- [ ] Env vars inyectadas (todas las URLs de Railway reemplazadas)
- [ ] Datos migrados (snapshot inicial + delta sync)
- [ ] Primer deploy exitoso (`status: running`)
- [ ] App responde HTTP 200 en el dominio final
- [ ] DNS apuntando a Coolify
- [ ] Servicio Railway dado de baja
