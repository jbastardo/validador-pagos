# Validador Pagos - Solicitudes de Productos

## Contexto
Esta aplicación gestiona solicitudes de productos para el área de compras. Los usuarios principales son:
- **Vendedores**: Crean solicitudes, confirman compras, editan observaciones, solicita anulación
- **Compras/Admin**: Gestionan estado, eliminan, responden solicitudes

## Funcionalidades implementadas

### ✅ Completado
1. **Filtro por vendedores** - Select para filtrar solicitudes por vendedor
2. **Buscador por cliente/producto** - Input de búsqueda en la tabla
3. **Botones aceptar/cancelar disponibles en "En Proceso"** - Vendedores pueden confirmar o anular
4. **Tooltip con fecha de creación** - Al pasar sobre el ID muestra fecha de creación
5. **Botón editar observaciones (vendedor)** - Comunicación con compras
6. **Categorías predefinidas para productos nuevos** - 11 categorías:
   - Alarmas, Control de Acceso, Electrónicos, Seguridad, Telefonía
   - Oficina y Hogar, Iluminación, Ferretería, CCTV, Redes, Computación

### ⏳ Pendiente (del 1 al 5, 7)
- **Múltiples items en una solicitud** - Varios productos en una sola solicitud
- **Exportar a Excel** - Descargar solicitudes filtradas
- **Historial de cambios** - Ver quién editó qué y cuándo
- **Adjuntar archivos** - Subir comprobantes o documentos
- **Notificaciones en tiempo real** - Alertas cuando hay nuevas solicitudes
- **Dashboard de estadísticas** - Métricas de solicitudes

## Detalles técnicos

### Estructura de Solicitud (schema.ts)
```
- id, vendedor, cliente, celular
- sku, producto, cantidad
- fechaTope, observaciones, estado
- creadoEn, actualizadoEn
- observacionesCompras, respondidoPor
```

### Estados posibles
- Pendiente, En Proceso, Completada, Cancelada, Agotado

### Roles
- admin, compras, vendedor

---

## 2026-05-08 — Error al actualizar estado: validación + logging

### Problem
El usuario de compras obtenía un error genérico ("Error al actualizar") al cambiar el estado de una solicitud sin saber la causa real. No se mostraba el mensaje de error del servidor.

### Changes
1. **`server/routes.ts`** (`/api/solicitudes/:id/editar`):
   - Added validation for `estado` field against allowed values: `["Pendiente", "En Proceso", "Completada", "Cancelada", "Agotado"]`
   - Improved error logging to include solicitud ID and full error stack trace
   - Server now returns specific error message in response body (`e.message`)

2. **`server/sheets.ts`** (`updateSolicitudEdicion`):
   - Added `?? ""` fallback to `nuevoSku` and `nuevoProducto` in row construction to prevent potential `undefined` values in sheet writes

3. **`client/src/pages/Solicitudes.tsx`** (all mutations):
   - Updated `mutationFn` in `editarSolicitud`, `batchCambiarEstado`, `editarObsVendedor`, and `confirmarCompra` to parse and throw the server's error response
   - Updated `onError` in these mutations to display `err.message` in the toast instead of generic "Error al actualizar"