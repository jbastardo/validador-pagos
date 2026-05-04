import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import {
  getPagos, addPago, updatePagoEstado, updatePagoCajero, updatePagoCajeroPendiente, updatePagoFacturaCliente, checkDuplicado,
  deletePago, deletePagoDivisa, deleteUsuario,
  getUsuarios, addUsuario, updateUsuario, updateUsuarioTelegramChatId,
  getPagosDivisas, addPagoDivisa, updatePagoDivisaEstado, updatePagoDivisaEdicion,
  updatePagoEdicion,
     getSolicitudes, addSolicitud, updateSolicitudEstado, deleteSolicitud, updateSolicitudEdicion,
  importPagosBatch, importPagosDivisasBatch, importSolicitudesBatch, importExtractosBatch, importUsuariosBatch,
} from "./db";
import {
  addMovimientos, getMovimientos, deleteMovimientosBanco,
  marcarUsado, tryMatch, getExtractosStats,
  db,
} from "./db";
import { parseExtractoExcel } from "./extractos";
import { z } from "zod";
import { BANCOS_RECEPTOR_META, pagos } from "../shared/schema";
import { eq } from "drizzle-orm";
import { searchClientes, searchProductos, createCliente } from "./odoo";

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
  });
}

async function sendTelegramToVendedor(vendedorEmail: string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    const usuarios = await getUsuarios();
    const u = usuarios.find(x => x.email === vendedorEmail);
    if (u?.telegramChatId) {
      await sendTelegram(text, u.telegramChatId);
    } else if (TELEGRAM_CHAT_ID) {
      await sendTelegram(text, TELEGRAM_CHAT_ID);
    }
  } catch (e) {
    console.error("Error sendTelegramToVendedor:", e);
  }
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ===== AUTH =====
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Campos requeridos" });
    try {
      const usuarios = await getUsuarios();
      const u = usuarios.find(x => x.email === email && x.password === password && x.activo?.toLowerCase() === "true");
      if (!u) return res.status(401).json({ message: "Credenciales incorrectas" });
      res.json({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, solicitudes: u.solicitudes === "true" });
    } catch (e: any) {
      console.error("Error login:", e.message);
      res.status(500).json({ message: "Error al verificar credenciales" });
    }
  });

  // ===== PAGOS BS =====
  app.get("/api/pagos", async (_req, res) => {
    try {
      const pagos = await getPagos();
      res.json(pagos.sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime()));
    } catch (e: any) {
      console.error("Error getPagos:", e.message);
      res.status(500).json({ message: "Error al obtener pagos de Google Sheets" });
    }
  });

  app.post("/api/pagos", async (req, res) => {
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

      // ── Auto-conciliación contra extractos bancarios ──
      const match = await tryMatch(data.tipoPago, data.bancoReceptor, data.fechaPago, data.monto, data.referencia || "", data.celular || "");
      const estadoInicial = match ? "Verificado" : "Pendiente";
      const validadoPorInicial = match ? "Auto-conciliado (Extracto)" : "";
      const matchId = match ? match.id : null;

      const nuevo = await addPago({
        ...data,
        estado: estadoInicial,
        validadoPor: validadoPorInicial,
        megasoft: "",
        creadoEn: new Date().toISOString(),
      });

      // Marcar el movimiento del extracto como usado
      if (matchId) {
        marcarUsado(matchId).catch(e => console.warn("marcarUsado error:", e.message));
      }

      // Notificar al conciliador para auto-validación contra extractos bancarios
      // Requiere variable de entorno CONCILIADOR_URL apuntando a la URL del conciliador (ej: https://conciliador-app.up.railway.app)
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
      res.status(500).json({ message: "Error al guardar pago en Google Sheets" });
    }
  });

  app.patch("/api/pagos/:id/estado", async (req, res) => {
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
      res.status(500).json({ message: "Error al actualizar estado en Google Sheets" });
    }
  });

  // Cajero edita pagos Verificados (factura + cliente + megasoft)
  app.patch("/api/pagos/:id/cajero", async (req, res) => {
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
      const pago = pagos.find(p => p.id === id);
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
  app.patch("/api/pagos/:id/cajero-pendiente", async (req, res) => {
    try {
      const { id } = req.params;
      const schema = z.object({
        factura:     z.string().optional().default(""),
        cliente:     z.string().optional().default(""),
        megasoft:    z.enum(["Sí", "No", ""]).optional().default(""),
        cajeroEmail: z.string().min(1),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos" });
      const pagos = await getPagos();
      const pago = pagos.find(p => p.id === id);
      if (!pago) return res.status(404).json({ message: "Pago no encontrado" });

      const updated = await updatePagoCajeroPendiente(
        id, parsed.data.factura, parsed.data.cliente, parsed.data.megasoft, parsed.data.cajeroEmail
      );
      res.json(updated);
    } catch (e: any) {
      console.error("Error updatePagoCajeroPendiente:", e.message);
      res.status(500).json({ message: "Error al actualizar pago" });
    }
  });

  // Cajero edita factura, cliente y megasoft en CUALQUIER estado (sin restricción de estado)
  // Si megasoft="Sí" → auto-valida como "Verificado" con el cajero como validador
  app.patch("/api/pagos/:id/factura-cliente", async (req, res) => {
    try {
      const { id } = req.params;
      const schema = z.object({
        factura:     z.string().optional().default(""),
        cliente:     z.string().optional().default(""),
        megasoft:    z.enum(["Sí", "No", ""]).optional().default(""),
        cajeroEmail: z.string().optional().default(""),
        rif:         z.string().optional().default(""),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos" });
      const updated = await updatePagoFacturaCliente(id, parsed.data.factura, parsed.data.cliente, parsed.data.megasoft, parsed.data.cajeroEmail, parsed.data.rif);
      if (!updated) return res.status(404).json({ message: "Pago no encontrado" });
      res.json(updated);
    } catch (e: any) {
      console.error("Error updatePagoFacturaCliente:", e.message);
      res.status(500).json({ message: "Error al actualizar factura/cliente" });
    }
  });

  // ===== PAGOS DIVISAS =====
  app.get("/api/pagos-divisas", async (_req, res) => {
    try {
      const pagos = await getPagosDivisas();
      res.json(pagos.sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime()));
    } catch (e: any) {
      console.error("Error getPagosDivisas:", e.message);
      res.status(500).json({ message: "Error al obtener pagos en divisas" });
    }
  });

  app.post("/api/pagos-divisas", async (req, res) => {
    try {
      const schema = z.object({
        fecha:         z.string().min(1),
        nombrePagador: z.string().min(1),
        correo:        z.string().optional().default(""),
        monto:         z.string().min(1),
        tipo:          z.string().min(1),
        referencia:    z.string().optional().default(""),
        cliente:       z.string().optional().default(""),
        rif:           z.string().min(1, "CI / RIF es obligatorio"),
        factura:       z.string().optional().default(""),
        observaciones: z.string().optional().default(""),
        vendedor:      z.string().min(1),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      const nuevo = await addPagoDivisa({ ...parsed.data, estado: "Pendiente", validadoPor: "", creadoEn: new Date().toISOString() });
      res.status(201).json(nuevo);
    } catch (e: any) {
      console.error("Error addPagoDivisa:", e.message);
      res.status(500).json({ message: "Error al guardar pago en divisas" });
    }
  });

  // PATCH /api/pagos/:id/editar (admin / contabilidad / vendedor)
  app.patch("/api/pagos/:id/editar", async (req, res) => {
    try {
      const { id } = req.params;
      const { email, rol } = req.body;
      if (!email) return res.status(400).json({ message: "Email requerido" });
      const usuarios = await getUsuarios();
      const u = usuarios.find(x => x.email === email && (x.rol === "admin" || x.rol === "contabilidad" || x.rol === "vendedor" || x.rol === "compras") && x.activo?.toLowerCase() === "true");
      if (!u) return res.status(403).json({ message: "Sin permisos para editar" });
      const { fechaPago, bancoEmisor, bancoReceptor, monto, referencia, celular, cliente, observaciones, rif, factura, megasoft, cajeroEmail } = req.body;
      if (!fechaPago || !monto) return res.status(400).json({ message: "Campos requeridos" });
      const updated = await updatePagoEdicion(id, {
        fechaPago, bancoEmisor: bancoEmisor ?? "", bancoReceptor: bancoReceptor ?? "", monto,
        referencia: referencia ?? "", celular: celular ?? "", cliente: cliente ?? undefined,
        observaciones: observaciones ?? undefined, rif: rif ?? undefined,
        factura: factura ?? undefined, megasoft: megasoft ?? undefined, cajeroEmail: cajeroEmail ?? undefined,
      });
      if (!updated) return res.status(404).json({ message: "Pago no encontrado" });
      res.json(updated);
    } catch (e: any) {
      console.error("Error updatePagoEdicion:", e.message);
      res.status(500).json({ message: "Error al editar pago" });
    }
  });

  // PATCH /api/pagos-divisas/:id/editar (admin / contabilidad / vendedor)
  app.patch("/api/pagos-divisas/:id/editar", async (req, res) => {
    try {
      const { id } = req.params;
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email requerido" });
      const usuarios = await getUsuarios();
      const u = usuarios.find(x => x.email === email && (x.rol === "admin" || x.rol === "contabilidad" || x.rol === "vendedor" || x.rol === "compras") && x.activo?.toLowerCase() === "true");
      if (!u) return res.status(403).json({ message: "Sin permisos para editar" });
      const { fecha, nombrePagador, monto, tipo, referencia, observaciones } = req.body;
      if (!fecha || !monto || !nombrePagador) return res.status(400).json({ message: "Campos requeridos" });
      const updated = await updatePagoDivisaEdicion(id, { fecha, nombrePagador, monto, tipo: tipo ?? "", referencia: referencia ?? "", observaciones: observaciones ?? undefined });
      if (!updated) return res.status(404).json({ message: "Pago en divisas no encontrado" });
      res.json(updated);
    } catch (e: any) {
      console.error("Error updatePagoDivisaEdicion:", e.message);
      res.status(500).json({ message: "Error al editar pago en divisas" });
    }
  });

  // PATCH /api/pagos-divisas/:id/estado
  app.patch("/api/pagos-divisas/:id/estado", async (req, res) => {
    try {
      const { id } = req.params;
      const { estado, validadoPor, observaciones } = req.body;
      if (!estado || !validadoPor) return res.status(400).json({ message: "Campos requeridos" });
      const updated = await updatePagoDivisaEstado(id, estado, validadoPor, observaciones ?? "");
      if (!updated) return res.status(404).json({ message: "Pago en divisas no encontrado" });
      res.json(updated);
    } catch (e: any) {
      console.error("Error updatePagoDivisaEstado:", e.message);
      res.status(500).json({ message: "Error al actualizar estado" });
    }
  });

  // ===== DELETE (admin o contabilidad, requiere revalidación de clave) =====
  app.delete("/api/pagos/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Credenciales requeridas" });
      const usuarios = await getUsuarios();
      const u = usuarios.find(x => x.email === email && x.password === password && (x.rol === "admin" || x.rol === "contabilidad") && x.activo?.toLowerCase() === "true");
      if (!u) return res.status(401).json({ message: "Credenciales incorrectas o sin permisos" });
      const ok = await deletePago(id);
      if (!ok) return res.status(404).json({ message: "Pago no encontrado" });
      res.json({ message: "Eliminado" });
    } catch (e: any) {
      console.error("Error deletePago:", e.message);
      res.status(500).json({ message: "Error al eliminar" });
    }
  });

  app.delete("/api/pagos-divisas/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Credenciales requeridas" });
      const usuarios = await getUsuarios();
      const u = usuarios.find(x => x.email === email && x.password === password && (x.rol === "admin" || x.rol === "contabilidad") && x.activo?.toLowerCase() === "true");
      if (!u) return res.status(401).json({ message: "Credenciales incorrectas o sin permisos" });
      const ok = await deletePagoDivisa(id);
      if (!ok) return res.status(404).json({ message: "Pago en divisas no encontrado" });
      res.json({ message: "Eliminado" });
    } catch (e: any) {
      console.error("Error deletePagoDivisa:", e.message);
      res.status(500).json({ message: "Error al eliminar" });
    }
  });

  app.delete("/api/usuarios/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Credenciales requeridas" });
      const usuarios = await getUsuarios();
      const u = usuarios.find(x => x.email === email && x.password === password && x.rol === "admin" && x.activo?.toLowerCase() === "true");
      if (!u) return res.status(401).json({ message: "Credenciales incorrectas o sin permisos" });
      const ok = await deleteUsuario(id);
      if (!ok) return res.status(404).json({ message: "Usuario no encontrado" });
      res.json({ message: "Eliminado" });
    } catch (e: any) {
      console.error("Error deleteUsuario:", e.message);
      res.status(500).json({ message: "Error al eliminar" });
    }
  });

  // ===== STATS =====
  function toISO(d: string): string {
    if (!d) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    const parts = d.split("/");
    if (parts.length !== 3) return d;
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }

  app.get("/api/stats", async (req, res) => {
    try {
      let [pagos, divisas] = await Promise.all([getPagos(), getPagosDivisas()]);
      const { fechaDesde, fechaHasta } = req.query as Record<string, string>;
      if (fechaDesde) {
        pagos = pagos.filter(p => toISO(p.fechaPago) >= fechaDesde);
        divisas = divisas.filter(p => toISO(p.fecha) >= fechaDesde);
      }
      if (fechaHasta) {
        pagos = pagos.filter(p => toISO(p.fechaPago) <= fechaHasta);
        divisas = divisas.filter(p => toISO(p.fecha) <= fechaHasta);
      }
      const verificados = pagos.filter(p => p.estado === "Verificado");
      res.json({
        total:             pagos.length,
        pendientes:        pagos.filter(p => p.estado === "Pendiente").length,
        verificados:       verificados.length,
        rechazados:        pagos.filter(p => p.estado === "Rechazado").length,
        rechazadosMegasoft: pagos.filter(p => p.estado === "Rechazado Megasoft").length,
        pagoMovil:         pagos.filter(p => p.tipoPago === "PagoMovil").length,
        transferencias:    pagos.filter(p => p.tipoPago === "Transferencia").length,
        montoTotal:        pagos.filter(p => p.estado !== "Rechazado" && p.estado !== "Rechazado Megasoft").reduce((s, p) => s + parseFloat(p.monto || "0"), 0),
        megasoftSi:        verificados.filter(p => p.megasoft === "Sí").length,
        megasoftNo:        verificados.filter(p => p.megasoft === "No").length,
        megasoftPendiente: verificados.filter(p => !p.megasoft || p.megasoft === "").length,
        montoMegasoftSi:   verificados.filter(p => p.megasoft === "Sí").reduce((s, p) => s + parseFloat(p.monto || "0"), 0),
        sinFactura:        pagos.filter(p => p.estado !== "Rechazado" && p.estado !== "Rechazado Megasoft" && (!p.factura || p.factura.trim() === "")).length,
        montoPendientesBs: pagos.filter(p => p.estado === "Pendiente").reduce((s, p) => s + parseFloat(p.monto || "0"), 0),
        // Divisas
        totalDivisas:      divisas.length,
        pendientesDivisas: divisas.filter(p => p.estado === "Pendiente").length,
        montoDivisas:      divisas.filter(p => p.estado !== "Rechazado").reduce((s, p) => s + parseFloat(p.monto || "0"), 0),
        montoPendientesDivisas: divisas.filter(p => p.estado === "Pendiente").reduce((s, p) => s + parseFloat(p.monto || "0"), 0),
      });
    } catch (e: any) {
      res.status(500).json({ message: "Error al obtener estadísticas" });
    }
  });

  // ===== USUARIOS (persistidos en Sheets) =====
  app.get("/api/usuarios", async (_req, res) => {
    try {
      const usuarios = await getUsuarios();
      res.json(usuarios.map(u => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, activo: u.activo, solicitudes: u.solicitudes })));
    } catch (e: any) {
      res.status(500).json({ message: "Error al obtener usuarios" });
    }
  });

  app.post("/api/usuarios", async (req, res) => {
    try {
      const { nombre, email, password, rol, solicitudes } = req.body;
      if (!nombre || !email || !password) return res.status(400).json({ message: "Campos requeridos" });
      const usuarios = await getUsuarios();
      if (usuarios.find(u => u.email === email)) return res.status(409).json({ message: "El email ya está registrado" });
      const newId = String(Math.max(...usuarios.map(u => parseInt(u.id) || 0)) + 1);
      const newUser = await addUsuario({ id: newId, nombre, email, password, rol: rol ?? "vendedor", activo: "true", solicitudes: solicitudes ?? "false" });
      res.status(201).json({ id: newUser.id, nombre: newUser.nombre, email: newUser.email, rol: newUser.rol, activo: newUser.activo, solicitudes: newUser.solicitudes });
    } catch (e: any) {
      console.error("Error addUsuario:", e.message);
      res.status(500).json({ message: "Error al crear usuario" });
    }
  });

  app.patch("/api/usuarios/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const usuarios = await getUsuarios();
      const usuario = usuarios.find(u => u.id === id);
      if (!usuario) return res.status(404).json({ message: "Usuario no encontrado" });
      const updated = await updateUsuario(id, { ...usuario, ...req.body });
      res.json({ id: updated.id, nombre: updated.nombre, email: updated.email, rol: updated.rol, activo: updated.activo, solicitudes: updated.solicitudes });
    } catch (e: any) {
      console.error("Error updateUsuario:", e.message);
      res.status(500).json({ message: "Error al actualizar usuario" });
    }
  });

  // ===== EXTRACTOS BANCARIOS =====
  const BANCOS_VALIDOS = BANCOS_RECEPTOR_META.map(b => b.codigo);

  app.get("/api/extractos/:banco", async (req, res) => {
    try {
      const { banco } = req.params;
      if (!BANCOS_VALIDOS.includes(banco)) return res.status(400).json({ message: "Banco no válido" });
      const movimientos = await getMovimientos(banco);
      res.json(movimientos);
    } catch (e: any) { res.status(500).json({ message: "Error al obtener extractos" }); }
  });

  app.get("/api/extractos-stats", async (_req, res) => {
    try {
      const stats = await getExtractosStats();
      res.json(stats);
    } catch (e: any) { res.status(500).json({ message: "Error al obtener estadísticas" }); }
  });

  app.post("/api/extractos/:banco", upload.single("file"), async (req, res) => {
    try {
      const { banco } = req.params;
      if (!BANCOS_VALIDOS.includes(banco)) return res.status(400).json({ message: "Banco no válido" });
      const file = req.file;
      if (!file) return res.status(400).json({ message: "Archivo requerido" });
      const subidoPor = (req.body.subidoPor as string) || "system";
      const result = parseExtractoExcel(file.buffer, banco, subidoPor);
      if (result.movimientos.length === 0) return res.status(400).json({ message: "No se encontraron movimientos válidos", warnings: result.warnings });
      await deleteMovimientosBanco(banco);
      await addMovimientos(result.movimientos);
      console.log(`Extracto ${banco}: ${result.movimientos.length} movimientos cargados, ${result.skipped} saltados`);

      // ── Re-conciliar pagos pendientes contra los nuevos extractos ──
      let conciliados = 0;
      const allPagos = await getPagos();
      const pendientes = allPagos.filter(p => p.estado === "Pendiente");
      console.log(`Re-conciliando ${pendientes.length} pagos pendientes contra extractos...`);
      for (const pago of pendientes) {
        const match = await tryMatch(pago.tipoPago, pago.bancoReceptor, pago.fechaPago, pago.monto, pago.referencia || "", pago.celular || "");
        if (match) {
          await db.update(pagos).set({
            estado: "Verificado",
            validadoPor: "Auto-conciliado (Extracto)",
            validadoEn: new Date(),
            conciliadoEn: new Date(),
            conciliadoPor: subidoPor,
          }).where(eq(pagos.id, pago.id));
          await marcarUsado(match.id);
          conciliados++;
          console.log(`  ✓ Pago #${pago.id} conciliado con extracto ${match.id}`);
        }
      }
      console.log(`Conciliación completada: ${conciliados} pagos conciliados`);

      res.json({ message: `Extracto cargado: ${result.movimientos.length} movimientos${conciliados > 0 ? `, ${conciliados} pagos conciliados` : ""}`, conciliados, warnings: result.warnings });
    } catch (e: any) {
      console.error("Error upload extracto:", e.message);
      res.status(500).json({ message: "Error al procesar extracto: " + e.message });
    }
  });

  app.delete("/api/extractos/:banco", async (req, res) => {
    try {
      const { banco } = req.params;
      if (!BANCOS_VALIDOS.includes(banco)) return res.status(400).json({ message: "Banco no válido" });
      const deleted = await deleteMovimientosBanco(banco);
      res.json({ message: `${deleted} movimientos eliminados` });
    } catch (e: any) { res.status(500).json({ message: "Error al eliminar extractos" }); }
  });
