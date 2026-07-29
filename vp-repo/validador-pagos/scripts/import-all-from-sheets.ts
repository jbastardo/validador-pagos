import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pagos, usuarios, pagosDivisas, solicitudes, extractos } from "@shared/schema";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const SHEET_ID = "1l2PODqxJeecLP7ZhNMtDmMXBIkIGgkYWhI5hKgr4kKY";

async function downloadSheet(): Promise<string> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download sheet: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const tmpPath = path.join(__dirname, "..", "temp-sheet.xlsx");
  fs.writeFileSync(tmpPath, Buffer.from(buffer));
  return tmpPath;
}

/** Convierte valor de celda ExcelJS a primitivo (text para hyperlink/richText, Date directo, etc.). */
function cellToPrimitive(raw: unknown): unknown {
  if (raw === null || raw === undefined) return undefined;
  if (raw instanceof Date) return raw;
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if ("text" in obj && typeof obj.text === "string") return obj.text;
    if (Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: unknown }>).map(r => String(r.text ?? "")).join("");
    }
    if ("result" in obj) return cellToPrimitive(obj.result);
    if ("error" in obj) return undefined;
  }
  return raw;
}

function cleanVal(v: any): string | undefined {
  const p = cellToPrimitive(v);
  if (p === undefined || p === null || p === "") return undefined;
  if (p instanceof Date) return p.toISOString();
  const s = String(p).trim();
  return s === "" ? undefined : s;
}

/** Lee una hoja de ExcelJS y la convierte a `{ headers, rows }` donde cada row es un Record<string, any>. */
function sheetToRows(ws: ExcelJS.Worksheet | undefined): { headers: string[]; rows: Record<string, any>[] } {
  if (!ws) return { headers: [], rows: [] };
  const headers: string[] = [];
  const rows: Record<string, any>[] = [];
  let lastCol = ws.actualColumnCount || ws.columnCount || 0;
  let isFirst = true;
  ws.eachRow({ includeEmpty: true }, (row) => {
    if (isFirst) {
      for (let c = 1; c <= lastCol; c++) {
        const v = cellToPrimitive(row.getCell(c).value);
        headers.push(String(v ?? "").trim());
      }
      isFirst = false;
      return;
    }
    const obj: Record<string, any> = {};
    for (let c = 1; c <= lastCol; c++) {
      const h = headers[c - 1];
      if (!h) continue;
      obj[h] = cellToPrimitive(row.getCell(c).value);
    }
    rows.push(obj);
  });
  return { headers, rows };
}

async function importUsuarios(wb: ExcelJS.Workbook) {
  console.log("=== Importing Usuarios ===");
  const { rows } = sheetToRows(wb.getWorksheet("Usuarios"));
  if (rows.length === 0) { console.log("  Sheet not found or empty"); return { imported: 0, skipped: 0 }; }

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = parseInt(String(row["ID"] ?? ""));
    const activo = String(row["Activo"] ?? "").trim();
    if (!id || activo === "ELIMINADO" || !row["Email"] || !row["Nombre"]) { skipped++; continue; }

    try {
      await db.insert(usuarios).values({
        id,
        nombre: String(row["Nombre"] ?? "").trim(),
        email: String(row["Email"] ?? "").trim(),
        password: String(row["Password"] ?? "").trim(),
        rol: cleanVal(row["Rol"]) || "vendedor",
        activo: activo === "true" ? "true" : "false",
        solicitudes: String(row["solicitudes"] ?? "").trim() === "true" ? "true" : "false",
        telegramChatId: cleanVal(row["bot telegram"]),
        creadoEn: new Date(),
      }).onConflictDoNothing();
      imported++;
    } catch { skipped++; }
  }

  console.log(`  Imported: ${imported}, Skipped: ${skipped}`);
  return { imported, skipped };
}

async function importPagos(wb: ExcelJS.Workbook) {
  console.log("=== Importing Pagos ===");
  const { rows } = sheetToRows(wb.getWorksheet("Hoja 1"));
  if (rows.length === 0) { console.log("  Sheet not found or empty"); return { imported: 0, skipped: 0 }; }

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = parseInt(String(row["ID"] ?? ""));
    const estado = String(row["Estado"] ?? "").trim();
    if (!id || estado === "ELIMINADO" || !row["Fecha"]) { skipped++; continue; }

    const megasoft = cleanVal(row["Megasoft"]);
    const creadoEn = cleanVal(row["CreadoEn"]);

    try {
      await db.insert(pagos).values({
        id,
        fechaPago: String(cleanVal(row["Fecha"]) ?? "").trim(),
        tipoPago: cleanVal(row["Tipo"]) || "PagoMovil",
        bancoEmisor: cleanVal(row["BancoEmisor"]) || "",
        monto: cleanVal(row["Monto"]) || "0",
        celular: cleanVal(row["Celular"]),
        bancoReceptor: cleanVal(row["BancoReceptor"]) || "",
        referencia: cleanVal(row["Referencia"]),
        rif: cleanVal(row["RIF"]),
        factura: cleanVal(row["Factura"]),
        estado: estado || "Pendiente",
        validadoPor: cleanVal(row["ValidadoPor"]),
        vendedor: cleanVal(row["Vendedor"]) || "",
        observaciones: cleanVal(row["Observaciones"]),
        creadoEn: creadoEn ? new Date(creadoEn) : new Date(),
        cliente: cleanVal(row["Cliente"]),
        megasoft,
        validadoEn: megasoft === "Sí" && creadoEn ? new Date(creadoEn) : undefined,
      }).onConflictDoNothing();
      imported++;
    } catch { skipped++; }
  }

  console.log(`  Imported: ${imported}, Skipped: ${skipped}`);
  return { imported, skipped };
}

