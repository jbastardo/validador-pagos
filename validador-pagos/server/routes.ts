import type { Express } from "express";
import type { Server } from "http";
import { getPagos, addPago, updatePagoEstado, updatePagoCajero, checkDuplicado } from "./sheets";
import { z } from "zod";

// Usuarios hardcodeados (no necesitan persistencia en Sheets)
const USUARIOS = [
  { id: 1, nombre: "Juan Admin",       email: "juan@onprotec.com",           password: "admin123", rol: "admin",        activo: "true" },
  { id: 2, nombre: "Contabilidad",     email: "contabilidad@onprotec.com",   password: "conta123", rol: "contabilidad", activo: "true" },
  { id: 3, nombre: "Vendedor 1",       email: "vendedor1@onprotec.com",      password: "vend123",  rol: "vendedor",     activo: "true" },
  { id: 4, nombre: "Vendedor 2",       email: "vendedor2@onprotec.com",      password: "vend123",  rol: "vendedor",     activo: "true" },
  { id: 5, nombre: "Vendedor 3",       email: "vendedor3@onprotec.com",      password: "vend123",  rol: "vendedor",     activo: "true" },
  { id: 6, nombre: "Vendedor 4",       email: "vendedor4@onprotec.com",      password: "vend123",  rol: "vendedor",     activo: "true" },
  { id: 7, nombre: "Milagros Morales", email: "m.morales@onprotec.com",      password: "vend123",  rol: "vendedor",     activo: "true" },
  { id: 8, nombre: "Cajero 1",         email: "cajero1@onprotec.com",        password: "cajero123",rol: "cajero",       activo: "true" },
];
let usuariosRuntime = [...USUARIOS];

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ===== AUTH =====
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Campos requeridos" });
    const u = usuariosRuntime.find(x => x.email === email && x.password === password && x.activo === "true");
    if (!u) return res.status(401).json({ message: "Credenciales incorrectas" });
    res.json({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol });
  });

  // ===== PAGOS =====
  app.get("/api/pagos", async (_req, res) => {
    try {
      const pagos = await getPagos();
      // Ordenar más recientes primero
      const sorted = pagos.sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());
      res.json(sorted);
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
        rif:           z.string().optional().default(""),
        factura:       z.string().optional().default(""),
        cliente:       z.string().optional().default(""),
        vendedor:      z.string().min(1),
        observaciones: z.string().optional().default(""),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });

      const data = parsed.data;

      // Verificar duplicado
      const dup = await checkDuplicado(data.referencia, data.monto, data.fechaPago, data.tipoPago);
      if (dup) {
        return res.status(409).json({
          message: "Pago duplicado detectado",
          duplicado: { id: dup.id, fechaPago: dup.fechaPago, monto: dup.monto, referencia: dup.referencia, tipoPago: dup.tipoPago },
        });
      }

      const nuevo = await addPago({
        ...data,
        celular: data.celular ?? "",
        referencia: data.referencia ?? "",
        rif: data.rif ?? "",
        factura: data.factura ?? "",
        cliente: data.cliente ?? "",
        observaciones: data.observaciones ?? "",
        estado: "Pendiente",
        validadoPor: "",
        megasoft: "",
        creadoEn: new Date().toISOString(),
      });
      res.status(201).json(nuevo);
    } catch (e: any) {
      console.error("Error addPago:", e.message);
      res.status(500).json({ message: "Error al guardar pago en Google Sheets" });
    }
  });

  app.patch("/api/pagos/:id/estado", async (req, res) => {
    try {
      const { id } = req.params;
      const schema = z.object({
        estado:       z.enum(["Pendiente", "Verificado", "Rechazado"]),
        validadoPor:  z.string().min(1),
        observaciones:z.string().optional().default(""),
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

  // ===== STATS =====
  app.get("/api/stats", async (_req, res) => {
    try {
      const pagos = await getPagos();
      const verificados = pagos.filter(p => p.estado === "Verificado");
      res.json({
        total:              pagos.length,
        pendientes:         pagos.filter(p => p.estado === "Pendiente").length,
        verificados:        verificados.length,
        rechazados:         pagos.filter(p => p.estado === "Rechazado").length,
        pagoMovil:          pagos.filter(p => p.tipoPago === "PagoMovil").length,
        transferencias:     pagos.filter(p => p.tipoPago === "Transferencia").length,
        montoTotal:         pagos.filter(p => p.estado !== "Rechazado").reduce((s, p) => s + parseFloat(p.monto || "0"), 0),
        megasoftSi:         verificados.filter(p => p.megasoft === "S\u00ed").length,
        megasoftNo:         verificados.filter(p => p.megasoft === "No").length,
        megasoftPendiente:  verificados.filter(p => !p.megasoft || p.megasoft === "").length,
        montoMegasoftSi:    verificados.filter(p => p.megasoft === "S\u00ed").reduce((s, p) => s + parseFloat(p.monto || "0"), 0),
      });
    } catch (e: any) {
      res.status(500).json({ message: "Error al obtener estadísticas" });
    }
  });

  // ===== CAJERO: actualizar factura + megasoft en pagos verificados =====
  app.patch("/api/pagos/:id/cajero", async (req, res) => {
    try {
      const { id } = req.params;
      const schema = z.object({
        factura: z.string().optional().default(""),
        megasoft: z.enum(["Sí", "No", ""]).optional().default(""),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Datos inválidos" });

      // Verificar que el pago esté Verificado
      const pagos = await getPagos();
      const pago = pagos.find(p => p.id === id);
      if (!pago) return res.status(404).json({ message: "Pago no encontrado" });
      if (pago.estado !== "Verificado") return res.status(422).json({ message: "Solo se pueden editar pagos Verificados" });

      const updated = await updatePagoCajero(id, parsed.data.factura, parsed.data.megasoft);
      res.json(updated);
    } catch (e: any) {
      console.error("Error updatePagoCajero:", e.message);
      res.status(500).json({ message: "Error al actualizar pago" });
    }
  });

  // ===== USUARIOS =====
  app.get("/api/usuarios", (_req, res) => {
    res.json(usuariosRuntime.map(u => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, activo: u.activo })));
  });

  app.post("/api/usuarios", (req, res) => {
    const { nombre, email, password, rol } = req.body;
    if (!nombre || !email || !password) return res.status(400).json({ message: "Campos requeridos" });
    if (usuariosRuntime.find(u => u.email === email)) return res.status(409).json({ message: "El email ya está registrado" });
    const newId = Math.max(...usuariosRuntime.map(u => u.id)) + 1;
    const newUser = { id: newId, nombre, email, password, rol: rol ?? "vendedor", activo: "true" };
    usuariosRuntime.push(newUser);
    res.status(201).json({ id: newUser.id, nombre: newUser.nombre, email: newUser.email, rol: newUser.rol, activo: newUser.activo });
  });

  app.patch("/api/usuarios/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const idx = usuariosRuntime.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ message: "Usuario no encontrado" });
    usuariosRuntime[idx] = { ...usuariosRuntime[idx], ...req.body };
    const u = usuariosRuntime[idx];
    res.json({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, activo: u.activo });
  });

  return httpServer;
}
