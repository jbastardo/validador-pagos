import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  pagos, usuarios, pagosDivisas, solicitudes, extractos,
  InsertPago, InsertUsuario, InsertPagoDivisa, InsertSolicitud, InsertExtracto,
} from "@shared/schema";
import { eq, and, or, like, sql } from "drizzle-orm";
import { extractBancoCode } from "@shared/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// Helper to convert string ID to number
function toId(id: string | number): number {
  return typeof id === "string" ? parseInt(id) : id;
}

// Normaliza check Megasoft: acepta Si con o sin acento
function isMegaSi(val: string | undefined | null): boolean {
  if (!val) return false;
  return val.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "si";
}

// ─── PAGOS BS ───────────────────────────────────────────────────────────────────
export async function getPagos() {
  const result = await db.select().from(pagos).orderBy(pagos.creadoEn);
  return result.reverse();
}

export async function getNextId(): Promise<number> {
  const result = await db.select({ maxId: sql<number>`MAX(${pagos.id})` }).from(pagos);
  return (result[0]?.maxId ?? 0) + 1;
}

export async function addPago(pago: Omit<InsertPago, "id" | "creadoEn">) {
  const id = await getNextId();
  const [created] = await db.insert(pagos).values({
    ...pago,
    id,
    creadoEn: new Date(),
  }).returning();
  return created;
}

export async function updatePagoEstado(id: string | number, estado: string, validadoPor: string, observaciones?: string) {
  const [updated] = await db.update(pagos)
    .set({
      estado,
      validadoPor,
      observaciones: observaciones ?? undefined,
      validadoEn: new Date(),
    })
    .where(eq(pagos.id, toId(id)))
    .returning();
  return updated ?? null;
}

export async function updatePagoCajero(id: string | number, factura: string, megasoft: string, cliente?: string) {
  const [pago] = await db.select().from(pagos).where(eq(pagos.id, toId(id)));
  if (!pago) return null;
  const [updated] = await db.update(pagos)
    .set({
      factura: factura || pago.factura,
      megasoft,
      cliente: cliente !== undefined ? cliente : pago.cliente,
    })
    .where(eq(pagos.id, id))
    .returning();
  return updated;
}

export async function updatePagoCajeroPendiente(id: string | number, factura: string, cliente: string, megasoft: string, cajeroEmail: string) {
  const [pago] = await db.select().from(pagos).where(eq(pagos.id, toId(id)));
  if (!pago) return null;
  const autoAprueba = isMegaSi(megasoft);
  const [updated] = await db.update(pagos)
    .set({
      factura: factura || pago.factura,
      cliente: cliente || pago.cliente,
      megasoft,
      estado: autoAprueba ? "Verificado" : pago.estado,
      validadoPor: autoAprueba ? cajeroEmail : pago.validadoPor,
      validadoEn: autoAprueba ? new Date() : pago.validadoEn,
    })
    .where(eq(pagos.id, id))
    .returning();
  return updated;
}

export async function updatePagoFacturaCliente(id: string | number, factura: string, cliente: string, megasoft?: string, cajeroEmail?: string) {
  const [pago] = await db.select().from(pagos).where(eq(pagos.id, toId(id)));
  if (!pago) return null;
  const newMegasoft = (megasoft !== undefined && megasoft !== "") ? megasoft : (pago.megasoft ?? "");
  const autoAprueba = isMegaSi(newMegasoft);
  const [updated] = await db.update(pagos)
    .set({
      factura: factura || pago.factura,
      cliente: cliente || pago.cliente,
      megasoft: newMegasoft,
      estado: autoAprueba ? "Verificado" : pago.estado,
      validadoPor: autoAprueba ? `${cajeroEmail || "Cajero"} (Megasoft)` : pago.validadoPor,
      validadoEn: autoAprueba ? new Date() : pago.validadoEn,
    })
    .where(eq(pagos.id, id))
    .returning();
  return updated;
}

