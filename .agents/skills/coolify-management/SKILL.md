---
name: coolify-management
description: Gestión completa de aplicaciones en Coolify mediante su API REST. Usar cuando el usuario necesite desplegar una app, actualizar variables de entorno, reiniciar servicios, consultar logs, verificar estado, crear bases de datos PostgreSQL, o cualquier operación sobre el servidor Coolify. También usar cuando se mencionen palabras como "deploy en Coolify", "reiniciar el servicio", "actualizar env var en producción", "ver logs de Coolify", o cuando algo en producción no esté funcionando y el proyecto corre en Coolify.
---

# Coolify Management

Skill para gestionar aplicaciones y recursos en un servidor Coolify 4.x a través de su API REST.

## Credenciales y contexto

- **Coolify API token**: secreto `Coolify_API` (Replit Secret)
- **URL del servidor**: almacenada en la memoria del proyecto (`.agents/memory/coolify-migration-tools.md`)
- Siempre leer ese archivo de memoria antes de operar para obtener UUIDs de proyecto, servidor y aplicaciones.

---

## Operaciones comunes

### 1. Verificar estado de una app

```bash
curl -s "https://<coolify-url>/api/v1/applications/<app_uuid>" \
  -H "Authorization: Bearer $Coolify_API" | jq -r '.status'
```

El estado `running:unknown` es normal cuando no hay health-check configurado — la app está corriendo.

### 2. Disparar un deploy

```bash
curl -s -X POST "https://<coolify-url>/api/v1/deploy?uuid=<app_uuid>&force=false" \
  -H "Authorization: Bearer $Coolify_API" | jq -r '.deployments[0].message'
```

Usar `force=true` para forzar reconstrucción completa (equivale a `--no-cache`).

Después de disparar el deploy, esperar **90 segundos** antes de verificar el estado:

```bash
sleep 90 && curl -s "https://<coolify-url>/api/v1/applications/<app_uuid>" \
  -H "Authorization: Bearer $Coolify_API" | jq -r '.status'
```

### 3. Actualizar variables de entorno (una o varias)

```bash
# Una variable
curl -s -X PATCH "https://<coolify-url>/api/v1/applications/<app_uuid>/envs" \
  -H "Authorization: Bearer $Coolify_API" -H "Content-Type: application/json" \
  -d '{"key": "MI_VAR", "value": "nuevo_valor"}'

# Bulk (varias a la vez)
curl -s -X PATCH "https://<coolify-url>/api/v1/applications/<app_uuid>/envs/bulk" \
  -H "Authorization: Bearer $Coolify_API" -H "Content-Type: application/json" \
  -d '{"data": [{"key": "VAR1", "value": "v1"}, {"key": "VAR2", "value": "v2"}]}'
```

Después de cambiar env vars, **siempre redeploy**:

```bash
curl -s -X POST "https://<coolify-url>/api/v1/deploy?uuid=<app_uuid>&force=false" \
  -H "Authorization: Bearer $Coolify_API"
```

### 4. Listar todas las apps del proyecto

```bash
curl -s "https://<coolify-url>/api/v1/projects/<project_uuid>/environments/<env_name>" \
  -H "Authorization: Bearer $Coolify_API" | jq '.applications[] | {name, uuid, status}'
```

### 5. Ver logs de una app

```bash
curl -s "https://<coolify-url>/api/v1/applications/<app_uuid>/logs" \
  -H "Authorization: Bearer $Coolify_API" | jq -r '.logs' | tail -50
```

### 6. Reiniciar sin redeploy (solo reinicia el container)

```bash
curl -s -X POST "https://<coolify-url>/api/v1/applications/<app_uuid>/restart" \
  -H "Authorization: Bearer $Coolify_API"
```

---

## Trampas conocidas

### ⚠️ URLs sslip.io — Hairpin NAT
Los dominios auto-generados por Coolify con formato `<uuid>.190.x.x.x.sslip.io` **no funcionan** cuando una app dentro de Docker intenta llamar a otra app en el mismo servidor. El DNS resuelve a la IP pública pero el router no redirige el tráfico de vuelta al mismo host (hairpin NAT).

**Solución:** usar siempre el dominio personalizado (ej. `https://pagos.tutecnotienda.site`) para URLs entre servicios en `VALIDATOR_API_URL`, `API_URL`, etc.

### ⚠️ Puerto host único por servicio
Cada app debe exponerse en un puerto host distinto (8001, 8002, 8003…). Ver `coolify-port-strategy.md` en memoria para el mapa actual.

### ⚠️ Monorepos — `base_directory`
En apps que son un subdirectorio de un repo, configurar `base_directory` en Coolify (ej. `/validador-pagos`) o nixpacks no encontrará el Dockerfile/package.json correcto.

### ⚠️ Nixpacks y `vite.config.ts`
Nixpacks puede detectar un `vite.config.ts` en la raíz y asumir que la app es un sitio estático, levantando solo Caddy sin Node.js. Si el backend no arranca, establecer `start_command` explícito:

```bash
curl -s -X PATCH "https://<coolify-url>/api/v1/applications/<app_uuid>" \
  -H "Authorization: Bearer $Coolify_API" -H "Content-Type: application/json" \
  -d '{"start_command": "npm run build && npm start"}'
```

---

## Crear una base de datos PostgreSQL nueva

```bash
curl -s -X POST "https://<coolify-url>/api/v1/databases/postgresql" \
  -H "Authorization: Bearer $Coolify_API" -H "Content-Type: application/json" \
  -d '{
    "name": "<nombre>",
    "project_uuid": "<project_uuid>",
    "environment_name": "production",
    "environment_uuid": "<env_uuid>",
    "server_uuid": "<server_uuid>",
    "postgres_user": "postgres",
    "postgres_password": "<password>",
    "postgres_db": "railway",
    "instant_deploy": true
  }'
# Retorna: { "uuid": "...", "internal_db_url": "postgres://...@<uuid>:5432/railway" }
```

La `internal_db_url` es accesible desde cualquier container en la red `coolify`. Úsala como `DATABASE_URL` en las apps.

---

## Flujo típico: cambio de código → producción

1. Hacer commit + push al repo de GitHub.
2. Disparar deploy via API (sección 2).
3. Esperar 90 segundos.
4. Verificar `status == "running:unknown"` o `running`.
5. Hacer curl a la URL pública del servicio para confirmar que responde HTTP 200.