// ===== SOLICITUDES =====

app.get("/api/solicitudes", async (_req, res) => {
  try {
  
          const solicitudes = await getSolicitudes();
    res.json(solicitudes.sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime()));
  } catch (e: any) {
    res.status(500).json({ message: "Error al obtener solicitudes" });
  }
});

app.post("/api/solicitudes", async (req, res) => {
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
    const nuevo = await addSolicitud({ ...parsed.data, estado: "Pendiente", creadoEn: new Date().toISOString() });
    res.status(201).json(nuevo);
  } catch (e: any) {
    res.status(500).json({ message: "Error al crear solicitud" });
  }
});

app.patch("/api/solicitudes/:id/estado", async (req, res) => {
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

    // ===== ODOO PROXY =====
  app.get("/api/odoo/clientes", async (req, res) => {
    try {
      const q = (req.query.q as string) || "";
            if (!q.trim()) return res.json([]);
      const clientes = await searchClientes(q);
      res.json(clientes);
    } catch (e: any) {
      console.error("Error searchClientes:", e.message);
      res.status(500).json({ message: "Error al buscar clientes en Odoo" });
    }
  });
    app.post("/api/odoo/clientes", async (req, res) => {
    try {
      const { name, vat, phone, mobile, email } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ message: "El nombre es obligatorio" });
      const cliente = await createCliente({ name: name.trim(), vat, phone, mobile, email });
      res.status(201).json(cliente);
    } catch (e: any) {
      console.error("Error createCliente:", e.message);
      res.status(500).json({ message: "Error al crear cliente en Odoo" });
    }
  });

  app.get("/api/odoo/productos", async (req, res) => {
    try {
      const q = (req.query.q as string) || "";
            if (!q.trim()) return res.json([]);
      const productos = await searchProductos(q);
      res.json(productos);
    } catch (e: any) {
      console.error("Error searchProductos:", e.message);
      res.status(500).json({ message: "Error al buscar productos en Odoo" });
    }
  });