export async function updatePagoEdicion(id: string | number, data: {
  fechaPago: string; bancoEmisor: string; bancoReceptor: string; monto: string;
  referencia: string; celular: string; cliente?: string; observaciones?: string;
  rif?: string; factura?: string; megasoft?: string; cajeroEmail?: string;
}) {
  const [pago] = await db.select().from(pagos).where(eq(pagos.id, toId(id)));
  if (!pago) return null;
  const newMegasoft = data.megasoft !== undefined ? data.megasoft : (pago.megasoft ?? "");
  const autoAprueba = isMegaSi(newMegasoft) && !isMegaSi(pago.megasoft);
  const [updated] = await db.update(pagos)
    .set({
      fechaPago: data.fechaPago,
      bancoEmisor: data.bancoEmisor,
      bancoReceptor: data.bancoReceptor,
      monto: data.monto,
      referencia: data.referencia,
      celular: data.celular,
      cliente: data.cliente !== undefined ? data.cliente : pago.cliente,
      observaciones: data.observaciones !== undefined ? data.observaciones : pago.observaciones,
      rif: data.rif !== undefined ? data.rif : pago.rif,
      factura: data.factura !== undefined ? data.factura : pago.factura,
      megasoft: newMegasoft,
      estado: autoAprueba ? "Verificado" : pago.estado,
      validadoPor: autoAprueba ? `${data.cajeroEmail || "Admin"} (Megasoft)` : pago.validadoPor,
      validadoEn: autoAprueba ? new Date() : pago.validadoEn,
    })
    .where(eq(pagos.id, id))
    .returning();
  return updated;
}

export async function checkDuplicado(
  referencia: string, monto: string, fechaPago: string, tipoPago: string, bancoReceptor?: string, celular?: string
) {
  const allPagos = await db.select().from(pagos);
  const normalizeRef = (ref: string) => ref.replace(/\D/g, "").padStart(10, "0").slice(-10);

  if (referencia?.trim()) {
    const refNorm = normalizeRef(referencia);
    if (refNorm !== "0000000000") {
      const dup = allPagos.find(p => {
        const pRefNorm = normalizeRef(p.referencia || "");
        return pRefNorm === refNorm && extractBancoCode(p.bancoReceptor) === extractBancoCode(bancoReceptor ?? "");
      });
      if (dup) return dup;
    }
  }

  if (referencia?.trim()) {
    const digits = referencia.replace(/\D/g, "");
    if (digits.length >= 4) {
      const montoNorm = parseFloat(monto.replace(",", ".")) || 0;
      const bancoCode = extractBancoCode(bancoReceptor ?? "");
      for (const n of [6, 5, 4]) {
        if (digits.length < n) continue;
        const suffix = digits.slice(-n);
        const dupT = allPagos.find(p => {
          const pDigits = (p.referencia || "").replace(/\D/g, "");
          if (pDigits.length < n) return false;
          return pDigits.slice(-n) === suffix &&
            Math.abs((parseFloat((p.monto || "0").replace(",", ".")) || 0) - montoNorm) < 0.01 &&
            extractBancoCode(p.bancoReceptor) === bancoCode;
        });
        if (dupT) return dupT;
      }
    }
  }

  if (tipoPago === "PagoMovil" && !referencia?.trim()) {
    return allPagos.find(p =>
      p.tipoPago === "PagoMovil" && !p.referencia?.trim() &&
      p.monto === monto && p.fechaPago === fechaPago &&
      (p.celular || "").trim() === (celular ?? "").trim()
    ) || null;
  }
  return null;
}

export async function deletePago(id: string | number) {
  const result = await db.delete(pagos).where(eq(pagos.id, toId(id))).returning();
  return result.length > 0;
}

// ─── USUARIOS ───────────────────────────────────────────────────────────────────
export async function getUsuarios() {
  return await db.select().from(usuarios);
}

export async function addUsuario(usuario: Omit<InsertUsuario, "id" | "creadoEn">) {
  const result = await db.select({ maxId: sql<number>`MAX(${usuarios.id})` }).from(usuarios);
  const id = (result[0]?.maxId ?? 0) + 1;
  const [created] = await db.insert(usuarios).values({ ...usuario, id, creadoEn: new Date() }).returning();
  return created;
}

