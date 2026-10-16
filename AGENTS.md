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

---

## 2026-10-16 — Integración de Métricas Odoo POS (Pabilo y Megasoft) y Autocompletado de Facturas

### Problema
El dashboard web mostraba 0 aprobados por Megasoft, no reflejaba las validaciones de Pabilo, y marcaba 13 pagos como "Sin factura", lo cual alarmaba a gerencia ya que en Odoo POS sí se procesaban cobros masivos por Megasoft y Pabilo, y las ventas estaban efectivamente facturadas en Odoo pero no registradas en la web.

### Cambios
1. **`validador-pagos/server/odoo.ts`**:
   - `getOdooPosStats`: Extrae métricas en tiempo real de `pos.payment` en Odoo para Megasoft (`BANCO VENEZUELA PDV` / Transitoria Megasoft) y Pabilo (`Pabilo - VENEZUELA CTE` y `Pabilo - Onprotec Binance`).
   - `searchOdooFacturas`: Busca coincidencias en `pos.order` por cliente, monto y término de búsqueda para sugerir el número de factura fiscal (`mf_invoice_number`).
   - Retiro estricto de `cleanName` en `searchProductos` para cumplir con las reglas universales.
2. **`validador-pagos/server/db.ts`**:
   - Agregados contadores de `validadosManual` y `montoValidadosManual` en `getStats`.
3. **`validador-pagos/server/routes.ts`**:
   - `/api/stats`: Incluye bloque `odooPos` con las métricas de Megasoft y Pabilo de Odoo.
   - `/api/odoo/buscar-factura`: Nuevo endpoint para consulta y autocompletado de facturas.
4. **`validador-pagos/client/src/pages/Dashboard.tsx`**:
   - Tarjetas dedicadas para **Pabilo (Odoo POS)** con desglose Venezuela / Binance y monto en USD.
   - Tarjetas para **Megasoft (Odoo POS + Web)** con montos en USD y Bs.
   - Tarjeta para **Verificaciones Manuales en Banco**.
5. **`validador-pagos/client/src/pages/Conciliacion.tsx`**:
   - Detección y sugerencia automática de facturas de Odoo con botón "Usar" y "Consultar en Odoo" en los modales de cajero.

---

## Reglas Universales de Negocio

### Nombres de Productos (Odoo)
- **NO alterar ni limpiar nombres de Odoo**: Está estrictamente prohibido usar funciones como `cleanName` o expresiones regulares para modificar los nombres de los productos. 
- Siempre se debe utilizar y mostrar el valor original devuelto por el campo `display_name` (que típicamente incluye el `[SKU]` al inicio).
- El nombre del producto que viene de Odoo es el que se debe mostrar al usuario, sin excepciones.