import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import {
  getPagos, addPago, updatePagoEstado, updatePagoCajero, updatePagoCajeroPendiente, updatePagoFacturaCliente, checkDuplicado,
  deletePago, deletePagoDivisa, deleteUsuario,
  getUsuarios, addUsuario, updateUsuario,
  getPagosDivisas, addPagoDivisa, updatePagoDivisaEstado, updatePagoDivisaEdicion,
  updatePagoEdicion,
} from "./sheets";
import {
  parseExtractoExcel, addMovimientos, getMovimientos, deleteMovimientosBanco,
  marcarUsado, tryMatch, getExtractosStats,
} from "./extractos";
import { z } from "zod";
import { BANCOS_RECEPTOR_META } from "../shared/schema";

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
      res.json({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol });
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
      const rifRegex = /^[JVEPGjvepg]-?\d{8}-?\d$/;
      const schema = z.object({
        fechaPago:     z.string().min(1),
        tipoPago:      z.enum(["PagoMovil", "Transferencia"]),
        bancoEmisor:   z.string().min(1),
        monto:         z.string().min(1),
        celular:       z.string().optional().default(""),
        bancoReceptor: z.string().min(1),
        referencia:    z.string().optional().default(""),
        rif:           z.string().min(1, "CI / RIF es obligatorio").regex(rifRegex, "Formato de CI / RIF inválido"),
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

      // ── Auto-conciliación DESACTIVADA TEMPORALMENTE ────────────────────────
      const estadoInicial = "Pendiente";
      const validadoPorInicial = "";
      const matchId: string | null = null;

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
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos" });
      const updated = await updatePagoFacturaCliente(id, parsed.data.factura, parsed.data.cliente, parsed.data.megasoft, parsed.data.cajeroEmail);
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

  // PATCH /api/pagos/:id/editar (supervisor)
  app.patch("/api/pagos/:id/editar", async (req, res) => {
    try {
      const { id } = req.params;
      const { fechaPago, bancoEmisor, bancoReceptor, monto, referencia, celular, cliente } = req.body;
      if (!fechaPago || !monto) return res.status(400).json({ message: "Campos requeridos" });
      const updated = await updatePagoEdicion(id, { fechaPago, bancoEmisor: bancoEmisor ?? "", bancoReceptor: bancoReceptor ?? "", monto, referencia: referencia ?? "", celular: celular ?? "", cliente: cliente ?? undefined });
      if (!updated) return res.status(404).json({ message: "Pago no encontrado" });
      res.json(updated);
    } catch (e: any) {
      console.error("Error updatePagoEdicion:", e.message);
      res.status(500).json({ message: "Error al editar pago" });
    }
  });

  // PATCH /api/pagos-divisas/:id/editar (supervisor)
  app.patch("/api/pagos-divisas/:id/editar", async (req, res) => {
    try {
      const { id } = req.params;
      const { fecha, nombrePagador, monto, tipo, referencia } = req.body;
      if (!fecha || !monto || !nombrePagador) return res.status(400).json({ message: "Campos requeridos" });
      const updated = await updatePagoDivisaEdicion(id, { fecha, nombrePagador, monto, tipo: tipo ?? "", referencia: referencia ?? "" });
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

  // ===== DELETE (solo admin, requiere revalidación de clave) =====
  app.delete("/api/pagos/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Credenciales requeridas" });
      const usuarios = await getUsuarios();
      const u = usuarios.find(x => x.email === email && x.password === password && x.rol === "admin" && x.activo?.toLowerCase() === "true");
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
      const u = usuarios.find(x => x.email === email && x.password === password && x.rol === "admin" && x.activo?.toLowerCase() === "true");
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
  app.get("/api/stats", async (_req, res) => {
    try {
      const [pagos, divisas] = await Promise.all([getPagos(), getPagosDivisas()]);
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
      res.json(usuarios.map(u => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, activo: u.activo })));
    } catch (e: any) {
      res.status(500).json({ message: "Error al obtener usuarios" });
    }
  });

  app.post("/api/usuarios", async (req, res) => {
    try {
      const { nombre, email, password, rol } = req.body;
      if (!nombre || !email || !password) return res.status(400).json({ message: "Campos requeridos" });
      const usuarios = await getUsuarios();
      if (usuarios.find(u => u.email === email)) return res.status(409).json({ message: "El email ya está registrado" });
      const newId = String(Math.max(...usuarios.map(u => parseInt(u.id) || 0)) + 1);
      const newUser = await addUsuario({ id: newId, nombre, email, password, rol: rol ?? "vendedor", activo: "true" });
      res.status(201).json({ id: newUser.id, nombre: newUser.nombre, email: newUser.email, rol: newUser.rol, activo: newUser.activo });
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
      res.json({ id: updated.id, nombre: updated.nombre, email: updated.email, rol: updated.rol, activo: updated.activo });
    } catch (e: any) {
      console.error("Error updateUsuario:", e.message);
      res.status(500).json({ message: "Error al actualizar usuario" });
    }
  });

  // ===== EXTRACTOS BANCARIOS =====
  const BANCOS_VALIDOS = BANCOS_RECEPTOR_META.map(b => b.codigo);

  // ── EXTRACTOS DESACTIVADOS TEMPORALMENTE ─────────────────────────────────────
  // Re-activar cuando se retome el desarrollo de esta funcionalidad.
  const EXTRACTOS_DISABLED = { message: "Función de extractos desactivada temporalmente" };
  app.get("/api/extractos/:banco",      (_req, res) => res.status(503).json(EXTRACTOS_DISABLED));
  app.get("/api/extractos-stats",       (_req, res) => res.status(503).json(EXTRACTOS_DISABLED));
  app.post("/api/extractos/:banco",     (_req, res) => res.status(503).json(EXTRACTOS_DISABLED));
  app.delete("/api/extractos/:banco",   (_req, res) => res.status(503).json(EXTRACTOS_DISABLED));
  // ─────────────────────────────────────────────────────────────────────────────

  return httpServer;
}
