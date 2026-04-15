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