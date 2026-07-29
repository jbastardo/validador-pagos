import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  usuariosTable,
  extractosTable,
  pagosTable,
  conciliacionesTable,
} from "../shared/schema";

// Re-export table references so routes.ts can use direct Drizzle queries
export { extractosTable, pagosTable, conciliacionesTable };

// ─── Connection ───────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);

// ─── TABS constant (kept for compatibility) ───────────────────────────────────
export const TABS = {
  EXTRACTOS: "extractos",
  PAGOS: "pagos",
  USUARIOS: "usuarios",
  CONCILIACIONES: "conciliaciones",
};

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ExtractoRow {
  id: string;
  fecha: string;
  banco: string;
  referencia: string;
  monto: number;
  descripcion: string;
  tipo: string; // "ingreso" | "debito" | "comision"
  creadoEn: string;
  archivoOrigen: string;
  subidoPor: string;
  subidoEn: string;
}

export interface PagoRow {
  id: string;
  fecha: string;
  banco: string;
  referencia: string;
  monto: number;
  cliente: string;
  rif: string;
  factura: string;
  estado: string; // "Pendiente" | "Conciliado" | "NoConciliado"
  registradoPor: string;
  observaciones: string;
  conciliadoCon: string;
  creadoEn: string;
}

export interface ConciliacionRow {
  id: string;
  fecha: string;
  pagoId: string;
  extractoId: string;
  referenciaPago: string;
  referenciaExtracto: string;
  montoPago: number;
  montoExtracto: number;
  banco: string;
  cliente: string;
  conciliadoPor: string;
  conciliadoEn: string;
  tipo: string; // "automatico" | "manual"
  estado: string; // "Conciliado" | "Rechazado"
  observaciones: string;
}

// ─── Usuarios ─────────────────────────────────────────────────────────────────
export async function getUsuarios() {
  const rows = await db.select().from(usuariosTable);
  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    email: r.email,
    password: r.password,
    rol: r.rol,
    activo: r.activo,
  }));
}

export async function appendUsuario(u: {
  id: string;
  nombre: string;
  email: string;
  password: string;
  rol: string;
  activo: string;
}) {
  await db.insert(usuariosTable).values(u);
}

export async function updateUsuario(
  id: string,
  updates: Partial<{
    nombre: string;
    email: string;
    password: string;
    rol: string;
    activo: string;
  }>
) {
  await db.update(usuariosTable).set(updates).where(eq(usuariosTable.id, id));
}

// ─── Extractos ────────────────────────────────────────────────────────────────
export async function getExtractos(): Promise<ExtractoRow[]> {
  const rows = await db.select().from(extractosTable);
  return rows.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    banco: r.banco,
    referencia: r.referencia,
    monto: Number(r.monto),
    descripcion: r.descripcion,
    tipo: r.tipo,
    creadoEn: r.creadoEn,
    archivoOrigen: r.archivoOrigen,
    subidoPor: r.subidoPor,
    subidoEn: r.subidoEn,
  }));
}

export async function appendExtractos(
  items: Array<Omit<ExtractoRow, never>>
): Promise<void> {
  if (items.length === 0) return;
  await db.insert(extractosTable).values(
    items.map((e) => ({
      id: e.id,
      fecha: e.fecha,
      banco: e.banco,
      referencia: e.referencia,
      monto: String(e.monto),
      descripcion: e.descripcion,
      tipo: e.tipo,
      creadoEn: e.creadoEn,
      archivoOrigen: e.archivoOrigen,
      subidoPor: e.subidoPor,
      subidoEn: e.subidoEn || e.creadoEn,
    }))
  );
}

export async function clearExtractos(): Promise<number> {
  const result = await db.delete(extractosTable);
  return (result as any).rowCount ?? 0;
}

// ─── Pagos ────────────────────────────────────────────────────────────────────
export async function getPagos(): Promise<PagoRow[]> {
  const rows = await db.select().from(pagosTable);
  return rows.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    banco: r.banco,
    referencia: r.referencia,
    monto: Number(r.monto),
    cliente: r.cliente,
    rif: r.rif,
    factura: r.factura,
    estado: r.estado,
    registradoPor: r.registradoPor,
    observaciones: r.observaciones,
    conciliadoCon: r.conciliadoCon,
    creadoEn: r.creadoEn,
  }));
}

