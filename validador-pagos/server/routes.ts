import multer from "multer";
import fs from "fs";
import path from "path";
import { eq, and } from "drizzle-orm";
import {
  db,
  getPagos, addPago, updatePagoEstado, updatePagoCajero, updatePagoCajeroPendiente, updatePagoFacturaCliente, checkDuplicado, checkDuplicadoDivisa, getStats,
  deletePago, deletePagoDivisa, deleteUsuario,
  getUsuarios, addUsuario, updateUsuario, updateUsuarioTelegramChatId,
  getPagosDivisas, addPagoDivisa, updatePagoDivisaEstado, updatePagoDivisaEdicion,
  updatePagoEdicion,
  getSolicitudes, addSolicitud, updateSolicitudEstado, deleteSolicitud, updateSolicitudEdicion, getSolicitudById,
  getMensajesBySolicitud, addSolicitudMensaje,
  addTelegramNotificacion, getTelegramNotificacion,
  getNextId,
  addMovimientos, getMovimientos, getExtractosStats, marcarUsado, tryMatch, deleteMovimientosBanco, conciliarPago, crearPagoDesdeConciliador,
  getPermisosRoles, getPermisosRolesByRol, updatePermisoRol,
} from "./db";
import { parseExtractoExcel } from "./extractos";
import { parseCasheaExcel } from "./casheaParser";
import { z } from "zod";
import { BANCOS_RECEPTOR_META, extractos, pagos } from "../shared/schema";
import { searchClientes, searchProductos, createCliente } from "./odoo";

// Bancos válidos para extractos (solo usado por app de conciliaciones)
const BANCOS_VALIDOS = BANCOS_RECEPTOR_META.map(b => b.codigo);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
async function sendTelegram(text: string, chatId?: string): Promise<number | null> {
  if (!TELEGRAM_BOT_TOKEN) return null;
  const targetChatId = chatId || TELEGRAM_CHAT_ID;
  if (!targetChatId) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: targetChatId, text, parse_mode: "HTML" }),
    });
    const data = await r.json() as any;
    return data?.result?.message_id ?? null;
  } catch { return null; }
}