export async function updateUsuario(id: string | number, data: Partial<InsertUsuario>) {
  const [updated] = await db.update(usuarios).set(data).where(eq(usuarios.id, toId(id))).returning();
  return updated;
}

export async function updateUsuarioTelegramChatId(email: string, chatId: string) {
  const [updated] = await db.update(usuarios).set({ telegramChatId: chatId }).where(eq(usuarios.email, email)).returning();
  return updated || null;
}

export async function deleteUsuario(id: string | number) {
  const result = await db.delete(usuarios).where(eq(usuarios.id, toId(id))).returning();
  return result.length > 0;
}

// ─── PAGOS DIVISAS ──────────────────────────────────────────────────────────────
export async function getPagosDivisas() {
  const result = await db.select().from(pagosDivisas).orderBy(pagosDivisas.creadoEn);
  return result.reverse();
}

export async function addPagoDivisa(pago: Omit<InsertPagoDivisa, "id" | "creadoEn" | "validadoEn">) {
  const result = await db.select({ maxId: sql<number>`MAX(${pagosDivisas.id})` }).from(pagosDivisas);
  const id = (result[0]?.maxId ?? 0) + 1;
  const [created] = await db.insert(pagosDivisas).values({ ...pago, id, creadoEn: new Date() }).returning();
  return created;
}

export async function updatePagoDivisaEstado(id: string | number, estado: string, validadoPor: string, observaciones: string) {
  const [updated] = await db.update(pagosDivisas).set({
    estado, validadoPor, observaciones, validadoEn: new Date()
  }).where(eq(pagosDivisas.id, toId(id))).returning();
  return updated ?? null;
}

export async function updatePagoDivisaEdicion(id: string | number, data: { fecha: string; nombrePagador: string; monto: string; tipo: string; referencia: string; observaciones?: string }) {
  const [pago] = await db.select().from(pagosDivisas).where(eq(pagosDivisas.id, toId(id)));
  if (!pago) return null;
  const [updated] = await db.update(pagosDivisas).set({
    fecha: data.fecha,
    nombrePagador: data.nombrePagador,
    monto: data.monto,
    tipo: data.tipo,
    referencia: data.referencia,
    observaciones: data.observaciones !== undefined ? data.observaciones : pago.observaciones,
  }).where(eq(pagosDivisas.id, id)).returning();
  return updated;
}

export async function deletePagoDivisa(id: string | number) {
  const result = await db.delete(pagosDivisas).where(eq(pagosDivisas.id, toId(id))).returning();
  return result.length > 0;
}

// ─── SOLICITUDES ───────────────────────────────────────────────────────────────
export async function getSolicitudes() {
  const result = await db.select().from(solicitudes).orderBy(solicitudes.creadoEn);
  return result.reverse();
}

export async function addSolicitud(s: Omit<InsertSolicitud, "id" | "creadoEn">) {
  const result = await db.select({ maxId: sql<number>`MAX(${solicitudes.id})` }).from(solicitudes);
  const id = (result[0]?.maxId ?? 0) + 1;
  const [created] = await db.insert(solicitudes).values({ ...s, id, creadoEn: new Date() }).returning();
  return created;
}

export async function updateSolicitudEstado(id: string | number, estado: string) {
  const [updated] = await db.update(solicitudes).set({ estado }).where(eq(solicitudes.id, toId(id))).returning();
  return updated ?? null;
}

