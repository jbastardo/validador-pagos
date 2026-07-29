---
name: git-fresh-push
description: Aplicar cambios a un repositorio GitHub cuando la copia local está desactualizada, tiene historial divergido, o el git push falla con "Updates were rejected". Usar cuando git push falle por historial divergido, cuando el workspace tenga un clon parcial/shallow sin historial completo, o cuando se necesite editar archivos de un repo externo y hacer push sin romper el historial. Triggers: "git push rejected", "diverged", "Updates were rejected", "non-fast-forward", "shallow clone".
---

# Git Fresh-Clone Push

Patrón para aplicar cambios a repos GitHub cuando la copia local del workspace está divergida o es un shallow clone sin historial completo.

## El problema

Los repos clonados en sesiones anteriores o como parte de migraciones quedan desactualizados. Un `git push` directo falla:

```
hint: Updates were rejected because the remote contains work that you do not
hint: have locally. This is usually caused by another repository pushing...
```

Un `git pull --rebase` tampoco funciona si el clon es shallow (`fatal: Unable to read current working directory`).

## La solución: clon fresco en /tmp

En lugar de resolver la divergencia en la copia local (que puede ser compleja), clonar el repo fresco, aplicar los cambios ahí, y hacer push desde ese clon limpio.

### Paso 1: Clonar fresco

```bash
cd /tmp && rm -rf <nombre-temp> && \
  git clone "https://${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/<owner>/<repo>.git" <nombre-temp> 2>&1 | tail -2
```

El PAT va embebido en la URL HTTPS — no requiere configuración adicional de credenciales.

### Paso 2: Aplicar los cambios

Editar los archivos en `/tmp/<nombre-temp>/` con las herramientas normales de edición. Verificar que los cambios sean correctos antes de continuar.

### Paso 3: Commit y push

```bash
cd /tmp/<nombre-temp> && \
  git config user.email "agent@replit.com" && \
  git config user.name "Replit Agent" && \
  git add <archivos o .> && \
  git commit -m "<mensaje descriptivo>" && \
  git push origin main 2>&1 | tail -4
```

### Paso 4: Verificar

Confirmar que el push salió con `main -> main` en la salida.

---

## Cuándo NO usar este patrón

- Si el repo local está actualizado y `git status` muestra que estás en la punta del branch → hacer push directamente.
- Si hay conflictos de contenido reales (dos cambios al mismo código) → resolver el conflicto manualmente primero.

## Cuándo SÍ usar este patrón

- `git push` falla con "Updates were rejected" o "non-fast-forward".
- El repo local es un clon parcial o fue clonado en una sesión anterior y puede estar detrás del remoto.
- Rebase falla con `fatal: Unable to read current working directory`.
- El workspace tiene el repo como subdirectorio de otro repo (clon dentro de clon).

---

## Nota sobre rutas

Si el repo clonado en `/home/runner/workspace/` es un subdirectorio de otro repo (p.ej. `vp-repo/validador-pagos/`), el `git add` relativo puede fallar. Con el patrón de clon fresco en `/tmp` esto no ocurre porque el directorio de trabajo ES el root del repo.

---

## Ejemplo completo

```bash
# Clonar
cd /tmp && rm -rf vp-fix && \
  git clone "https://${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/jbastardo/validador-pagos.git" vp-fix

# Editar
# (usar WriteFile o Edit apuntando a /tmp/vp-fix/...)

# Push
cd /tmp/vp-fix && \
  git config user.email "agent@replit.com" && \
  git config user.name "Replit Agent" && \
  git add validador-pagos/client/src/pages/Usuarios.tsx && \
  git commit -m "feat: agregar campo X" && \
  git push origin main
```
