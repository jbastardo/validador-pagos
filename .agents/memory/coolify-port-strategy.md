---
name: Coolify Port Strategy
description: Norma para evitar conflictos de puertos en Coolify al desplegar apps Node.js con Cloudflare Tunnel como proxy externo.
---

# Coolify — Norma de Puertos

## Regla

> **Nunca uses el mismo puerto de host para dos apps. Asigna un puerto host único por servicio y expónlo con Cloudflare Tunnel. No dependas de Traefik ni de sslip.io para el tráfico externo.**

## Por qué falla el enfoque de Traefik / sslip.io

- `ports_exposes` le dice a Traefik el puerto interno, pero en rolling update Coolify genera un docker-compose que sí mapea el puerto al host. Si dos containers intentan bindear el mismo puerto host (e.g. `5000:5000`), el segundo falla con `port is already allocated`.
- Los dominios `*.sslip.io` solo funcionan si el servidor tiene el puerto 80/443 abierto hacia Internet, lo que no siempre es el caso.
- Con Cloudflare Tunnel no necesitas ningún puerto abierto en el firewall — el tunnel sale desde dentro del servidor.

## Cómo configurar correctamente

### 1. Asignar un puerto host único por servicio

| Servicio | Puerto host | Puerto container |
|----------|------------|-----------------|
| validador-pagos | **8001** | 5000 |
| conciliador-pagos | **8002** | 5000 |
| (próximo servicio) | **8003** | (el que use) |
| ... | incrementar | ... |

### 2. Configurar en Coolify API

```bash
# ports_exposes = puerto del container
# ports_mappings = "HOST:CONTAINER" (único por servicio)
curl -X PATCH "https://coolify.tutecnotienda.site/api/v1/applications/<uuid>" \
  -H "Authorization: Bearer $Coolify_API" \
  -H "Content-Type: application/json" \
  -d '{"ports_exposes": "5000", "ports_mappings": "8001:5000"}'
```

### 3. Configurar Cloudflare Tunnel

En el dashboard de Cloudflare Tunnel, el target para cada servicio es:
```
http://192.168.1.X:8001   ← validador-pagos
http://192.168.1.X:8002   ← conciliador-pagos
```

Donde `192.168.1.X` es la IP del servidor en la red interna.

> **¿Por qué 192.168.1.x y no localhost?** El cloudflared daemon puede correr en un host diferente al servidor Coolify (otro nodo de la misma LAN), por lo que se usa la IP de red interna en lugar de 127.0.0.1.

### 4. Sin SSL en Coolify

- No habilitar SSL en Coolify para estos servicios — Cloudflare provee el TLS.
- Dominio en Coolify: dejar el temporal o dejarlo vacío (no se usa para tráfico de producción).

## Resumen rápido al migrar un nuevo servicio

1. Decidir puerto host libre (8003, 8004, …).
2. `PATCH /api/v1/applications/<uuid>` → `ports_mappings: "800X:PUERTO_APP"`, `ports_exposes: "PUERTO_APP"`.
3. Deploy.
4. En Cloudflare Tunnel → Public Hostname → `http://192.168.1.X:800X`.
5. Verificar con `curl http://192.168.1.X:800X/` desde dentro de la red.

**Why:** Elimina conflictos de puerto y dependencia de Traefik. Cloudflare Tunnel no requiere puertos abiertos en el firewall externo.