async function importPagosDivisas(wb: ExcelJS.Workbook) {
  console.log("=== Importing Pagos Divisas ===");
  const { rows } = sheetToRows(wb.getWorksheet("PagosDivisas"));
  if (rows.length === 0) { console.log("  Sheet not found or empty"); return { imported: 0, skipped: 0 }; }

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = parseInt(String(row["ID"] ?? ""));
    const estado = String(row["Estado"] ?? "").trim();
    if (!id || estado === "ELIMINADO" || !row["Fecha"]) { skipped++; continue; }

    const creadoEnRaw = cleanVal(row["CreadoEn"]);
    const validadoEnRaw = cleanVal(row["ValidadoEn"]);

    try {
      await db.insert(pagosDivisas).values({
        id,
        fecha: String(cleanVal(row["Fecha"]) ?? "").trim(),
        nombrePagador: cleanVal(row["NombrePagador"]) || cleanVal(row["Pagador"]) || "",
        correo: cleanVal(row["Correo"]),
        monto: cleanVal(row["Monto"]) || "0",
        tipo: cleanVal(row["Tipo"]) || "",
        referencia: cleanVal(row["Referencia"]),
        cliente: cleanVal(row["Cliente"]),
        rif: cleanVal(row["RIF"]),
        factura: cleanVal(row["Factura"]),
        observaciones: cleanVal(row["Observaciones"]),
        estado: estado || "Pendiente",
        validadoPor: cleanVal(row["ValidadoPor"]),
        vendedor: cleanVal(row["Vendedor"]) || "",
        creadoEn: creadoEnRaw ? new Date(creadoEnRaw) : new Date(),
        validadoEn: validadoEnRaw ? new Date(validadoEnRaw) : undefined,
      }).onConflictDoNothing();
      imported++;
    } catch { skipped++; }
  }

  console.log(`  Imported: ${imported}, Skipped: ${skipped}`);
  return { imported, skipped };
}

async function importSolicitudes(wb: ExcelJS.Workbook) {
  console.log("=== Importing Solicitudes ===");
  const { rows } = sheetToRows(wb.getWorksheet("Solicitudes"));
  if (rows.length === 0) { console.log("  Sheet not found or empty"); return { imported: 0, skipped: 0 }; }

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = parseInt(String(row["ID"] ?? ""));
    const estado = String(row["Estado"] ?? "").trim();
    if (!id || estado === "ELIMINADO" || !row["Vendedor"]) { skipped++; continue; }

    const creadoEnRaw = cleanVal(row["CreadoEn"]);
    const actualizadoEnRaw = cleanVal(row["ActualizadoEn"]);

    try {
      await db.insert(solicitudes).values({
        id,
        vendedor: cleanVal(row["Vendedor"]) || "",
        cliente: cleanVal(row["Cliente"]) || "",
        celular: cleanVal(row["Celular"]),
        sku: cleanVal(row["SKU"]),
        producto: cleanVal(row["Producto"]) || "",
        cantidad: cleanVal(row["Cantidad"]) || "1",
        fechaTope: cleanVal(row["FechaTope"]),
        observaciones: cleanVal(row["Observaciones"]),
        estado: estado || "Pendiente",
        creadoEn: creadoEnRaw ? new Date(creadoEnRaw) : new Date(),
        observacionesCompras: cleanVal(row["ObservacionesCompras"]),
        actualizadoEn: actualizadoEnRaw ? new Date(actualizadoEnRaw) : undefined,
        respondidoPor: cleanVal(row["RespondidoPor"]),
        categoria: cleanVal(row["Categoria"]),
      }).onConflictDoNothing();
      imported++;
    } catch { skipped++; }
  }

  console.log(`  Imported: ${imported}, Skipped: ${skipped}`);
  return { imported, skipped };
}

async function importExtractos(wb: ExcelJS.Workbook) {
  console.log("=== Importing Extractos ===");
  const { rows } = sheetToRows(wb.getWorksheet("Extractos"));
  if (rows.length === 0) { console.log("  Sheet not found or empty"); return { imported: 0, skipped: 0 }; }

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = cleanVal(row["id"]);
    if (!id) { skipped++; continue; }

    try {
      await db.insert(extractos).values({
        id,
        banco: cleanVal(row["banco"]) || "",
        fecha: cleanVal(row["fecha"]) || "",
        monto: cleanVal(row["monto"]) || "0",
        referencia: cleanVal(row["referencia"]),
        celular: cleanVal(row["celular"]),
        descripcion: cleanVal(row["descripcion"]),
        subidoPor: cleanVal(row["subidoPor"]) || "system",
        subidoEn: cleanVal(row["subidoEn"]) || new Date().toISOString(),
        usado: cleanVal(row["usado"]) || "false",
      }).onConflictDoNothing();
      imported++;
    } catch { skipped++; }
  }

  console.log(`  Imported: ${imported}, Skipped: ${skipped}`);
  return { imported, skipped };
}

async function main() {
  console.log("Downloading spreadsheet...");
  const xlsxPath = await downloadSheet();
  console.log(`Downloaded to: ${xlsxPath}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  console.log("Sheets found:", wb.worksheets.map(w => w.name));

  const result: Record<string, { imported: number; skipped: number }> = {};

  result.usuarios = await importUsuarios(wb);
  result.pagos = await importPagos(wb);
  result.pagos_divisas = await importPagosDivisas(wb);
  result.solicitudes = await importSolicitudes(wb);
  result.extractos = await importExtractos(wb);

  // Clean up
  try { fs.unlinkSync(xlsxPath); } catch {}

  console.log("\n=== Import Complete ===");
  console.log(JSON.stringify(result, null, 2));

  await pool.end();
}

main().catch(err => {
  console.error("Import failed:", err);
  pool.end();
  process.exit(1);
});