// ===== SOLICITUDES: editar (compras/admin) =====
  app.patch("/api/solicitudes/:id/editar", async (req, res) => {
    try {
      const { id } = req.params;
      const { estado, observacionesCompras, fechaTope, cantidad, categoria, usuario, email } = req.body;
      if (!email) return res.status(400).json({ message: "Email requerido" });
      const usuarios = await getUsuarios();
      const u = usuarios.find(x => x.email === email && (x.rol === "admin" || x.rol === "compras") && x.activo?.toLowerCase() === "true");
      if (!u) return res.status(403).json({ message: "Sin permisos para editar solicitudes" });
      const updated = await updateSolicitudEdicion(id, { estado, observacionesCompras, fechaTope, cantidad, categoria }, usuario);
      if (!updated) return res.status(404).json({ message: "Solicitud no encontrada" });
      if (estado && estado !== "Pendiente") {
        const msg = estado === "Agotado" ? `PRODUCTO AGOTADO
Solicitud #${updated.id}
Cliente: ${updated.cliente}
Producto: ${updated.producto}
Cantidad: ${updated.cantidad}
Obs: ${observacionesCompras || "-"}
Por favor sugiera un producto alternativo al cliente.
Actualizado por: ${usuario || "Compras"}` : `Solicitud #${updated.id}\nEstado: ${estado}\nCliente: ${updated.cliente}\nProducto: ${updated.producto}
Cantidad: ${updated.cantidad}
Actualizado por: ${usuario || "Compras"}`;
        sendTelegramToVendedor(updated.vendedor, msg).catch(() => {});
      }
      res.json(updated);
    } catch (e: any) {
      console.error("Error updateSolicitudEdicion:", e.message);
      res.status(500).json({ message: "Error al editar solicitud" });
    }
  });

  // ===== SOLICITUDES: vendedor confirma compra =====
  app.patch("/api/solicitudes/:id/confirmar-vendedor", async (req, res) => {
    try {
      const { id } = req.params;
      const { vendedorEmail, respondidoPor } = req.body;
      if (!vendedorEmail) return res.status(400).json({ message: "Email requerido" });
      const solicitudes = await getSolicitudes();
      const sol = solicitudes.find(s => s.id === id);
      if (!sol) return res.status(404).json({ message: "Solicitud no encontrada" });
      // Notificar a compras (chat general) que el vendedor confirmo la compra
      const msg = `Compra CONFIRMADA por vendedor\nSolicitud #${sol.id}\nCliente: ${sol.cliente}\nProducto: ${sol.producto}\nCantidad: ${sol.cantidad}\nVendedor: ${vendedorEmail}`;
      if (respondidoPor) { await sendTelegramToVendedor(respondidoPor, msg); } else { await sendTelegram(msg); }
      res.json({ ok: true, message: "Confirmacion enviada" });
    } catch (e: any) {
      console.error("Error confirmar-vendedor:", e.message);
      res.status(500).json({ message: "Error al confirmar compra" });
    }
  });

  // ===== SOLICITUDES: vendedor editar observaciones =====
  app.patch("/api/solicitudes/:id/observaciones-vendedor", async (req, res) => {
    try {
      const { id } = req.params;
      const { observaciones } = req.body;
      if (observaciones === undefined) return res.status(400).json({ message: "Observaciones requeridas" });
      const updated = await updateSolicitudEdicion(id, { observaciones }, undefined);
      if (!updated) return res.status(404).json({ message: "Solicitud no encontrada" });
      res.json(updated);
    } catch (e: any) {
      console.error("Error observaciones-vendedor:", e.message);
      res.status(500).json({ message: "Error al actualizar observaciones" });
    }
  });

  // ===== SOLICITUDES: vendedor editar solicitud completa =====
  app.patch("/api/solicitudes/:id/editar-vendedor", async (req, res) => {
    try {
      const { id } = req.params;
      const { sku, producto, cantidad, categoria, observaciones, fechaTope, cliente, celular } = req.body;
      const updated = await updateSolicitudEdicion(id, { sku, producto, cantidad, categoria, observaciones, fechaTope }, undefined);
      if (!updated) return res.status(404).json({ message: "Solicitud no encontrada" });
      res.json(updated);
    } catch (e: any) {
      console.error("Error editar-vendedor:", e.message);
      res.status(500).json({ message: "Error al editar solicitud" });
    }
  });

  // ===== SOLICITUDES: vendedor solicita anulacion =====
  app.patch("/api/solicitudes/:id/anular-vendedor", async (req, res) => {
    try {
      const { id } = req.params;
      const { vendedorEmail, motivo, respondidoPor } = req.body;
      if (!vendedorEmail || !motivo?.trim()) return res.status(400).json({ message: "Email y motivo requeridos" });
      const solicitudes = await getSolicitudes();
      const sol = solicitudes.find(s => s.id === id);
      if (!sol) return res.status(404).json({ message: "Solicitud no encontrada" });
      // Notificar a compras (chat general) que el vendedor solicita anulacion
      const msg = `SOLICITUD DE ANULACION\nSolicitud #${sol.id}\nCliente: ${sol.cliente}\nProducto: ${sol.producto}\nCantidad: ${sol.cantidad}\nVendedor: ${vendedorEmail}\nMotivo: ${motivo}`;
      if (respondidoPor) { await sendTelegramToVendedor(respondidoPor, msg); } else { await sendTelegram(msg); }
      res.json({ ok: true, message: "Solicitud de anulacion enviada" });
    } catch (e: any) {
      console.error("Error anular-vendedor:", e.message);
      res.status(500).json({ message: "Error al solicitar anulacion" });
    }
  });

  // ===== SOLICITUDES: eliminar (solo admin) =====
  app.delete("/api/solicitudes/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Credenciales requeridas" });
      const usuarios = await getUsuarios();
      const u = usuarios.find(x => x.email === email && x.password === password && x.rol === "admin" && x.activo?.toLowerCase() === "true");
      if (!u) return res.status(401).json({ message: "Credenciales incorrectas o sin permisos" });
      const ok = await deleteSolicitud(id);
      if (!ok) return res.status(404).json({ message: "Solicitud no encontrada" });
      res.json({ message: "Eliminado" });
    } catch (e: any) {
      console.error("Error deleteSolicitud:", e.message);
      res.status(500).json({ message: "Error al eliminar" });
    }
  });

  // ===== TELEGRAM WEBHOOK (auto-link vendedor) =====
  app.post("/api/telegram/webhook", async (req, res) => {
    try {
      const { message } = req.body;
      if (!message?.text || !message?.chat?.id) return res.json({ ok: true });
      const text = message.text.trim();
      const chatId = String(message.chat.id);
      // /start email@example.com
      if (text.startsWith("/start")) {
        const parts = text.split(" ");
        const email = parts[1]?.trim();
        if (!email) {
          await sendTelegram("Usa: /start tu_email@empresa.com", chatId);
          return res.json({ ok: true });
        }
        const updated = await updateUsuarioTelegramChatId(email, chatId);
        if (updated) {
          await sendTelegram(`Vinculado correctamente. Hola ${updated.nombre}, recibiras notificaciones de solicitudes aqui.`, chatId);
        } else {
          await sendTelegram(`No se encontro un usuario con email: ${email}`, chatId);
        }
      }
      res.json({ ok: true });
    } catch (e: any) {
      console.error("Telegram webhook error:", e.message);
      res.json({ ok: true });
    }
  });

  // Endpoint para consultar estado de vinculacion Telegram
  app.get("/api/usuarios/:id/telegram-status", async (req, res) => {
    try {
      const usuarios = await getUsuarios();
      const u = usuarios.find(x => x.id === req.params.id);
      if (!u) return res.status(404).json({ message: "Usuario no encontrado" });
      res.json({ linked: !!u.telegramChatId, chatId: u.telegramChatId || null });
    } catch (e: any) {
      res.status(500).json({ message: "Error" });
    }
  });

  // Endpoint para cambiar contraseña del usuario
  app.post("/api/usuarios/cambiar-password", async (req, res) => {
    try {
      const { email, passwordActual, passwordNueva } = req.body;
      if (!email || !passwordActual || !passwordNueva) {
        return res.status(400).json({ message: "Todos los campos son requeridos" });
      }
      if (passwordNueva.length < 4) {
        return res.status(400).json({ message: "La nueva contraseña debe tener al menos 4 caracteres" });
      }
      const usuarios = await getUsuarios();
      const u = usuarios.find(x => x.email === email);
      if (!u) return res.status(404).json({ message: "Usuario no encontrado" });
      if (u.password !== passwordActual) {
        return res.status(401).json({ message: "Contraseña actual incorrecta" });
      }
      await updateUsuario(u.id, { ...u, password: passwordNueva });
      res.json({ message: "Contraseña actualizada correctamente" });
    } catch (e: any) {
      res.status(500).json({ message: "Error al cambiar contraseña" });
    }
  });
  // ===== IMPORTAR DESDE GOOGLE SHEETS =====
  const SHEET_ID = "1l2PODqxJeecLP7ZhNMtDmMXBIkIGgkYWhI5hKgr4kKY";

  function cv(v: any): string | undefined {
    if (v === undefined || v === null || v === "") return undefined;
    const s = String(v).trim();
    return s === "" ? undefined : s;
  }

  function safeDate(v: any): Date | undefined {
    if (!v) return undefined;
    try {
      if (typeof v === "number") {
        const d = new Date((v - 25569) * 86400 * 1000);
        if (isNaN(d.getTime())) return undefined;
        return d;
      }
      const d = new Date(v);
      if (isNaN(d.getTime())) return undefined;
      return d;
    } catch { return undefined; }
  }

  function safeDateStr(v: any): string | undefined {
    const d = safeDate(v);
    return d ? d.toISOString() : undefined;
  }

  function parseXlsxRow(data: any[][], headers: string[], idx: number): Record<string, any> {
    const row: Record<string, any> = {};
    headers.forEach((h, i) => { row[h] = data[idx]?.[i]; });
    return row;
  }

  app.post("/api/import-from-sheets", async (_req, res) => {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
      const sheetRes = await fetch(url);
      if (!sheetRes.ok) throw new Error(`Failed to download sheet: ${sheetRes.status}`);
      const buffer = Buffer.from(await sheetRes.arrayBuffer());

      const XLSX = (await import("xlsx")).default;
      const wb = XLSX.read(buffer, { type: "buffer" });
      console.log("Sheets found:", wb.SheetNames);

      const result: Record<string, { imported: number; skipped: number }> = {};
      const errors: Record<string, string> = {};

      // ── USUARIOS ──
      if (wb.Sheets["Usuarios"]) {
        const data = XLSX.utils.sheet_to_json(wb.Sheets["Usuarios"], { header: 1 }) as any[][];
        const headers = data[0]?.map((h: any) => String(h).trim()) || [];
        const items: any[] = [];
        let skipped = 0;
        for (let i = 1; i < data.length; i++) {
          const r = parseXlsxRow(data, headers, i);
          const id = parseInt(r["ID"]);
          const activo = String(r["Activo"] || "").trim();
          if (!id || activo === "ELIMINADO" || !r["Email"] || !r["Nombre"]) { skipped++; continue; }
          items.push({
            id, nombre: String(r["Nombre"] || "").trim(), email: String(r["Email"] || "").trim(),
            password: String(r["Password"] || "").trim(), rol: cv(r["Rol"]) || "vendedor",
            activo: activo === "true" ? "true" : "false",
            solicitudes: String(r["solicitudes"] || "").trim() === "true" ? "true" : "false",
            telegramChatId: cv(r["bot telegram"]),
          });
        }
        try { const imported = await importUsuariosBatch(items); result.usuarios = { imported, skipped }; }
        catch (e: any) { errors.usuarios = e.message; result.usuarios = { imported: 0, skipped }; }
      } else { result.usuarios = { imported: 0, skipped: 0 }; }

      // ── PAGOS BS ──
      if (wb.Sheets["Hoja 1"]) {
        const data = XLSX.utils.sheet_to_json(wb.Sheets["Hoja 1"], { header: 1 }) as any[][];
        const headers = data[0]?.map((h: any) => String(h).trim()) || [];
        const items: any[] = [];
        let skipped = 0;
        for (let i = 1; i < data.length; i++) {
          const r = parseXlsxRow(data, headers, i);
          const id = parseInt(r["ID"]);
          const estado = String(r["Estado"] || "").trim();
          if (!id || estado === "ELIMINADO" || !r["Fecha"]) { skipped++; continue; }
          const megasoft = cv(r["Megasoft"]);
          const creadoEn = cv(r["CreadoEn"]);
          items.push({
            id, fechaPago: String(r["Fecha"] || "").trim(),
            tipoPago: cv(r["Tipo"]) || "PagoMovil", bancoEmisor: cv(r["BancoEmisor"]) || "",
            monto: cv(r["Monto"]) || "0", celular: cv(r["Celular"]),
            bancoReceptor: cv(r["BancoReceptor"]) || "", referencia: cv(r["Referencia"]),
            rif: cv(r["RIF"]), factura: cv(r["Factura"]), estado: estado || "Pendiente",
            validadoPor: cv(r["ValidadoPor"]), vendedor: cv(r["Vendedor"]) || "",
            observaciones: cv(r["Observaciones"]), creadoEn: creadoEn ? new Date(creadoEn) : new Date(),
            cliente: cv(r["Cliente"]), megasoft,
            validadoEn: megasoft === "Sí" && creadoEn ? new Date(creadoEn) : undefined,
          });
        }
        try { const imported = await importPagosBatch(items); result.pagos = { imported, skipped }; }
        catch (e: any) { errors.pagos = e.message; result.pagos = { imported: 0, skipped }; }
      } else { result.pagos = { imported: 0, skipped: 0 }; }

      // ── PAGOS DIVISAS ──
      if (wb.Sheets["PagosDivisas"]) {
        const data = XLSX.utils.sheet_to_json(wb.Sheets["PagosDivisas"], { header: 1 }) as any[][];
        const headers = data[0]?.map((h: any) => String(h).trim()) || [];
        const items: any[] = [];
        let skipped = 0;
        for (let i = 1; i < data.length; i++) {
          const r = parseXlsxRow(data, headers, i);
          const id = parseInt(r["ID"]);
          const estado = String(r["Estado"] || "").trim();
          if (!id || estado === "ELIMINADO" || !r["Fecha"]) { skipped++; continue; }
          items.push({
            id, fecha: String(r["Fecha"] || "").trim(),
            nombrePagador: cv(r["NombrePagador"]) || cv(r["Pagador"]) || "",
            correo: cv(r["Correo"]), monto: cv(r["Monto"]) || "0",
            tipo: cv(r["Tipo"]) || "", referencia: cv(r["Referencia"]),
            cliente: cv(r["Cliente"]), rif: cv(r["RIF"]), factura: cv(r["Factura"]),
            observaciones: cv(r["Observaciones"]), estado: estado || "Pendiente",
            validadoPor: cv(r["ValidadoPor"]), vendedor: cv(r["Vendedor"]) || "",
            creadoEn: r["CreadoEn"] ? new Date(r["CreadoEn"]) : new Date(),
            validadoEn: r["ValidadoEn"] ? new Date(r["ValidadoEn"]) : undefined,
          });
        }
        try { const imported = await importPagosDivisasBatch(items); result.pagos_divisas = { imported, skipped }; }
        catch (e: any) { errors.pagos_divisas = e.message; result.pagos_divisas = { imported: 0, skipped }; }
      } else { result.pagos_divisas = { imported: 0, skipped: 0 }; }

      // ── SOLICITUDES ──
      if (wb.Sheets["Solicitudes"]) {
        const data = XLSX.utils.sheet_to_json(wb.Sheets["Solicitudes"], { header: 1 }) as any[][];
        const items: any[] = [];
        let skipped = 0;
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const id = parseInt(row[0]);
          const vendedor = String(row[1] || "").trim();
          const cliente = String(row[2] || "").trim();
          const estado = String(row[9] || "").trim();
          const producto = String(row[5] || "").trim();
          if (!id || estado === "ELIMINADO" || !vendedor || !cliente || !producto) { skipped++; continue; }
          const creadoEn = safeDate(row[10]) || new Date();
          const actualizadoEn = safeDate(row[12]);
          items.push({
            id,
            vendedor,
            cliente,
            celular: String(row[3] || "").trim() || undefined,
            sku: String(row[4] || "").trim() || undefined,
            producto,
            cantidad: String(row[6] || "1").trim(),
            fechaTope: String(row[7] || "").trim() || undefined,
            observaciones: String(row[8] || "").trim() || undefined,
            estado: estado || "Pendiente",
            creadoEn,
            observacionesCompras: String(row[11] || "").trim() || undefined,
            actualizadoEn,
            respondidoPor: String(row[13] || "").trim() || undefined,
            categoria: undefined,
          });
        }
        console.log(`Solicitudes: ${items.length} items to insert, ${skipped} skipped`);
        try { const imported = await importSolicitudesBatch(items); result.solicitudes = { imported, skipped }; }
        catch (e: any) { errors.solicitudes = e.message; result.solicitudes = { imported: 0, skipped }; console.error("Solicitudes import error:", e.message); }
      } else { result.solicitudes = { imported: 0, skipped: 0 }; }

      // ── EXTRACTOS ──
      if (wb.Sheets["Extractos"]) {
        const data = XLSX.utils.sheet_to_json(wb.Sheets["Extractos"], { header: 1 }) as any[][];
        const items: any[] = [];
        let skipped = 0;
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          if (!Array.isArray(row) || row.length === 0) { skipped++; continue; }
          const id = String(row[0] || "").trim();
          const banco = String(row[2] || "").trim();
          const monto = String(row[4] || "").trim();
          if (!id || !banco || !monto) { skipped++; continue; }
          // Parse date from col[1]: Excel serial, milliseconds timestamp, or string
          let fecha = "";
          if (typeof row[1] === "number") {
            if (row[1] > 100000 && row[1] < 60000) {
              // Excel serial date
              const d = new Date((row[1] - 25569) * 86400 * 1000);
              if (!isNaN(d.getTime())) fecha = d.toISOString().split("T")[0];
            } else if (row[1] > 1000000000000) {
              // Milliseconds timestamp
              const d = new Date(row[1]);
              if (!isNaN(d.getTime())) fecha = d.toISOString().split("T")[0];
            } else if (row[1] > 1000000000) {
              // Seconds timestamp
              const d = new Date(row[1] * 1000);
              if (!isNaN(d.getTime())) fecha = d.toISOString().split("T")[0];
            }
          } else if (row[1]) {
            const d = new Date(row[1]);
            if (!isNaN(d.getTime())) fecha = d.toISOString().split("T")[0];
          }
          // Fallback: use subidoEn (col[7]) if available
          if (!fecha && row[7]) {
            const d = new Date(row[7]);
            if (!isNaN(d.getTime())) fecha = d.toISOString().split("T")[0];
          }
          if (!fecha) { skipped++; continue; }
          const subidoPor = String(row[9] || row[8] || "system").trim() || "system";
          const subidoEn = safeDateStr(row[7]) || new Date().toISOString();
          items.push({
            id,
            banco,
            fecha,
            monto,
            referencia: String(row[3] || "").trim() || undefined,
            celular: undefined,
            descripcion: String(row[5] || "").trim() || undefined,
            subidoPor,
            subidoEn,
            usado: "false",
          });
        }
        console.log(`Extractos: ${items.length} items to insert, ${skipped} skipped`);
        try { const imported = await importExtractosBatch(items); result.extractos = { imported, skipped }; }
        catch (e: any) { errors.extractos = e.message; result.extractos = { imported: 0, skipped }; console.error("Extractos import error:", e.message); }
      } else { result.extractos = { imported: 0, skipped: 0 }; }

      res.json({ message: "Importación completada", sheets: wb.SheetNames, result, errors });
    } catch (e: any) {
      console.error("Import error:", e.message);
      res.status(500).json({ message: "Error al importar: " + e.message });
    }
  });

  return httpServer;
}
