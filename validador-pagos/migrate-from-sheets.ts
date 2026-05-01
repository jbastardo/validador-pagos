/**
 * Script de migración: Google Sheets → PostgreSQL (Railway)
 *
 * Lee todas las hojas de Google Sheets y las migra a PostgreSQL.
 * Requiere las variables de entorno:
 *   - DATABASE_URL (PostgreSQL en Railway)
 *   - GOOGLE_SERVICE_ACCOUNT_JSON
 *   - GOOGLE_SHEET_ID
 */

import { google } from "googleapis";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  pagos, usuarios, pagosDivisas, solicitudes, extractos,
} from "./shared/schema";
import { sql } from "drizzle-orm";

const SHEET_ID = process.env.GOOGLE_SHEET_ID ?? "1l2PODqxJeecLP7ZhNMtDmMXBIkIGgkYWhI5hKgr4kKY";

function getSheets() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function getRows(tab: string): Promise<string[][]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: tab });
  return (res.data.values ?? []) as string[][];
}

function toDate(isoOrNull: string | undefined | null): Date | undefined {
  if (!isoOrNull) return undefined;
  const d = new Date(isoOrNull);
  return isNaN(d.getTime()) ? undefined : d;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL no configurada");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log("Iniciando migración de Google Sheets → PostgreSQL...");

  // ─── MIGRAR USUARIOS ─────────────────────────────────────────────────
  console.log("\nMigrando usuarios...");
  const usersRows = await getRows("Usuarios");
  if (usersRows.length > 1) {
    const usuariosData = usersRows.slice(1)
      .filter(row => row[0] && row[5] !== "ELIMINADO")
      .map(row => ({
        id: parseInt(row[0]) || 0,
        nombre: row[1] || "",
        email: row[2] || "",
        password: row[3] || "",
        rol: row[4] || "vendedor",
        activo: row[5] || "true",
        solicitudes: row[6] || "false",
        telegramChatId: row[7] || null,
        creadoEn: toDate(row[8]) || new Date(),
      }))
      .filter(u => u.id > 0);

    if (usuariosData.length > 0) {
      await db.delete(usuarios);
      await db.insert(usuarios).values(usuariosData);
      console.log(`  ✓ ${usuariosData.length} usuarios migrados`);
    }
  }

  // ─── MIGRAR PAGOS BS ────────────────────────────────────────────────
  console.log("\nMigrando pagos BS...");
  const pagosRows = await getRows("Hoja 1");
  if (pagosRows.length > 1) {
    const pagosData = pagosRows.slice(1)
      .filter(row => row[0] && row[10] !== "ELIMINADO")
      .map(row => ({
        id: parseInt(row[0]) || 0,
        fechaPago: row[1] || "",
        tipoPago: row[2] || "PagoMovil",
        bancoEmisor: row[3] || "",
        monto: row[4] || "",
        celular: row[5] || null,
        bancoReceptor: row[6] || "",
        referencia: row[7] || null,
        rif: row[8] || null,
        factura: row[9] || null,
        estado: row[10] || "Pendiente",
        validadoPor: row[11] || null,
        vendedor: row[12] || "",
        observaciones: row[13] || null,
        creadoEn: toDate(row[14]) || new Date(),
        cliente: row[15] || null,
        megasoft: row[16] || null,
        validadoEn: toDate(row[17]),
        conciliadoEn: toDate(row[18]),
        conciliadoPor: row[19] || null,
      }))
      .filter(p => p.id > 0);

    if (pagosData.length > 0) {
      await db.delete(pagos);
      await db.insert(pagos).values(pagosData);
      console.log(`  ✓ ${pagosData.length} pagos migrados`);
    }
  }

  // ─── MIGRAR PAGOS DIVISAS ───────────────────────────────────────────
  console.log("\nMigrando pagos divisas...");
  const divisasRows = await getRows("PagosDivisas");
  if (divisasRows.length > 1) {
    const divisasData = divisasRows.slice(1)
      .filter(row => row[0] && row[11] !== "ELIMINADO")
      .map(row => ({
        id: parseInt(row[0]) || 0,
        fecha: row[1] || "",
        nombrePagador: row[2] || "",
        correo: row[3] || null,
        monto: row[4] || "",
        tipo: row[5] || "",
        referencia: row[6] || null,
        cliente: row[7] || null,
        rif: row[8] || null,
        factura: row[9] || null,
        observaciones: row[10] || null,
        estado: row[11] || "Pendiente",
        validadoPor: row[12] || null,
        vendedor: row[13] || "",
        creadoEn: toDate(row[14]) || new Date(),
        validadoEn: toDate(row[15]),
      }))
      .filter(p => p.id > 0);

    if (divisasData.length > 0) {
      await db.delete(pagosDivisas);
      await db.insert(pagosDivisas).values(divisasData);
      console.log(`  ✓ ${divisasData.length} pagos divisas migrados`);
    }
  }

  // ─── MIGRAR SOLICITUDES ─────────────────────────────────────────────
  console.log("\nMigrando solicitudes...");
  const solRows = await getRows("Solicitudes");
  if (solRows.length > 1) {
    const solicitudesData = solRows.slice(1)
      .filter(row => row[0] && row[9] !== "ELIMINADO")
      .map(row => ({
        id: parseInt(row[0]) || 0,
        vendedor: row[1] || "",
        cliente: row[2] || "",
        celular: row[3] || null,
        sku: row[4] || null,
        producto: row[5] || "",
        cantidad: row[6] || "",
        fechaTope: row[7] || null,
        observaciones: row[8] || null,
        estado: row[9] || "Pendiente",
        creadoEn: toDate(row[10]) || new Date(),
        observacionesCompras: row[11] || null,
        actualizadoEn: toDate(row[12]),
        respondidoPor: row[13] || null,
        categoria: row[14] || null,
      }))
      .filter(s => s.id > 0);

    if (solicitudesData.length > 0) {
      await db.delete(solicitudes);
      await db.insert(solicitudes).values(solicitudesData);
      console.log(`  ✓ ${solicitudesData.length} solicitudes migradas`);
    }
  }

  // ─── MIGRAR EXTRACTOS ───────────────────────────────────────────────
  console.log("\nMigrando extractos...");
  try {
    const extractosRows = await getRows("Extractos");
    if (extractosRows.length > 1) {
      const extractosData = extractosRows.slice(1)
        .filter(row => row[0])
        .map(row => ({
          id: row[0] || "",
          banco: row[1] || "",
          fecha: row[2] || "",
          monto: row[3] || "",
          referencia: row[4] || null,
          celular: row[5] || null,
          descripcion: row[6] || null,
          subidoPor: row[7] || "",
          subidoEn: row[8] || new Date().toISOString(),
          usado: row[9] || "false",
        }));

      if (extractosData.length > 0) {
        await db.delete(extractos);
        await db.insert(extractos).values(extractosData);
        console.log(`  ✓ ${extractosData.length} extractos migrados`);
      }
    }
  } catch (e: any) {
    console.log(`  ⚠ Extractos no migrados: ${e.message}`);
  }

  await pool.end();
  console.log("\n✅ Migración completada exitosamente!");
}

main().catch(e => {
  console.error("Error en migración:", e);
  process.exit(1);
});