export async function appendPago(p: Omit<PagoRow, "id">): Promise<string> {
  const id = `P${Date.now()}`;
  await db.insert(pagosTable).values({
    id,
    fecha: p.fecha,
    banco: p.banco,
    referencia: p.referencia,
    monto: String(p.monto),
    cliente: p.cliente,
    rif: p.rif,
    factura: p.factura,
    estado: p.estado,
    registradoPor: p.registradoPor,
    observaciones: p.observaciones,
    conciliadoCon: p.conciliadoCon,
    creadoEn: p.creadoEn,
  });
  return id;
}

export async function updatePagoEstado(
  pagoId: string,
  estado: string,
  conciliadoCon: string,
  observaciones: string
) {
  await db
    .update(pagosTable)
    .set({ estado, conciliadoCon, observaciones })
    .where(eq(pagosTable.id, pagoId));
}

// ─── Conciliaciones ───────────────────────────────────────────────────────────
export async function getConciliaciones(): Promise<ConciliacionRow[]> {
  const rows = await db.select().from(conciliacionesTable);
  return rows.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    pagoId: r.pagoId,
    extractoId: r.extractoId,
    referenciaPago: r.referenciaPago,
    referenciaExtracto: r.referenciaExtracto,
    montoPago: Number(r.montoPago),
    montoExtracto: Number(r.montoExtracto),
    banco: r.banco,
    cliente: r.cliente,
    conciliadoPor: r.conciliadoPor,
    conciliadoEn: r.conciliadoEn,
    tipo: r.tipo,
    estado: r.estado,
    observaciones: r.observaciones,
  }));
}

export async function appendConciliacion(
  c: Omit<ConciliacionRow, "id">
): Promise<string> {
  const id = `C${Date.now()}`;
  await db.insert(conciliacionesTable).values({
    id,
    fecha: c.fecha,
    pagoId: c.pagoId,
    extractoId: c.extractoId,
    referenciaPago: c.referenciaPago,
    referenciaExtracto: c.referenciaExtracto,
    montoPago: String(c.montoPago),
    montoExtracto: String(c.montoExtracto),
    banco: c.banco,
    cliente: c.cliente,
    conciliadoPor: c.conciliadoPor,
    conciliadoEn: c.conciliadoEn,
    tipo: c.tipo,
    estado: c.estado,
    observaciones: c.observaciones,
  });
  return id;
}

export async function appendConciliaciones(
  conciliaciones: Array<Omit<ConciliacionRow, "id">>
): Promise<string[]> {
  if (conciliaciones.length === 0) return [];
  const ids: string[] = [];
  const values = conciliaciones.map((c, i) => {
    const id = `C${Date.now()}${i}`;
    ids.push(id);
    return {
      id,
      fecha: c.fecha,
      pagoId: c.pagoId,
      extractoId: c.extractoId,
      referenciaPago: c.referenciaPago,
      referenciaExtracto: c.referenciaExtracto,
      montoPago: String(c.montoPago),
      montoExtracto: String(c.montoExtracto),
      banco: c.banco,
      cliente: c.cliente,
      conciliadoPor: c.conciliadoPor,
      conciliadoEn: c.conciliadoEn,
      tipo: c.tipo,
      estado: c.estado,
      observaciones: c.observaciones,
    };
  });
  await db.insert(conciliacionesTable).values(values);
  return ids;
}

// ─── Compatibility shims (getRows / appendRow / appendRows / updateRow) ───────
// These are used in routes.ts for usuarios CRUD and deduplicar endpoint.
// They operate on the usuarios table only (TABS.USUARIOS) since that's the
// only place they're called with row-index semantics in the migrated routes.