// Uploads dir for solicitud attachments
const UPLOADS_DIR = path.join(process.cwd(), "uploads", "solicitudes");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer instance for solicitud file uploads (disk storage)
const uploadSolicitud = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const safeName = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      cb(null, safeName);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "application/pdf",
      "image/jpeg", "image/png", "image/webp", "image/gif",
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

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

  // ===== STATS / DASHBOARD =====
  app.get("/api/stats", async (req: any, res: any) => {
    try {
      const { fechaDesde, fechaHasta } = req.query;
      const stats = await getStats(fechaDesde as string | undefined, fechaHasta as string | undefined);
      res.json(stats);
    } catch (e: any) {
      console.error("Error getStats:", e.message);
      res.status(500).json({ message: "Error al obtener estadísticas" });
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
            pagoId: String(nuevo.id),
            bancoReceptor: data.bancoReceptor,
            bancoEmisor: data.bancoEmisor,
            referencia: data.referencia,
            monto: data.monto,
            fechaPago: data.fechaPago,
            celular: data.celular,
            tipoPago: data.tipoPago,
            vendedor: data.vendedor,
          }),
        }).catch(err => console.warn("[webhook conciliador] Error:", err.message));
      }

      res.status(201).json({ ...nuevo, autoConciliado: !!matchId });
    } catch (e: any) {
      console.error("Error addPago:", e.message);
      res.status(500).json({ message: "Error al guardar pago" });
    }
  });

  // POST /api/pagos/upload-cashea - Subir pagos de Cashea en lote desde Excel
  app.post("/api/pagos/upload-cashea", upload.single("file"), async (req: any, res: any) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No se recibió archivo" });
      }

      const vendedor = req.body.vendedor || "Cashea";
      const rif = req.body.rif || "J-00000000-0";

      console.log(`[upload-cashea] Archivo: ${req.file.originalname} | Vendedor: ${vendedor}`);

      // Parsear el archivo Excel
      const parseResult = await parseCasheaExcel(req.file.buffer);

      if (parseResult.pagos.length === 0) {
        return res.status(422).json({
          message: "No se encontraron pagos válidos en el archivo",
          errores: parseResult.errores,
          total: parseResult.total,
          validos: 0,
          invalidos: parseResult.invalidos,
        });
      }

      // Obtener todos los pagos existentes para verificar duplicados
      const pagosExistentes = await getPagos();
      const referenciasEnLote = new Set<string>();

      let guardados = 0;
      let duplicados = 0;
      const erroresGuardado: string[] = [];

      // Procesar cada pago
      for (const pagoCashea of parseResult.pagos) {
        // Verificar duplicado usando checkDuplicado (misma lógica que POST /api/pagos)
        const dup = await checkDuplicado(
          pagoCashea.referencia, pagoCashea.monto, pagoCashea.fechaPago, "PagoMovil", "0191", pagoCashea.celular
        );
        if (dup) {
          duplicados++;
          continue;
        }
        // También evitar duplicados dentro del mismo lote
        const refKey = pagoCashea.referencia.replace(/\D/g, "").padStart(10, "0").slice(-10);
        if (referenciasEnLote.has(refKey)) {
          duplicados++;
          continue;
        }
        referenciasEnLote.add(refKey);

        try {
          // Crear el pago
          const nuevoPago = await addPago({
            fechaPago: pagoCashea.fechaPago,
            tipoPago: "PagoMovil",
            bancoEmisor: pagoCashea.bancoEmisor,
            monto: pagoCashea.monto,
            celular: pagoCashea.celular,
            bancoReceptor: "0191", // BNC fijo para Cashea
            referencia: pagoCashea.referencia,
            rif: pagoCashea.rif || rif,
            factura: "",
            estado: "Pendiente",
            validadoPor: "",
            vendedor,
            observaciones: `Cashea - Orden ${pagoCashea.ordenId || "N/A"}`,
            cliente: pagoCashea.cliente || "",
            megasoft: "",
            conciliadoPor: "",
          });

          // Enviar webhook al conciliador para auto-conciliación
          const CONCILIADOR_URL = process.env.CONCILIADOR_URL || "";
          if (CONCILIADOR_URL && nuevoPago?.id) {
            fetch(`${CONCILIADOR_URL}/api/auto-validar-pago`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pagoId: String(nuevoPago.id),
                bancoReceptor: "0191",
                bancoEmisor: pagoCashea.bancoEmisor,
                referencia: pagoCashea.referencia,
                monto: pagoCashea.monto,
                fechaPago: pagoCashea.fechaPago,
                celular: pagoCashea.celular,
                tipoPago: "PagoMovil",
                vendedor,
              }),
            }).catch(err => console.warn(`[webhook] Error pago ${nuevoPago.id}:`, err.message));
          }

          guardados++;
        } catch (err: any) {
          erroresGuardado.push(`Ref ${pagoCashea.referencia}: ${err.message}`);
        }
      }

      console.log(`[upload-cashea] Guardados: ${guardados} | Duplicados: ${duplicados} | Errores: ${erroresGuardado.length}`);

      res.json({
        ok: true,
        total: parseResult.total,
        validos: parseResult.validos,
        invalidos: parseResult.invalidos,
        guardados,
        duplicados,
        errores: [...parseResult.errores, ...erroresGuardado],
      });
    } catch (e: any) {
      console.error("Error upload-cashea:", e.message);
      res.status(500).json({ message: "Error al procesar el archivo" });
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
      const updated = await updatePagoCajeroPendiente(id, parsed.data.factura, parsed.data.cliente, parsed.data.megasoft, parsed.data.megasoft === "Sí" ? (req.body.cajeroEmail || "") : "");
      if (!updated) return res.status(404).json({ message: "Pago no encontrado" });
      res.json(updated);
    } catch (e: any) {
      console.error("Error updatePagoCajeroPendiente:", e.message);
      res.status(500).json({ message: "Error al actualizar pago" });
    }
  });

  // Cajero edita factura/cliente/megasoft/rif en CUALQUIER estado
  app.patch("/api/pagos/:id/factura-cliente", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const schema = z.object({
        factura:     z.string().optional().default(""),
        cliente:     z.string().optional().default(""),
        megasoft:    z.enum(["Sí", "No", ""]).optional().default(""),
        rif:         z.string().optional().default(""),
        cajeroEmail: z.string().optional().default(""),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos" });
      const updated = await updatePagoFacturaCliente(
        id, parsed.data.factura, parsed.data.cliente,
        parsed.data.megasoft, parsed.data.cajeroEmail, parsed.data.rif
      );
      if (!updated) return res.status(404).json({ message: "Pago no encontrado" });
      res.json(updated);
    } catch (e: any) {
      console.error("Error updatePagoFacturaCliente:", e.message);
      res.status(500).json({ message: "Error al actualizar factura/cliente" });
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

      // Verificar duplicado
      const dup = await checkDuplicadoDivisa(parsed.data.referencia, parsed.data.monto, parsed.data.fecha, parsed.data.tipo);
      if (dup) return res.status(409).json({
        message: "Pago en divisas duplicado detectado",
        duplicado: { id: dup.id, fecha: dup.fecha, monto: dup.monto, referencia: dup.referencia, tipo: dup.tipo },
      });

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

  // DELETE /api/pagos/:id (admin / contabilidad)
  app.delete("/api/pagos/:id", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Credenciales requeridas" });
      const usuarios = await getUsuarios();
      const u = usuarios.find((x: any) => x.email === email && x.password === password && x.activo?.toLowerCase() === "true");
      if (!u) return res.status(401).json({ message: "Credenciales incorrectas" });
      if (u.rol !== "admin" && u.rol !== "contabilidad") return res.status(403).json({ message: "Sin permisos para eliminar" });
      const deleted = await deletePago(id);
      if (!deleted) return res.status(404).json({ message: "Pago no encontrado" });
      res.json({ message: "Pago eliminado" });
    } catch (e: any) {
      console.error("Error deletePago:", e.message);
      res.status(500).json({ message: "Error al eliminar pago" });
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

      // Verificar duplicado si se está editando referencia, monto o bancoReceptor
      const refFinal = referencia ?? pago?.referencia ?? "";
      const bancoReceptorFinal = bancoReceptor ?? pago?.bancoReceptor ?? "";
      const celularFinal = celular ?? pago?.celular ?? "";
      const tipoPagoFinal = pago?.tipoPago ?? "PagoMovil";
      const dup = await checkDuplicado(refFinal, montoFinal, fechaPagoFinal, tipoPagoFinal, bancoReceptorFinal, celularFinal);
      if (dup && String(dup.id) !== String(id)) {
        return res.status(409).json({
          message: "Pago duplicado detectado",
          duplicado: { id: dup.id, fechaPago: dup.fechaPago, monto: dup.monto, referencia: dup.referencia, tipoPago: dup.tipoPago },
        });
      }

      const updated = await updatePagoEdicion(id, {
        fechaPago: fechaPagoFinal, bancoEmisor: (bancoEmisor ?? pago?.bancoEmisor) ?? "", bancoReceptor: (bancoReceptor ?? pago?.bancoReceptor) ?? "",
        monto: montoFinal,
        referencia: refFinal, celular: celularFinal,
        cliente: (cliente ?? pago?.cliente) ?? undefined,
        observaciones: (observaciones ?? pago?.observaciones) ?? undefined, rif: (rif ?? pago?.rif) ?? undefined,
        factura: (factura ?? pago?.factura) ?? undefined, megasoft: (megasoft ?? pago?.megasoft) ?? undefined,
        cajeroEmail: (cajeroEmail ?? undefined),
      });
      if (!updated) return res.status(404).json({ message: "Pago no encontrado" });

      const CONCILIADOR_URL = process.env.CONCILIADOR_URL || "";
      if (CONCILIADOR_URL && updated?.id) {
        fetch(`${CONCILIADOR_URL}/api/auto-validar-pago`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pagoId: String(updated.id),
            bancoReceptor: updated.bancoReceptor || "",
            bancoEmisor: updated.bancoEmisor || "",
            referencia: updated.referencia || "",
            monto: updated.monto,
            fechaPago: updated.fechaPago,
            celular: updated.celular || "",
            tipoPago: updated.tipoPago || "PagoMovil",
            vendedor: updated.vendedor || "",
          }),
        }).catch(err => console.warn(`[webhook] Error re-conciliar pago ${updated.id}:`, err.message));
      }

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

      // Verificar duplicado si se está editando referencia, monto o tipo
      const refFinal = referencia ?? "";
      const tipoFinal = tipo;
      const dup = await checkDuplicadoDivisa(refFinal, monto, fecha, tipoFinal);
      if (dup && String(dup.id) !== String(id)) {
        return res.status(409).json({
          message: "Pago en divisas duplicado detectado",
          duplicado: { id: dup.id, fecha: dup.fecha, monto: dup.monto, referencia: dup.referencia, tipo: dup.tipo },
        });
      }

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
        categoria: z.string().optional().default(""),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      const nuevo = await addSolicitud({ ...parsed.data, estado: "Pendiente" });
      res.status(201).json(nuevo);
      // Notificar a todos los usuarios de compras que hay una nueva solicitud
      try {
        const todosUsuarios = await getUsuarios();
        const compradores = todosUsuarios.filter((x: any) => x.rol === "compras" && x.activo?.toLowerCase() === "true" && x.telegramChatId);
        if (compradores.length > 0) {
          const lines = [
            `🛍️ <b>Nueva Solicitud de Producto</b>`,
            `<b>Vendedor:</b> ${parsed.data.vendedor}`,
            `<b>Cliente:</b> ${parsed.data.cliente}`,
            `<b>Producto:</b> ${parsed.data.producto}`,
            parsed.data.sku ? `<b>SKU:</b> ${parsed.data.sku}` : null,
            `<b>Cantidad:</b> ${parsed.data.cantidad}`,
            parsed.data.categoria ? `<b>Categoría:</b> ${parsed.data.categoria}` : null,
            parsed.data.fechaTope ? `<b>Fecha Tope:</b> ${parsed.data.fechaTope}` : null,
          ].filter(Boolean) as string[];
          const msg = lines.join("\n");
          for (const c of compradores) {
            sendTelegram(msg, c.telegramChatId).then(async msgId => {
              if (msgId) await addTelegramNotificacion({ telegramMessageId: String(msgId), solicitudId: nuevo.id, destinatarioEmail: c.email }).catch(() => {});
            }).catch(() => {});
          }
        }
      } catch {}
    } catch (e: any) {
      res.status(500).json({ message: "Error al crear solicitud" });
    }
  });

  app.patch("/api/solicitudes/:id/estado", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const schema = z.object({
        estado: z.enum(["Pendiente", "En Proceso", "Completada", "Cancelada", "Agotado"]),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Estado inválido" });
      const updated = await updateSolicitudEstado(id, parsed.data.estado);
      if (!updated) return res.status(404).json({ message: "Solicitud no encontrada" });
      res.json(updated);
      // Notificar al vendedor que cambió el estado de su solicitud
      try {
        if (updated.vendedor) {
          const todosUsuarios = await getUsuarios();
          const vendedorUser = todosUsuarios.find((x: any) => x.email === updated.vendedor && x.telegramChatId);
          if (vendedorUser?.telegramChatId) {
            const msg = [
              `📦 <b>Solicitud #${id} — Estado actualizado</b>`,
              `<b>Producto:</b> ${updated.producto || ""}`,
              `<b>Cliente:</b> ${updated.cliente || ""}`,
              `<b>Nuevo estado:</b> ${parsed.data.estado}`,
            ].join("\n");
            sendTelegram(msg, vendedorUser.telegramChatId).then(async msgId => {
              if (msgId) await addTelegramNotificacion({ telegramMessageId: String(msgId), solicitudId: Number(id), destinatarioEmail: vendedorUser.email }).catch(() => {});
            }).catch(() => {});
          }
        }
      } catch {}
    } catch (e: any) {
      console.error("Error updateSolicitudEstado:", e.message);
      res.status(500).json({ message: "Error al actualizar solicitud" });
    }
  });

  // Vendedor edita sus propias observaciones
  app.patch("/api/solicitudes/:id/observaciones-vendedor", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { observaciones, vendedorEmail } = req.body;
      if (!vendedorEmail) return res.status(400).json({ message: "vendedorEmail requerido" });
      const sols = await getSolicitudes();
      const sol = sols.find((s: any) => String(s.id) === String(id));
      if (!sol) return res.status(404).json({ message: "Solicitud no encontrada" });
      if (sol.vendedor !== vendedorEmail) return res.status(403).json({ message: "Solo puedes editar tus propias solicitudes" });
      const updated = await updateSolicitudEdicion(id, { observaciones: observaciones ?? "" }, vendedorEmail);
      res.json(updated);
    } catch (e: any) {
      console.error("Error observaciones-vendedor:", e.message);
      res.status(500).json({ message: "Error al actualizar observaciones" });
    }
  });

  // Vendedor confirma recepción/compra
  app.patch("/api/solicitudes/:id/confirmar-vendedor", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { vendedorEmail } = req.body;
      if (!vendedorEmail) return res.status(400).json({ message: "vendedorEmail requerido" });
      const sols = await getSolicitudes();
      const sol = sols.find((s: any) => String(s.id) === String(id));
      if (!sol) return res.status(404).json({ message: "Solicitud no encontrada" });
      if (sol.vendedor !== vendedorEmail) return res.status(403).json({ message: "Solo puedes confirmar tus propias solicitudes" });
      const nuevoEstado = sol.estado === "En Proceso" ? "Completada" : sol.estado;
      const updated = await updateSolicitudEdicion(id, { estado: nuevoEstado }, vendedorEmail);
      res.json(updated);
    } catch (e: any) {
      console.error("Error confirmar-vendedor:", e.message);
      res.status(500).json({ message: "Error al confirmar solicitud" });
    }
  });

  // Vendedor solicita anulación
  app.patch("/api/solicitudes/:id/anular-vendedor", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { vendedorEmail, motivo } = req.body;
      if (!vendedorEmail) return res.status(400).json({ message: "vendedorEmail requerido" });
      if (!motivo?.trim()) return res.status(400).json({ message: "Motivo de anulación requerido" });
      const sols = await getSolicitudes();
      const sol = sols.find((s: any) => String(s.id) === String(id));
      if (!sol) return res.status(404).json({ message: "Solicitud no encontrada" });
      if (sol.vendedor !== vendedorEmail) return res.status(403).json({ message: "Solo puedes anular tus propias solicitudes" });
      const updated = await updateSolicitudEdicion(id, {
        estado: "Cancelada",
        observacionesCompras: `Anulación solicitada por vendedor: ${motivo}`,
      }, vendedorEmail);
      res.json(updated);
    } catch (e: any) {
      console.error("Error anular-vendedor:", e.message);
      res.status(500).json({ message: "Error al anular solicitud" });
    }
  });

  app.patch("/api/solicitudes/:id/editar", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const email = req.body.email || req.body.usuario;
      if (!email) return res.status(400).json({ message: "Email requerido" });
      const usuarios = await getUsuarios();
      const u = usuarios.find((x: any) => x.email === email && (x.rol === "admin" || x.rol === "compras" || x.rol === "vendedor") && x.activo?.toLowerCase() === "true");
      if (!u) return res.status(403).json({ message: "Sin permisos para editar" });
      const { vendedor, cliente, sku, producto, cantidad, celular, fechaTope, observaciones, estado, observacionesCompras, categoria } = req.body;
      const estadosValidos = ["Pendiente", "En Proceso", "Completada", "Cancelada", "Agotado"];
      if (estado && !estadosValidos.includes(estado)) {
        return res.status(400).json({ message: `Estado inválido: "${estado}". Valores permitidos: ${estadosValidos.join(", ")}` });
      }
      const updated = await updateSolicitudEdicion(id, {
        cliente, sku, producto, cantidad,
        celular, fechaTope, observaciones,
        estado, categoria, observacionesCompras,
      }, email);
      if (!updated) return res.status(404).json({ message: "Solicitud no encontrada" });
      res.json(updated);
      // Notificar al vendedor si quien editó es compras o admin y hubo cambio de estado u obs. compras
      try {
        if (updated.vendedor && (u.rol === "compras" || u.rol === "admin")) {
          const changes: string[] = [];
          if (estado !== undefined) changes.push(`<b>Estado:</b> ${estado}`);
          if (observacionesCompras !== undefined) changes.push(`<b>Obs. Compras:</b> ${observacionesCompras || "—"}`);
          if (changes.length > 0) {
            const todosUsuarios = await getUsuarios();
            const vendedorUser = todosUsuarios.find((x: any) => x.email === updated.vendedor && x.telegramChatId);
            if (vendedorUser?.telegramChatId) {
              const msg = [
                `💬 <b>Solicitud #${id} actualizada</b>`,
                `<b>Producto:</b> ${updated.producto || ""}`,
                `<b>Cliente:</b> ${updated.cliente || ""}`,
                ...changes,
                `<b>Por:</b> ${email}`,
              ].join("\n");
              sendTelegram(msg, vendedorUser.telegramChatId).then(async msgId => {
                if (msgId) await addTelegramNotificacion({ telegramMessageId: String(msgId), solicitudId: Number(id), destinatarioEmail: vendedorUser.email }).catch(() => {});
              }).catch(() => {});
            }
          }
        }
      } catch {}
    } catch (e: any) {
      console.error(`Error updateSolicitudEdicion (id=${req.params.id}):`, e?.stack || e?.message || e);
      res.status(500).json({ message: `Error al editar solicitud: ${e?.message || "Error interno"}` });
    }
  });

  // Serve uploaded solicitud files
  app.get("/uploads/solicitudes/:filename", (req: any, res: any) => {
    const filename = path.basename(req.params.filename); // prevent path traversal
    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "Archivo no encontrado" });
    res.sendFile(filePath);
  });

  // GET /api/solicitudes/:id/mensajes
  app.get("/api/solicitudes/:id/mensajes", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const msgs = await getMensajesBySolicitud(id);
      res.json(msgs);
    } catch (e: any) {
      res.status(500).json({ message: "Error al obtener mensajes" });
    }
  });

  // POST /api/solicitudes/:id/mensajes (texto)
  app.post("/api/solicitudes/:id/mensajes", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { autor, autorNombre, mensaje } = req.body;
      if (!autor || !mensaje?.trim()) return res.status(400).json({ message: "Datos inválidos" });
      const nuevo = await addSolicitudMensaje({ solicitudId: Number(id), autor, autorNombre, mensaje, source: "web" });
      res.status(201).json(nuevo);
      // Notificar a la otra parte via Telegram
      try {
        const sol = await getSolicitudById(Number(id));
        const todosUsuarios = await getUsuarios();
        const u = todosUsuarios.find((x: any) => x.email === autor);
        if (sol && u) {
          const isVendedorRole = u.rol === "vendedor" || u.rol === "supervisor_caja";
          const otrosEmails: string[] = isVendedorRole
            ? todosUsuarios.filter((x: any) => x.rol === "compras" && x.activo?.toLowerCase() === "true").map((x: any) => x.email)
            : [sol.vendedor];
          for (const email of otrosEmails) {
            const otro = todosUsuarios.find((x: any) => x.email === email && x.telegramChatId);
            if (otro) {
              const msgText = `💬 <b>Solicitud #${id}</b> — ${sol.producto || ""}
<b>${u.nombre || autor}:</b> ${mensaje.substring(0, 200)}`;
              sendTelegram(msgText, otro.telegramChatId).then(async msgId => {
                if (msgId) await addTelegramNotificacion({ telegramMessageId: String(msgId), solicitudId: Number(id), destinatarioEmail: otro.email }).catch(() => {});
              }).catch(() => {});
            }
          }
        }
      } catch {}
    } catch (e: any) {
      res.status(500).json({ message: "Error al enviar mensaje" });
    }
  });

  // POST /api/solicitudes/:id/adjuntos (archivo)
  app.post("/api/solicitudes/:id/adjuntos", uploadSolicitud.single("archivo"), async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { autor, autorNombre } = req.body;
      if (!autor || !req.file) return res.status(400).json({ message: "Datos inválidos" });
      const adjuntoUrl = `/uploads/solicitudes/${req.file.filename}`;
      const nuevo = await addSolicitudMensaje({
        solicitudId: Number(id),
        autor,
        autorNombre: autorNombre || autor,
        mensaje: req.body.mensaje || null,
        adjuntoUrl,
        adjuntoNombre: req.file.originalname,
        adjuntoTipo: req.file.mimetype,
        source: "web",
      });
      res.status(201).json(nuevo);
      // Notificar a la otra parte via Telegram
      try {
        const sol = await getSolicitudById(Number(id));
        const todosUsuarios = await getUsuarios();
        const u = todosUsuarios.find((x: any) => x.email === autor);
        if (sol && u) {
          const isVendedorRole = u.rol === "vendedor" || u.rol === "supervisor_caja";
          const otrosEmails: string[] = isVendedorRole
            ? todosUsuarios.filter((x: any) => x.rol === "compras" && x.activo?.toLowerCase() === "true").map((x: any) => x.email)
            : [sol.vendedor];
          for (const email of otrosEmails) {
            const otro = todosUsuarios.find((x: any) => x.email === email && x.telegramChatId);
            if (otro) {
              const msgText = `📎 <b>Solicitud #${id}</b> — ${sol.producto || ""}
<b>${u.nombre || autor}</b> adjuntó: ${req.file.originalname}`;
              sendTelegram(msgText, otro.telegramChatId).then(async msgId => {
                if (msgId) await addTelegramNotificacion({ telegramMessageId: String(msgId), solicitudId: Number(id), destinatarioEmail: otro.email }).catch(() => {});
              }).catch(() => {});
            }
          }
        }
      } catch {}
    } catch (e: any) {
      res.status(500).json({ message: "Error al subir archivo" });
    }
  });

  app.delete("/api/solicitudes/:id", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Credenciales requeridas" });
      const usuarios = await getUsuarios();
      const u = usuarios.find((x: any) => x.email === email && x.password === password && x.activo?.toLowerCase() === "true");
      if (!u) return res.status(401).json({ message: "Credenciales incorrectas" });
      if (u.rol !== "admin" && u.rol !== "compras") return res.status(403).json({ message: "Sin permisos para eliminar" });
      const deleted = await deleteSolicitud(id);
      if (!deleted) return res.status(404).json({ message: "Solicitud no encontrada" });
      res.json({ message: "Solicitud eliminada" });
    } catch (e: any) {
      console.error("Error deleteSolicitud:", e.message);
      res.status(500).json({ message: "Error al eliminar solicitud" });
    }
  });

  // ===== ODOO =====
  app.get("/api/odoo/clientes", async (req: any, res: any) => {
    try {
      const q = String(req.query.q || "");
      if (!q) return res.json([]);
      const result = await searchClientes(q);
      res.json(result);
    } catch (e: any) {
      console.error("Error odoo clientes:", e.message);
      res.status(500).json({ message: "Error al buscar clientes en Odoo" });
    }
  });

  app.get("/api/odoo/productos", async (req: any, res: any) => {
    try {
      const q = String(req.query.q || "");
      if (!q) return res.json([]);
      const result = await searchProductos(q);
      res.json(result);
    } catch (e: any) {
      console.error("Error odoo productos:", e.message);
      res.status(500).json({ message: "Error al buscar productos en Odoo" });
    }
  });

  app.post("/api/odoo/clientes", async (req: any, res: any) => {
    try {
      const { name, vat, phone, mobile, email } = req.body;
      if (!name) return res.status(400).json({ message: "Nombre requerido" });
      const result = await createCliente({ name, vat, phone, mobile, email });
      res.status(201).json(result);
    } catch (e: any) {
      console.error("Error odoo crear cliente:", e.message);
      res.status(500).json({ message: "Error al crear cliente en Odoo" });
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

  // Middleware de autenticación para endpoints del conciliador
  const CONCILIADOR_SECRET = process.env.CONCILIADOR_SECRET || "";
  function requireConciliadorToken(req: any, res: any, next: any) {
    if (!CONCILIADOR_SECRET) return next(); // si no está configurado, se permite (retrocompatibilidad)
    const token = req.headers["x-conciliador-token"] || req.body?.conciliadorToken;
    if (token !== CONCILIADOR_SECRET) return res.status(401).json({ message: "Token de conciliador inválido" });
    next();
  }

  // ── Conciliador: POST /api/pagos/:id/conciliar ──
  app.post("/api/pagos/:id/conciliar", requireConciliadorToken, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { accion, conciliadoPor } = req.body;
      if (accion !== "conciliar") return res.status(400).json({ message: "accion debe ser 'conciliar'" });
      await conciliarPago(Number(id), conciliadoPor || "conciliador");
      res.json({ ok: true, id });
    } catch (e: any) {
      console.error("Error conciliar pago:", e.message);
      res.status(500).json({ message: "Error al conciliar pago" });
    }
  });

  // ── Conciliador: PUT /api/pagos/:id — actualizar estado + conciliadoEn/conciliadoPor ──
  app.put("/api/pagos/:id", requireConciliadorToken, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { estado, validadoPor, validadoEn, conciliadoEn, conciliadoPor } = req.body;
      const updateData: Record<string, any> = {};
      if (estado)        updateData.estado        = estado;
      if (validadoPor)   updateData.validadoPor   = validadoPor;
      if (validadoEn)    updateData.validadoEn    = new Date(validadoEn);
      if (conciliadoEn)  updateData.conciliadoEn  = new Date(conciliadoEn);
      if (conciliadoPor) updateData.conciliadoPor = conciliadoPor;
      if (Object.keys(updateData).length === 0) return res.status(400).json({ message: "Sin campos a actualizar" });
      const [updated] = await db.update(pagos).set(updateData).where(eq(pagos.id, Number(id))).returning();
      if (!updated) return res.status(404).json({ message: "Pago no encontrado" });
      res.json(updated);
    } catch (e: any) {
      console.error("Error PUT pago:", e.message);
      res.status(500).json({ message: "Error al actualizar pago" });
    }
  });

  // ── Webhook: POST /api/auto-validar-pago ──
  app.post("/api/auto-validar-pago", requireConciliadorToken, async (req: any, res: any) => {
    try {
      const { pagoId, conciliadoPor } = req.body;
      if (!pagoId) return res.status(400).json({ message: "pagoId requerido" });
      await conciliarPago(Number(pagoId), conciliadoPor || "conciliador");
      res.json({ ok: true });
    } catch (e: any) {
      console.error("Error auto-validar-pago:", e.message);
      res.status(500).json({ message: "Error al conciliar pago" });
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

  app.post("/api/usuarios/cambiar-password", async (req: any, res: any) => {
    try {
      const { email, passwordActual, passwordNueva } = req.body;
      if (!email || !passwordActual || !passwordNueva) return res.status(400).json({ message: "Campos requeridos" });
      const usuarios = await getUsuarios();
      const u = usuarios.find((x: any) => x.email === email && x.password === passwordActual && x.activo?.toLowerCase() === "true");
      if (!u) return res.status(401).json({ message: "Contraseña actual incorrecta" });
      if (passwordNueva.length < 4) return res.status(400).json({ message: "La nueva contraseña debe tener al menos 4 caracteres" });
      await updateUsuario(u.id, { password: passwordNueva });
      res.json({ message: "Contraseña actualizada correctamente" });
    } catch (e: any) {
      console.error("Error cambiar-password:", e.message);
      res.status(500).json({ message: "Error al cambiar contraseña" });
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


  app.delete("/api/usuarios/:id", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Credenciales requeridas" });
      const usuarios = await getUsuarios();
      const solicitante = usuarios.find((x: any) => x.email === email && x.password === password && x.activo?.toLowerCase() === "true");
      if (!solicitante || solicitante.rol !== "admin") return res.status(403).json({ message: "Solo administradores pueden eliminar usuarios" });
      const objetivo = usuarios.find((u: any) => String(u.id) === String(id));
      if (!objetivo) return res.status(404).json({ message: "Usuario no encontrado" });
      if (String(solicitante.id) === String(id)) return res.status(400).json({ message: "No puedes eliminar tu propia cuenta" });
      const deleted = await deleteUsuario(id);
      if (!deleted) return res.status(404).json({ message: "No se pudo eliminar el usuario" });
      res.json({ message: "Usuario eliminado correctamente" });
    } catch (e: any) {
      console.error("Error deleteUsuario:", e.message);
      res.status(500).json({ message: "Error al eliminar usuario" });
    }
  });

  app.post("/api/telegram-webhook", async (req: any, res: any) => {
    res.json({ ok: true }); // Responder inmediatamente a Telegram
    try {
      const { message } = req.body;
      if (!message?.chat?.id) return;
      const chatId = String(message.chat.id);
      const todosUsuarios = await getUsuarios();
      const u = todosUsuarios.find((x: any) => x.telegramChatId === chatId);
      if (!u) return;

      const text = String(message.text || message.caption || "");

      // Comandos
      if (text === "/start" || text === "/start@" + (process.env.TELEGRAM_BOT_USERNAME || "")) {
        await sendTelegram(
          `¡Hola ${u.nombre}! Tus notificaciones están activas.\n\nResponde cualquier notificación de solicitud para enviar un mensaje al chat de esa solicitud.`,
          chatId
        );
        return;
      }
      if (text.startsWith("/vincular")) {
        const nuevoChatId = text.split(" ")[1];
        if (nuevoChatId) {
          await updateUsuarioTelegramChatId(u.email, nuevoChatId);
          await sendTelegram(`¡Vinculado! Recibirás notificaciones de pagos.`, chatId);
        }
        return;
      }

      // Solo procesar si es una respuesta a una notificación rastreada
      const replyToMsgId = message.reply_to_message?.message_id;
      if (!replyToMsgId) return;

      const notif = await getTelegramNotificacion(String(replyToMsgId));
      if (!notif) return;

      const solicitudId = notif.solicitudId;

      // Manejar archivos adjuntos (documento o foto)
      let adjuntoUrl: string | null = null;
      let adjuntoNombre: string | null = null;
      let adjuntoTipo: string | null = null;
      const fileObj: any = message.document || (message.photo ? message.photo[message.photo.length - 1] : null);
      if (fileObj) {
        try {
          const fileInfoR = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileObj.file_id}`);
          const fileInfo = await fileInfoR.json() as any;
          if (fileInfo.ok) {
            const tgFilePath: string = fileInfo.result.file_path;
            const fileResponse = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${tgFilePath}`);
            const buffer = Buffer.from(await fileResponse.arrayBuffer());
            const originalName: string = message.document?.file_name || `foto_${Date.now()}.jpg`;
            const safeName = `${Date.now()}_${originalName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
            fs.mkdirSync(UPLOADS_DIR, { recursive: true });
            fs.writeFileSync(path.join(UPLOADS_DIR, safeName), buffer);
            adjuntoUrl = `/uploads/solicitudes/${safeName}`;
            adjuntoNombre = originalName;
            adjuntoTipo = message.document?.mime_type || "image/jpeg";
          }
        } catch (e) { console.error("Error descargando archivo de Telegram:", e); }
      }

      if (!text && !adjuntoUrl) return;

      // Guardar mensaje en DB
      await addSolicitudMensaje({
        solicitudId,
        autor: u.email,
        autorNombre: u.nombre,
        mensaje: text || null,
        adjuntoUrl,
        adjuntoNombre,
        adjuntoTipo,
        source: "telegram",
      });

      // Notificar a la otra parte
      const sol = await getSolicitudById(solicitudId);
      if (sol) {
        const isVendedorRole = u.rol === "vendedor" || u.rol === "supervisor_caja";
        const otrosEmails: string[] = isVendedorRole
          ? todosUsuarios.filter((x: any) => x.rol === "compras" && x.activo?.toLowerCase() === "true").map((x: any) => x.email)
          : [sol.vendedor];
        const preview = text ? text.substring(0, 150) : "[archivo adjunto]";
        for (const email of otrosEmails) {
          const otro = todosUsuarios.find((x: any) => x.email === email && x.telegramChatId);
          if (otro) {
            const msgText = `💬 <b>Solicitud #${solicitudId}</b> — ${sol.producto || ""}\n<b>${u.nombre}:</b> ${preview}`;
            sendTelegram(msgText, otro.telegramChatId).then(async msgId => {
              if (msgId) await addTelegramNotificacion({ telegramMessageId: String(msgId), solicitudId, destinatarioEmail: otro.email }).catch(() => {});
            }).catch(() => {});
          }
        }
      }

      // Confirmar al remitente
      sendTelegram(`✅ Mensaje guardado en Solicitud #${solicitudId}.`, chatId).catch(() => {});

    } catch (e: any) {
      console.error("Error telegram webhook:", e.message);
    }
  });

  // ===== PERMISOS DE ROLES (RBAC dinámico) =====

  // GET /api/permisos-roles — devuelve todos los permisos (matriz completa)
  // GET /api/permisos-roles?rol=<rol> — devuelve solo los permisos del rol indicado
  app.get("/api/permisos-roles", async (req: any, res: any) => {
    try {
      const rol = req.query.rol as string | undefined;
      if (rol) {
        const rows = await getPermisosRolesByRol(rol);
        return res.json(rows);
      }
      const rows = await getPermisosRoles();
      res.json(rows);
    } catch (e: any) {
      console.error("Error getPermisosRoles:", e.message);
      res.status(500).json({ message: "Error al obtener permisos" });
    }
  });

  // PATCH /api/permisos-roles — actualiza un permiso (solo admin)
  // Body: { adminEmail: string, rol: string, pagina: string, permitido: boolean }
  app.patch("/api/permisos-roles", async (req: any, res: any) => {
    try {
      const schema = z.object({
        adminEmail: z.string().min(1),
        rol:        z.string().min(1),
        pagina:     z.string().min(1),
        permitido:  z.boolean(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });

      // Verificar que quien hace la petición es admin
      const todos = await getUsuarios();
      const admin = todos.find((x: any) => x.email === parsed.data.adminEmail && x.rol === "admin" && x.activo?.toLowerCase() === "true");
      if (!admin) return res.status(403).json({ message: "Solo administradores pueden cambiar permisos" });

      // El rol admin siempre tiene todo permitido — no se puede cambiar
      if (parsed.data.rol === "admin") return res.status(422).json({ message: "Los permisos del rol admin no se pueden modificar" });

      const result = await updatePermisoRol(parsed.data.rol, parsed.data.pagina, parsed.data.permitido);
      res.json(result);
    } catch (e: any) {
      console.error("Error updatePermisoRol:", e.message);
      res.status(500).json({ message: "Error al actualizar permiso" });
    }
  });
}
