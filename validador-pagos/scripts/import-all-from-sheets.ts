import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pagos, usuarios, pagosDivisas, solicitudes, extractos } from "@shared/schema";
import XLSX from "xlsx";
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

function cleanVal(v: any): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

async function importUsuarios(wb: XLSX.WorkBook) {
  console.log("=== Importing Usuarios ===");
  const ws = wb.Sheets["Usuarios"];
  if (!ws) { console.log("  Sheet not found"); return { imported: 0, skipped: 0 }; }
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  const headers = data[0]?.map(h => String(h).trim()) || [];

  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < data.length; i++) {
    const row: Record<string, any> = {};
    headers.forEach((h, idx) => { row[h] = data[i]?.[idx]; });

    const id = parseInt(row["ID"]);
    const activo = String(row["Activo"] || "").trim();
    if (!id || activo === "ELIMINADO" || !row["Email"] || !row["Nombre"]) { skipped++; continue; }

    try {
      await db.insert(usuarios).values({
        id,
        nombre: String(row["Nombre"] || "").trim(),
        email: String(row["Email"] || "").trim(),
        password: String(row["Password"] || "").trim(),
        rol: cleanVal(row["Rol"]) || "vendedor",
        activo: activo === "true" ? "true" : "false",
        solicitudes: String(row["solicitudes"] || "").trim() === "true" ? "true" : "false",
        telegramChatId: cleanVal(row["bot telegram"]),
        creadoEn: new Date(),
      }).onConflictDoNothing();
      imported++;
    } catch { skipped++; }
  }

  console.log(`  Imported: ${imported}, Skipped: ${skipped}`);
  return { imported, skipped };
}

async function importPagos(wb: XLSX.WorkBook) {
  console.log("=== Importing Pagos ===");
  const ws = wb.Sheets["Hoja 1"];
  if (!ws) { console.log("  Sheet not found"); return { imported: 0, skipped: 0 }; }
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  const headers = data[0]?.map(h => String(h).trim()) || [];

  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < data.length; i++) {
    const row: Record<string, any> = {};
    headers.forEach((h, idx) => { row[h] = data[i]?.[idx]; });

    const id = parseInt(row["ID"]);
    const estado = String(row["Estado"] || "").trim();
    if (!id || estado === "ELIMINADO" || !row["Fecha"]) { skipped++; continue; }

    const megasoft = cleanVal(row["Megasoft"]);
    const creadoEn = cleanVal(row["CreadoEn"]);

    try {
      await db.insert(pagos).values({
        id,
        fechaPago: String(row["Fecha"] || "").trim(),
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

async function importPagosDivisas(wb: XLSX.WorkBook) {
  console.log("=== Importing Pagos Divisas ===");
  const ws = wb.Sheets["PagosDivisas"];
  if (!ws) { console.log("  Sheet not found"); return { imported: 0, skipped: 0 }; }
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  const headers = data[0]?.map(h => String(h).trim()) || [];

  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < data.length; i++) {
    const row: Record<string, any> = {};
    headers.forEach((h, idx) => { row[h] = data[i]?.[idx]; });

    const id = parseInt(row["ID"]);
    const estado = String(row["Estado"] || "").trim();
    if (!id || estado === "ELIMINADO" || !row["Fecha"]) { skipped++; continue; }

    try {
      await db.insert(pagosDivisas).values({
        id,
        fecha: String(row["Fecha"] || "").trim(),
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
        creadoEn: row["CreadoEn"] ? new Date(row["CreadoEn"]) : new Date(),
        validadoEn: row["ValidadoEn"] ? new Date(row["ValidadoEn"]) : undefined,
      }).onConflictDoNothing();
      imported++;
    } catch { skipped++; }
  }

  console.log(`  Imported: ${imported}, Skipped: ${skipped}`);
  return { imported, skipped };
}

async function importSolicitudes(wb: XLSX.WorkBook) {
  console.log("=== Importing Solicitudes ===");
  const ws = wb.Sheets["Solicitudes"];
  if (!ws) { console.log("  Sheet not found"); return { imported: 0, skipped: 0 }; }
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  const headers = data[0]?.map(h => String(h).trim()) || [];

  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < data.length; i++) {
    const row: Record<string, any> = {};
    headers.forEach((h, idx) => { row[h] = data[i]?.[idx]; });

    const id = parseInt(row["ID"]);
    const estado = String(row["Estado"] || "").trim();
    if (!id || estado === "ELIMINADO" || !row["Vendedor"]) { skipped++; continue; }

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
        creadoEn: row["CreadoEn"] ? new Date(row["CreadoEn"]) : new Date(),
        observacionesCompras: cleanVal(row["ObservacionesCompras"]),
        actualizadoEn: row["ActualizadoEn"] ? new Date(row["ActualizadoEn"]) : undefined,
        respondidoPor: cleanVal(row["RespondidoPor"]),
        categoria: cleanVal(row["Categoria"]),
      }).onConflictDoNothing();
      imported++;
    } catch { skipped++; }
  }

  console.log(`  Imported: ${imported}, Skipped: ${skipped}`);
  return { imported, skipped };
}

async function importExtractos(wb: XLSX.WorkBook) {
  console.log("=== Importing Extractos ===");
  const ws = wb.Sheets["Extractos"];
  if (!ws) { console.log("  Sheet not found"); return { imported: 0, skipped: 0 }; }
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  const headers = data[0]?.map(h => String(h).trim()) || [];

  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < data.length; i++) {
    const row: Record<string, any> = {};
    headers.forEach((h, idx) => { row[h] = data[i]?.[idx]; });

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

  const wb = XLSX.readFile(xlsxPath);
  console.log("Sheets found:", wb.SheetNames);

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