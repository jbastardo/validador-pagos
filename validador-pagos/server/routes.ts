import multer from "multer";
import { eq, and } from "drizzle-orm";
import {
  db,
  getPagos, addPago, updatePagoEstado, updatePagoCajero, updatePagoCajeroPendiente, updatePagoFacturaCliente, checkDuplicado,
  deletePago, deletePagoDivisa, deleteUsuario,
  getUsuarios, addUsuario, updateUsuario, updateUsuarioTelegramChatId,
  getPagosDivisas, addPagoDivisa, updatePagoDivisaEstado, updatePagoDivisaEdicion,
  updatePagoEdicion,
  getSolicitudes, addSolicitud, updateSolicitudEstado, deleteSolicitud, updateSolicitudEdicion,
  getNextId,
  addMovimientos, getMovimientos, getExtractosStats, marcarUsado, tryMatch, deleteMovimientosBanco, conciliarPago, crearPagoDesdeConciliador,
} from "./db";
import { parseExtractoExcel } from "./extractos";
import { z } from "zod";
import { BANCOS_RECEPTOR_META, extractos, pagos } from "../shared/schema";
import { searchClientes, searchProductos, createCliente } from "./odoo";

// Bancos válidos para extractos (solo usado por app de conciliaciones)
const BANCOS_VALIDOS = BANCOS_RECEPTOR_META.map(b => b.codigo);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
async function sendTelegram(text: string, chatId?: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  const targetChatId = chatId || TELEGRAM_CHAT_ID;
  if (!targetChatId) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: targetChatId, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export async function registerRoutes(httpServer: any, app: any): Promise<void> {

  // ===== AUTH =====
  app.post("/api/auth/login", async (req: any, res: any) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Campos requeridos" });
    try {
      const usuarios = await getUsuarios();
      const u = usuarios.find((x: any) => x.email === email && x.password === password && x.activo?.toLowerCase() === "true");
      if (!u) return res.status(401).json({ message: "Credenciales incorrectas" });
      res.json({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, solicitudes: u.solicitudes === "true" });
    } catch (e: any) {
      console.error("Error login:", e.message);
      res.status(500).json({ message: "Error al verificar credenciales" });
    }
  });

  // ===== PAGOS BS =====
  app.get("/api/pagos", async (_req: any, res: any) => {
    try {
      const pagos = await getPagos();
      res.json(pagos.sort((a: any, b: any) => new Date(b.creadoEn ?? 0).getTime() - new Date(a.creadoEn ?? 0).getTime()));
    } catch (e: any) {
      console.error("Error getPagos:", e.message);
      res.status(500).json({ message: "Error al obtener pagos" });
    }
  });

  app.post("/api/pagos", async (req: any, res: any) => {
    try {
      const schema = z.object({
        fechaPago:     z.string().min(1),
        tipoPago:      z.enum(["PagoMovil", "Transferencia"]),
        bancoEmisor:   z.string().min(1),
        monto:         z.string().min(1),
        celular:       z.string().optional().default(""),
        bancoReceptor: z.string().min(1),
        referencia:    z.string().optional().default(""),
        rif:           z.string().min(1, "CI / RIF es obligatorio"),
        factura:       z.string().optional().default(""),
        cliente:       z.string().optional().default(""),
        vendedor:      z.string().min(1),
        observaciones: z.string().optional().default(""),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      const data = parsed.data;
      const dup = await checkDuplicado(data.referencia, data.monto, data.fechaPago, data.tipoPago, data.bancoReceptor, data.celular);
      if (dup) return res.status(409).json({
        message: "Pago duplicado detectado",
        duplicado: { id: dup.id, fechaPago: dup.fechaPago, monto: dup.monto, referencia: dup.referencia, tipoPago: dup.tipoPago },
      });

      const estadoInicial = "Pendiente";
      const validadoPorInicial = "";
      const matchId: string | null = null;

      const nuevo = await addPago({
        ...data,
        estado: estadoInicial,
        validadoPor: validadoPorInicial,
        megasoft: "",
      });

      if (matchId) {
        marcarUsado(matchId).catch(e => console.warn("marcarUsado error:", e.message));
      }

      const CONCILIADOR_URL = process.env.CONCILIADOR_URL || "";
      if (CONCILIADOR_URL) {
        fetch(`${CONCILIADOR_URL}/api/auto-validar-pago`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            banco: data.bancoReceptor,
            referencia: data.referencia,
            monto: data.monto,
            fecha: data.fechaPago,
          }),
        }).catch(err => console.warn("[webhook conciliador] Error:", err.message));
      }

      res.status(201).json({ ...nuevo, autoConciliado: !!matchId });
    } catch (e: any) {
      console.error("Error addPago:", e.message);
      res.status(500).json({ message: "Error al guardar pago" });
    }
  });

  app.patch("/api/pagos/:id/estado", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const schema = z.object({
        estado:        z.enum(["Pendiente", "Verificado", "Rechazado", "Rechazado Megasoft"]),
        validadoPor:   z.string().min(1),
        observaciones: z.string().optional().default(""),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos" });
      const updated = await updatePagoEstado(id, parsed.data.estado, parsed.data.validadoPor, parsed.data.observaciones);
      if (!updated) return res.status(404).json({ message: "Pago no encontrado" });
      res.json(updated);
    } catch (e: any) {
      console.error("Error updateEstado:", e.message);
      res.status(500).json({ message: "Error al actualizar estado" });
    }
  });

  // Cajero edita pagos Verificados (factura + cliente + megasoft)
  app.patch("/api/pagos/:id/cajero", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const schema = z.object({
        factura:  z.string().optional().default(""),
        cliente:  z.string().optional().default(""),
        megasoft: z.enum(["Sí", "No", ""]).optional().default(""),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos" });
      const pagos = await getPagos();
      const pago = pagos.find((p: any) => String(p.id) === String(id));
      if (!pago) return res.status(404).json({ message: "Pago no encontrado" });
      if (pago.estado !== "Verificado") return res.status(422).json({ message: "Solo se pueden editar pagos Verificados" });
      const updated = await updatePagoCajero(id, parsed.data.factura, parsed.data.megasoft, parsed.data.cliente);
      res.json(updated);
    } catch (e: any) {
      console.error("Error updatePagoCajero:", e.message);
      res.status(500).json({ message: "Error al actualizar pago" });
    }
  });

  // Cajero edita pagos Pendientes (factura, cliente, megasoft). Si megasoft=Sí → auto-aprueba
  app.patch("/api/pagos/:id/cajero-pendiente", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const schema = z.object({
        factura:  z.string().optional().default(""),
        cliente:  z.string().optional().default(""),
        megasoft: z.enum(["Sí", "No", ""]).optional().default(""),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos" });
      const updated = await updatePagoCajeroPendiente(id, parsed.data.factura, parsed.data.megasoft, parsed.data.cliente, parsed.data.megasoft === "Sí" ? (req.body.cajeroEmail || "") : "");
      if (!updated) return res.status(404).json({ message: "Pago no encontrado" });
      res.json(updated);
    } catch (e: any) {
      console.error("Error updatePagoCajeroPendiente:", e.message);
      res.status(500).json({ message: "Error al actualizar pago" });
    }
  });

  // ===== PAGOS DIVISAS =====
  app.get("/api/pagos-divisas", async (_req: any, res: any) => {
    try {
      const todos = await getPagosDivisas();
      res.json(todos.sort((a: any, b: any) => new Date(b.creadoEn ?? 0).getTime() - new Date(a.creadoEn ?? 0).getTime()));
    } catch (e: any) {
      console.error("Error getPagosDivisas:", e.message);
      res.status(500).json({ message: "Error al obtener pagos en divisas" });
    }
  });

  app.post("/api/pagos-divisas", async (req: any, res: any) => {
    try {
      const schema = z.object({
        fecha:         z.string().min(1),
        nombrePagador: z.string().min(1),
        correo:        z.string().optional().default(""),
        monto:         z.string().min(1),
        tipo:          z.string().min(1),
        referencia:    z.string().optional().default(""),
        cliente:       z.string().optional().default(""),
        rif:           z.string().optional().default(""),
        factura:       z.string().optional().default(""),
        observaciones: z.string().optional().default(""),
        vendedor:      z.string().min(1),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      console.log("[addPagoDivisa] guardando:", JSON.stringify(parsed.data));
      const nuevo = await addPagoDivisa({ ...parsed.data, estado: "Pendiente", validadoPor: "" });
      console.log("[addPagoDivisa] creado id=" + nuevo.id + " vendedor=" + nuevo.vendedor + " monto=" + nuevo.monto);
      res.status(201).json(nuevo);
    } catch (e: any) {
      console.error("Error addPagoDivisa:", e.message, e.stack);
      res.status(500).json({ message: "Error al guardar pago en divisas" });
    }
  });

  // GET /api/pagos-divisas/:id — obtener un pago divisa por ID
  app.get("/api/pagos-divisas/:id", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const todos = await getPagosDivisas();
      const pago = todos.find((p: any) => String(p.id) === String(id));
      if (!pago) return res.status(404).json({ message: "Pago en divisas no encontrado" });
      res.json(pago);
    } catch (e: any) {
      console.error("Error getPagoDivisa:", e.message);
      res.status(500).json({ message: "Error al obtener pago en divisas" });
    }
  });

  // PATCH /api/pagos-divisas/:id/estado (contabilidad / admin)
  app.patch("/api/pagos-divisas/:id/estado", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const schema = z.object({
        estado:        z.enum(["Pendiente", "Verificado", "Rechazado"]),
        validadoPor:   z.string().min(1),
        observaciones: z.string().optional().default(""),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      console.log("[updatePagoDivisaEstado] id=" + id + " estado=" + parsed.data.estado + " por=" + parsed.data.validadoPor);
      const updated = await updatePagoDivisaEstado(id, parsed.data.estado, parsed.data.validadoPor, parsed.data.observaciones);
      if (!updated) return res.status(404).json({ message: "Pago en divisas no encontrado" });
      res.json(updated);
    } catch (e: any) {
      console.error("Error updatePagoDivisaEstado:", e.message, e.stack);
      res.status(500).json({ message: "Error al actualizar estado del pago en divisas" });
    }
  });

  // DELETE /api/pagos-divisas/:id
  app.delete("/api/pagos-divisas/:id", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ message: "ID requerido" });
      const deleted = await deletePagoDivisa(id);
      res.json({ message: deleted ? "Pago en divisas eliminado" : "No se pudo eliminar" });
    } catch (e: any) {
      console.error("Error deletePagoDivisa:", e.message);
      res.status(500).json({ message: "Error al eliminar pago en divisas" });
    }
  });

  // PATCH /api/pagos/:id/editar (admin / contabilidad / vendedor)
  app.patch("/api/pagos/:id/editar", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { email, rol } = req.body;
      if (!email) return res.status(400).json({ message: "Email requerido" });
      const usuarios = await getUsuarios();
      const u = usuarios.find((x: any) => x.email === email && (x.rol === "admin" || x.rol === "contabilidad" || x.rol === "vendedor" || x.rol === "compras") && x.activo?.toLowerCase() === "true");
      if (!u) return res.status(403).json({ message: "Sin permisos para editar" });
      const { fechaPago, bancoEmisor, bancoReceptor, monto, referencia, celular, cliente, observaciones, rif, factura, megasoft, cajeroEmail } = req.body;
      const pagos = await getPagos();
      const pago = pagos.find((p: any) => String(p.id) === String(id));
      const fechaPagoFinal = fechaPago ?? pago?.fechaPago;
      const montoFinal = monto ?? pago?.monto;
      if (!fechaPagoFinal || !montoFinal) return res.status(400).json({ message: "Campos requeridos" });
      const updated = await updatePagoEdicion(id, {
        fechaPago: fechaPagoFinal, bancoEmisor: (bancoEmisor ?? pago?.bancoEmisor) ?? "", bancoReceptor: (bancoReceptor ?? pago?.bancoReceptor) ?? "",
        monto: montoFinal,
        referencia: (referencia ?? pago?.referencia) ?? "", celular: (celular ?? pago?.celular) ?? "",
        cliente: (cliente ?? pago?.cliente) ?? undefined,
        observaciones: (observaciones ?? pago?.observaciones) ?? undefined, rif: (rif ?? pago?.rif) ?? undefined,
        factura: (factura ?? pago?.factura) ?? undefined, megasoft: (megasoft ?? pago?.megasoft) ?? undefined,
        cajeroEmail: (cajeroEmail ?? undefined),
      });
      if (!updated) return res.status(404).json({ message: "Pago no encontrado" });
      res.json(updated);
    } catch (e: any) {
      console.error("Error updatePagoEdicion:", e.message);
      res.status(500).json({ message: "Error al editar pago" });
    }
  });

  // PATCH /api/pagos-divisas/:id/editar (admin / contabilidad / vendedor)
  app.patch("/api/pagos-divisas/:id/editar", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email requerido" });
      const usuarios = await getUsuarios();
      const u = usuarios.find((x: any) => x.email === email && (x.rol === "admin" || x.rol === "contabilidad" || x.rol === "vendedor" || x.rol === "compras") && x.activo?.toLowerCase() === "true");
      if (!u) return res.status(403).json({ message: "Sin permisos para editar" });
      const { fecha, nombrePagador, monto, tipo, referencia, observaciones } = req.body;
      if (!fecha || !monto) return res.status(400).json({ message: "Campos requeridos" });
      console.log("[updatePagoDivisaEdicion] id=" + id + " fecha=" + fecha + " monto=" + monto + " tipo=" + tipo + " por=" + email);
      const updated = await updatePagoDivisaEdicion(id, {
        fecha, nombrePagador, monto, tipo, referencia: referencia ?? undefined, observaciones: observaciones ?? undefined,
      });
      if (!updated) return res.status(404).json({ message: "Pago en divisas no encontrado" });
      console.log("[updatePagoDivisaEdicion] actualizado id=" + updated.id);
      res.json(updated);
    } catch (e: any) {
      console.error("Error updatePagoDivisaEdicion:", e.message, e.stack);
      res.status(500).json({ message: "Error al editar pago en divisas" });
    }
  });

  // ===== EXTRACTOS BANCARIOS (solo usado por app de conciliaciones) =====

  // ===== SOLICITUDES =====
  app.get("/api/solicitudes", async (_req: any, res: any) => {
    try {
      const solicitudes = await getSolicitudes();
      res.json(solicitudes.sort((a: any, b: any) => new Date(b.creadoEn ?? 0).getTime() - new Date(a.creadoEn ?? 0).getTime()));
    } catch (e: any) {
      res.status(500).json({ message: "Error al obtener solicitudes" });
    }
  });

  app.post("/api/solicitudes", async (req: any, res: any) => {
    try {
      const schema = z.object({
        vendedor: z.string().min(1),
        cliente: z.string().min(1),
        sku: z.string().optional().default(""),
        producto: z.string().min(1),
        cantidad: z.string().min(1),
        celular: z.string().optional().default(""),
        fechaTope: z.string().optional().default(""),
        observaciones: z.string().optional().default(""),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      const nuevo = await addSolicitud({ ...parsed.data, estado: "Pendiente" });
      res.status(201).json(nuevo);
    } catch (e: any) {
      res.status(500).json({ message: "Error al crear solicitud" });
    }
  });

  app.patch("/api/solicitudes/:id/estado", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { estado } = req.body;
      if (!estado) return res.status(400).json({ message: "Estado requerido" });
      const updated = await updateSolicitudEstado(id, estado);
      if (!updated) return res.status(404).json({ message: "Solicitud no encontrada" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: "Error al actualizar solicitud" });
    }
  });

  app.patch("/api/solicitudes/:id/editar", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email requerido" });
      const usuarios = await getUsuarios();
      const u = usuarios.find((x: any) => x.email === email && (x.rol === "admin" || x.rol === "compras" || x.rol === "vendedor") && x.activo?.toLowerCase() === "true");
      if (!u) return res.status(403).json({ message: "Sin permisos para editar" });
      const { vendedor, cliente, sku, producto, cantidad, celular, fechaTope, observaciones, estado, categoria } = req.body;
      if (!vendedor || !producto) return res.status(400).json({ message: "Campos requeridos" });
       const updated = await updateSolicitudEdicion(id, {
        vendedor: vendedor ?? undefined, cliente: cliente ?? undefined, sku: sku ?? undefined, producto, cantidad,
        celular: celular ?? undefined, fechaTope: fechaTope ?? undefined, observaciones: observaciones ?? undefined,
        estado, categoria: categoria ?? undefined, respondidoPor: email,
      });
      if (!updated) return res.status(404).json({ message: "Solicitud no encontrada" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: "Error al editar solicitud" });
    }
  });

  app.delete("/api/solicitudes/:id", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ message: "ID requerido" });
      const deleted = await deleteSolicitud(id);
      res.json({ message: deleted ? "Solicitud eliminada" : "No se pudo eliminar" });
    } catch (e: any) {
      res.status(500).json({ message: "Error al eliminar solicitud" });
    }
  });

  // ===== EXTRACTOS BANCARIOS (app de conciliaciones) =====
  app.get("/api/extractos/:banco", async (req: any, res: any) => {
    try {
      const banco = String(req.params.banco);
      if (!BANCOS_VALIDOS.includes(banco)) return res.status(400).json({ message: "Banco no válido" });
      const movs = await getMovimientos(banco);
      res.json(movs);
    } catch (e: any) {
      console.error("Error getExtractos:", e.message);
      res.status(500).json({ message: "Error al obtener extractos" });
    }
  });

  app.get("/api/extractos-stats", async (_req: any, res: any) => {
    try {
      const stats = await getExtractosStats();
      res.json(stats);
    } catch (e: any) {
      console.error("Error getExtractosStats:", e.message);
      res.status(500).json({ message: "Error al obtener estadísticas" });
    }
  });

  app.post("/api/extractos/:banco", upload.single("file"), async (req: any, res: any) => {
    try {
      const banco = String(req.params.banco);
      if (!BANCOS_VALIDOS.includes(banco)) return res.status(400).json({ message: "Banco no válido" });
      const file = req.file;
      if (!file) return res.status(400).json({ message: "Archivo requerido" });
      const subidoPor = (req.body.subidoPor as string) || "system";
      const result = await parseExtractoExcel(file.buffer, banco, subidoPor);
      if (result.movimientos.length === 0) return res.status(400).json({ message: "No se encontraron movimientos válidos", warnings: result.warnings });
      await deleteMovimientosBanco(banco);
      await addMovimientos(result.movimientos);
      console.log(`Extracto ${banco}: ${result.movimientos.length} movimientos cargados, ${result.skipped} saltados`);

      // ── Conciliar pagos de la app de validación ──
      let conciliados = 0;
      let creados = 0;
      const allPagos = await getPagos();
      const pendientes = allPagos.filter((p: any) => p.estado === "Pendiente");
      console.log(`Conciliando ${pendientes.length} pagos pendientes contra extractos...`);
      for (const pago of pendientes) {
        const match = await tryMatch(pago.tipoPago, pago.bancoReceptor, pago.fechaPago, pago.monto, pago.referencia || "", pago.celular || "");
        if (match) {
          await conciliarPago(pago.id, subidoPor);
          await marcarUsado(match.id);
          conciliados++;
          console.log(`  ✓ Pago #${pago.id} verificado+conciliado con extracto ${match.id}`);
        }
      }

      // ── Crear pagos nuevos desde extractos no usados ──
      const extractosNoUsados = await db.select().from(extractos).where(
        and(eq(extractos.banco, banco), eq(extractos.usado, "false"))
      );
      console.log(`Creando pagos desde ${extractosNoUsados.length} extractos no conciliados...`);
      for (const mov of extractosNoUsados) {
        if (mov.referencia) {
          const dup = await db.select().from(pagos).where(eq(pagos.referencia, mov.referencia)).limit(1);
          if (dup.length > 0) { await marcarUsado(mov.id); continue; }
        }
        const montoNorm = String(mov.monto).replace(",", ".");
        const docsPendientes = await db.select().from(pagos).where(
          and(eq(pagos.estado, "Pendiente"), eq(pagos.tipoPago, "Transferencia"))
        );
        let duplicado = false;
        for (const dp of docsPendientes) {
          if (Math.abs(parseFloat(dp.monto) - parseFloat(montoNorm)) < 5) {
            if (mov.referencia && dp.referencia && mov.referencia.slice(-6) === dp.referencia.slice(-6)) { duplicado = true; break; }
            if (!mov.referencia && !dp.referencia) { duplicado = true; break; }
          }
        }
        if (duplicado) { await marcarUsado(mov.id); continue; }

        const nuevo = await crearPagoDesdeConciliador({
          fechaPago: mov.fecha,
          bancoEmisor: banco === "0134" ? "0134 Banesco" : banco === "0191" ? "0191 BNC" : "0102 Banco de Venezuela",
          monto: mov.monto,
          celular: mov.celular || "",
          bancoReceptor: mov.banco,
          referencia: mov.referencia || "",
          tipoPago: "Transferencia",
          vendedor: subidoPor,
        });
        if (nuevo) { await marcarUsado(mov.id); creados++; console.log(`  ✓ Pago #${nuevo.id} creado desde extracto ${mov.id}`); }
      }

      console.log(`Conciliación completada: ${conciliados} conciliados, ${creados} creados`);
      res.json({ message: `Extracto cargado: ${result.movimientos.length} movimientos${conciliados > 0 ? `, ${conciliados} conciliados` : ""}${creados > 0 ? `, ${creados} creados` : ""}`, conciliados, creados, warnings: result.warnings });
    } catch (e: any) {
      console.error("Error upload extracto:", e.message);
      res.status(500).json({ message: "Error al procesar extracto: " + e.message });
    }
  });

  app.delete("/api/extractos/:banco", async (req: any, res: any) => {
    try {
      const banco = String(req.params.banco);
      if (!BANCOS_VALIDOS.includes(banco)) return res.status(400).json({ message: "Banco no válido" });
      const deleted = await deleteMovimientosBanco(banco);
      res.json({ message: `${deleted} movimientos eliminados` });
    } catch (e: any) {
      console.error("Error deleteExtractos:", e.message);
      res.status(500).json({ message: "Error al eliminar extractos" });
    }
  });

  // ===== USUARIOS =====
  app.get("/api/usuarios", async (_req: any, res: any) => {
    try {
      const usuarios = await getUsuarios();
      res.json(usuarios);
    } catch (e: any) {
      res.status(500).json({ message: "Error al obtener usuarios" });
    }
  });

  app.post("/api/usuarios", async (req: any, res: any) => {
    try {
      const { nombre, email, password, rol, solicitudes } = req.body;
      if (!nombre || !email || !password) return res.status(400).json({ message: "Campos requeridos" });
      const usuarios = await getUsuarios();
      if (usuarios.find((u: any) => u.email === email)) return res.status(409).json({ message: "El email ya está registrado" });
      const newUser = await addUsuario({ nombre, email, password, rol: rol ?? "vendedor", activo: "true", solicitudes: solicitudes ?? "false" });
      res.status(201).json({ id: newUser.id, nombre: newUser.nombre, email: newUser.email, rol: newUser.rol, activo: newUser.activo, solicitudes: newUser.solicitudes });
    } catch (e: any) {
      console.error("Error addUsuario:", e.message);
      res.status(500).json({ message: "Error al crear usuario" });
    }
  });

  app.patch("/api/usuarios/:id", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const usuarios = await getUsuarios();
      const usuario = usuarios.find((u: any) => String(u.id) === String(id));
      if (!usuario) return res.status(404).json({ message: "Usuario no encontrado" });
      const updated = await updateUsuario(id, { ...usuario, ...req.body });
      res.json({ id: updated.id, nombre: updated.nombre, email: updated.email, rol: updated.rol, activo: updated.activo, solicitudes: updated.solicitudes });
    } catch (e: any) {
      console.error("Error updateUsuario:", e.message);
      res.status(500).json({ message: "Error al actualizar usuario" });
    }
  });

  app.post("/api/telegram-webhook", async (req: any, res: any) => {
    try {
      const { message } = req.body;
      if (!message?.chat?.id || !message?.text) return res.json({ ok: true });
      const chatId = String(message.chat.id);
      const text = String(message.text);
      const usuarios = await getUsuarios();
      const u = usuarios.find((x: any) => x.telegramChatId === chatId);
      if (!u) return res.json({ ok: true, message: "Usuario no vinculado" });
      if (text === "/start" || text === "/start@" + (process.env.TELEGRAM_BOT_USERNAME || "")) {
        await sendTelegram(`¡Hola ${u.nombre}! Tus notificaciones están activas.`, chatId);
        return res.json({ ok: true });
      }
      if (text.startsWith("/vincular")) {
        const nuevoChatId = text.split(" ")[1];
        if (nuevoChatId) {
          await updateUsuarioTelegramChatId(u.id, nuevoChatId);
          await sendTelegram(`¡Vinculado! Recibirás notificaciones de pagos.`, chatId);
        }
        return res.json({ ok: true });
      }
      res.json({ ok: true });
    } catch (e: any) {
      console.error("Error telegram webhook:", e.message);
      res.json({ ok: false });
    }
  });
}