export async function updateSolicitudEdicion(
  id: string | number,
  data: {
    estado?: string; observacionesCompras?: string; fechaTope?: string; cantidad?: string;
    observaciones?: string; categoria?: string; sku?: string; producto?: string;
    cliente?: string; celular?: string;
  },
  usuario?: string,
) {
  const [s] = await db.select().from(solicitudes).where(eq(solicitudes.id, toId(id)));
  if (!s) return null;
  const [updated] = await db.update(solicitudes).set({
    estado: data.estado ?? s.estado,
    observacionesCompras: data.observacionesCompras !== undefined ? data.observacionesCompras : s.observacionesCompras,
    fechaTope: data.fechaTope ?? s.fechaTope,
    cantidad: data.cantidad ?? s.cantidad,
    observaciones: data.observaciones !== undefined ? data.observaciones : s.observaciones,
    categoria: data.categoria ?? s.categoria,
    sku: data.sku !== undefined ? data.sku : s.sku,
    producto: data.producto !== undefined ? data.producto : s.producto,
    cliente: data.cliente !== undefined ? data.cliente : s.cliente,
    celular: data.celular !== undefined ? data.celular : s.celular,
    actualizadoEn: new Date(),
    respondidoPor: usuario || s.respondidoPor,
  }).where(eq(solicitudes.id, id)).returning();
  return updated;
}

export async function deleteSolicitud(id: string | number) {
  const result = await db.delete(solicitudes).where(eq(solicitudes.id, toId(id))).returning();
  return result.length > 0;
}

// ─── EXTRACTOS ──────────────────────────────────────────────────────────────────
export async function getMovimientos(banco?: string) {
  if (banco) {
    return await db.select().from(extractos).where(eq(extractos.banco, banco));
  }
  return await db.select().from(extractos);
}

export async function addMovimientos(items: InsertExtracto[]) {
  if (items.length === 0) return;
  const BATCH = 200;
  for (let i = 0; i < items.length; i += BATCH) {
    await db.insert(extractos).values(items.slice(i, i + BATCH));
  }
}

export async function deleteMovimientosBanco(banco: string) {
  const result = await db.delete(extractos).where(eq(extractos.banco, banco)).returning();
  return result.length;
}

export async function marcarUsado(movId: string) {
  await db.update(extractos).set({ usado: "true" }).where(eq(extractos.id, movId));
}

export async function tryMatch(
  tipoPago: string, bancoReceptor: string, fechaPago: string, monto: string, referencia: string, celular: string
) {
  const bancoCodigo = bancoReceptor.slice(0, 4);
  const movs = await db.select().from(extractos).where(
    and(eq(extractos.banco, bancoCodigo), eq(extractos.usado, "false"))
  );
  const montoNum = parseFloat(monto.replace(",", "."));
  const fechaTarget = new Date(fechaPago + "T12:00:00Z");
  const TOLERANCIA_MONTO = 5;

  for (const m of movs) {
    const diffDias = Math.abs((fechaTarget.getTime() - new Date(m.fecha + "T12:00:00Z").getTime()) / 86400000);
    if (diffDias > 1) continue;
    if (Math.abs(parseFloat((m.monto || "0").replace(",", ".")) - montoNum) > TOLERANCIA_MONTO) continue;
    if (tipoPago === "Transferencia") {
      const refPago = (referencia || "").replace(/\D/g, "").slice(-6);
      const refMov = (m.referencia || "").replace(/\D/g, "").slice(-6);
      if (refPago && refMov && refPago === refMov) return m;
      if (!refPago && !refMov) return m;
    }
    if (tipoPago === "PagoMovil") {
      if (celular && m.celular && celular.replace(/\D/g, "").slice(-9) === (m.celular || "").replace(/\D/g, "").slice(-9)) return m;
    }
  }
  return null;
}

export async function getExtractosStats() {
  const todos = await db.select().from(extractos);
  const byBanco: Record<string, { total: number; usados: number; disponibles: number; ultimaSubida: string }> = {};
  for (const m of todos) {
    if (!byBanco[m.banco]) byBanco[m.banco] = { total: 0, usados: 0, disponibles: 0, ultimaSubida: "" };
    byBanco[m.banco].total++;
    if (m.usado === "true") byBanco[m.banco].usados++;
    else byBanco[m.banco].disponibles++;
    if (!byBanco[m.banco].ultimaSubida || m.subidoEn > byBanco[m.banco].ultimaSubida) {
      byBanco[m.banco].ultimaSubida = m.subidoEn;
    }
  }
  return { byBanco };
}

// Re-export parseExtractoExcel from extractos.ts
export { parseExtractoExcel } from "./extractos";
