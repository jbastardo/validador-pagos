---
name: validador-pagos-deploy
description: "Buenas prácticas, resolución de problemas y lecciones aprendidas para despliegues del proyecto Validador de Pagos en Coolify (Vite + Express + Docker)."
---

# Despliegues de React + Express en Coolify

Este documento contiene las reglas de oro y soluciones a problemas comunes enfrentados al desplegar la aplicación SPA de Vite junto a un backend Express en Coolify.

## 1. Nixpacks vs Docker
**Problema:** Los despliegues fallaban o el build de Vite se colgaba usando el motor por defecto de Coolify (Nixpacks).
**Solución:** Se debe usar siempre el **Build Pack de Docker** en Coolify. Para ello, el repositorio ya cuenta con un `Dockerfile` multi-stage optimizado y un `.dockerignore`.

## 2. Dependencias de Desarrollo en Producción
**Problema:** Al ejecutar `npm run build` en el Dockerfile, fallaba indicando que `vite`, `tsc` o `tsx` no se encontraban.
**Solución:** Al instalar dependencias en el Dockerfile para construir (fase de build), **NUNCA** uses `npm ci --omit=dev`. Es obligatorio utilizar `npm ci --include=dev` ya que React/Vite/TypeScript necesitan las dependencias de desarrollo para poder compilar los estáticos y transpilar el servidor.
```dockerfile
# Forma correcta en el Dockerfile (Builder stage)
RUN npm ci --include=dev
RUN npm run build
```

## 3. Pantalla Blanca en Producción (Errores Silenciosos)
**Problema:** Tras un despliegue "exitoso" en Coolify, el usuario reporta que la página carga completamente en blanco, o lanza un error 502 de Cloudflare.
**Solución:** Dado que Express sirve tanto la API como el frontend compilado (archivos estáticos), **cualquier error de sintaxis, variables no definidas o importaciones faltantes en el backend (ej. `server/routes.ts`) provocará que Express no logre arrancar o colapse**. 
* **Regla estricta:** Antes de hacer push para un deploy, SIEMPRE ejecuta localmente `npm run check` (que ejecuta el compilador de TypeScript) para asegurar que no existan errores tipo `TS2552 (Cannot find name)` u olvidos de imports en el backend, lo cual es la causa #1 de caídas silenciosas de la aplicación en producción.

## 4. Archivos Env
**Problema:** Los scripts de utilidad (como cron manuales locales) pueden fallar porque carecen de acceso a la base de datos de producción (la URL se inyecta en el contenedor de Coolify).
**Solución:** En lugar de intentar ejecutar scripts directamente a nivel de terminal del servidor, crea **endpoints de administrador (ocultos)** en Express (ej. `/api/cron/run`) protegidos por autenticación o ejecutados bajo demanda, permitiendo accionar lógicas desde el frontend o mediante simples `curl`.

## 5. Webhooks de Telegram
**Problema:** Tras cambiar un token de un bot o redesplegar el servicio, el bot de Telegram deja de responder a los comandos.
**Solución:** Cada bot de Telegram debe enlazarse a la URL pública de la aplicación manualmente usando la API de Telegram. Para el bot de compras (y cualquier otro), asegúrate de hacer un `curl` (o ejecutar en un navegador) la siguiente URL:
`https://api.telegram.org/bot<TOKEN_DEL_BOT>/setWebhook?url=https://<TU_DOMINIO_CLOUDFLARE>/api/telegram-webhook`

## 6. Odoo y Errores de API
**Práctica:** Al extraer información desde Odoo, siempre valida que los campos opcionales (como `vat`, teléfono) existan. Fallar al parsear datos de Odoo puede romper el proceso de sincronización. Usa fallback strings (`c.vat || "Sin RIF"`).