export async function getRows(tab: string): Promise<string[][]> {
  if (tab === TABS.USUARIOS) {
    const rows = await db.select().from(usuariosTable);
    // Return header + data rows in sheet format
    const header = ["id", "nombre", "email", "password", "rol", "activo"];
    const data = rows.map((r) => [r.id, r.nombre, r.email, r.password, r.rol, r.activo]);
    return [header, ...data];
  }
  if (tab === TABS.EXTRACTOS) {
    const rows = await db.select().from(extractosTable);
    const header = ["id", "fecha", "banco", "referencia", "monto", "descripcion", "tipo", "creadoEn", "archivoOrigen", "subidoPor", "subidoEn"];
    const data = rows.map((r) => [r.id, r.fecha, r.banco, r.referencia, String(r.monto), r.descripcion, r.tipo, r.creadoEn, r.archivoOrigen, r.subidoPor, r.subidoEn]);
    return [header, ...data];
  }
  if (tab === TABS.PAGOS) {
    const rows = await db.select().from(pagosTable);
    const header = ["id", "fecha", "banco", "referencia", "monto", "cliente", "rif", "factura", "estado", "registradoPor", "observaciones", "conciliadoCon", "creadoEn"];
    const data = rows.map((r) => [r.id, r.fecha, r.banco, r.referencia, String(r.monto), r.cliente, r.rif, r.factura, r.estado, r.registradoPor, r.observaciones, r.conciliadoCon, r.creadoEn]);
    return [header, ...data];
  }
  return [];
}

export async function appendRow(tab: string, row: (string | number | null)[]) {
  if (tab === TABS.USUARIOS) {
    await db.insert(usuariosTable).values({
      id: String(row[0] ?? ""),
      nombre: String(row[1] ?? ""),
      email: String(row[2] ?? ""),
      password: String(row[3] ?? ""),
      rol: String(row[4] ?? "operador"),
      activo: String(row[5] ?? "true"),
    });
  }
}

export async function appendRows(tab: string, rows: (string | number | null)[][]) {
  if (rows.length === 0) return;
  if (tab === TABS.EXTRACTOS) {
    await db.insert(extractosTable).values(
      rows.map((r) => ({
        id: String(r[0] ?? ""),
        fecha: String(r[1] ?? ""),
        banco: String(r[2] ?? ""),
        referencia: String(r[3] ?? ""),
        monto: String(r[4] ?? "0"),
        descripcion: String(r[5] ?? ""),
        tipo: String(r[6] ?? ""),
        creadoEn: String(r[7] ?? ""),
        archivoOrigen: String(r[8] ?? ""),
        subidoPor: String(r[9] ?? ""),
        // r[10] is subidoEn; fall back to creadoEn (r[7]) if not provided
        subidoEn: String(r[10] ?? r[7] ?? ""),
      }))
    );
  }
}

export async function updateRow(
  tab: string,
  _rowIndex: number,
  row: (string | number | null)[]
) {
  // rowIndex is ignored — we use the ID in column 0 to identify the record
  const id = String(row[0] ?? "");
  if (!id) return;

  if (tab === TABS.USUARIOS) {
    await db
      .update(usuariosTable)
      .set({
        nombre: String(row[1] ?? ""),
        email: String(row[2] ?? ""),
        password: String(row[3] ?? ""),
        rol: String(row[4] ?? ""),
        activo: String(row[5] ?? ""),
      })
      .where(eq(usuariosTable.id, id));
  }
  if (tab === TABS.PAGOS) {
    await db
      .update(pagosTable)
      .set({
        fecha: String(row[1] ?? ""),
        banco: String(row[2] ?? ""),
        referencia: String(row[3] ?? ""),
        monto: String(row[4] ?? "0"),
        cliente: String(row[5] ?? ""),
        rif: String(row[6] ?? ""),
        factura: String(row[7] ?? ""),
        estado: String(row[8] ?? ""),
        registradoPor: String(row[9] ?? ""),
        observaciones: String(row[10] ?? ""),
        conciliadoCon: String(row[11] ?? ""),
        creadoEn: String(row[12] ?? ""),
      })
      .where(eq(pagosTable.id, id));
  }
}
