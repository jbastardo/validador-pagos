import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pagos, pagosDivisas, solicitudes, extractos } from "@shared/schema";
import { sql } from "drizzle-orm";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// Google Sheets CSV export URL
const SHEET_ID = "1l2PODqxJeecLP7ZhNMtDmMXBIkIGgkYWhI5hKgr4kKY";

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(content: string) {
  const lines = content.split("\n").filter(line => line.trim());
  const headers = parseCSVLine(lines[0]).map(h => h.trim());

  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] || "").trim();
    });
    return row;
  });
}

async function fetchSheetCSV(gid?: string): Promise<string> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
  return res.text();
}

async function importPagos() {
  console.log("=== Importing Pagos ===");
  const content = await fetchSheetCSV();
  const rows = parseCSV(content);

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = row["ID"]?.trim();
    const estado = row["Estado"]?.trim();

    if (!id || estado === "ELIMINADO" || !row["Fecha"]?.trim()) {
      skipped++;
      continue;
    }

    const numericId = parseInt(id);
    if (isNaN(numericId)) {
      skipped++;
      continue;
    }

    try {
      await db.insert(pagos).values({
        id: numericId,
        fechaPago: row["Fecha"] || "",
        tipoPago: row["Tipo"] || "PagoMovil",
        bancoEmisor: row["BancoEmisor"] || "",
        monto: row["Monto"] || "0",
        celular: row["Celular"] || null,
        bancoReceptor: row["BancoReceptor"] || "",
        referencia: row["Referencia"] || null,
        rif: row["RIF"] || null,
        factura: row["Factura"] || null,
        estado: estado || "Pendiente",
        validadoPor: row["ValidadoPor"] || null,
        vendedor: row["Vendedor"] || "",
        observaciones: row["Observaciones"] || null,
        creadoEn: row["CreadoEn"] ? new Date(row["CreadoEn"]) : new Date(),
        cliente: row["Cliente"] || null,
        megasoft: row["Megasoft"] || null,
        validadoEn: row["Megasoft"]?.trim() === "Sí" ? new Date() : null,
      }).onConflictDoNothing();

      imported++;
    } catch (err: any) {
      if (err?.message?.includes("duplicate")) {
        skipped++;
      } else {
        console.error(`Error importing pago ${id}:`, err.message);
      }
    }
  }

  console.log(`Pagos: Imported ${imported}, Skipped ${skipped}`);
}

async function importPagosDivisas() {
  console.log("=== Importing Pagos Divisas ===");
  try {
    const content = await fetchSheetCSV("1893844273");
    const rows = parseCSV(content);

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const id = row["ID"]?.trim();
      const estado = row["Estado"]?.trim();

      if (!id || estado === "ELIMINADO" || !row["Fecha"]?.trim()) {
        skipped++;
        continue;
      }

      const numericId = parseInt(id);
      if (isNaN(numericId)) {
        skipped++;
        continue;
      }

      try {
        await db.insert(pagosDivisas).values({
          id: numericId,
          fecha: row["Fecha"] || "",
          nombrePagador: row["NombrePagador"] || row["Pagador"] || "",
          correo: row["Correo"] || null,
          monto: row["Monto"] || "0",
          tipo: row["Tipo"] || "",
          referencia: row["Referencia"] || null,
          cliente: row["Cliente"] || null,
          rif: row["RIF"] || null,
          factura: row["Factura"] || null,
          observaciones: row["Observaciones"] || null,
          estado: estado || "Pendiente",
          validadoPor: row["ValidadoPor"] || null,
          vendedor: row["Vendedor"] || "",
          creadoEn: row["CreadoEn"] ? new Date(row["CreadoEn"]) : new Date(),
          validadoEn: row["ValidadoEn"] ? new Date(row["ValidadoEn"]) : null,
        }).onConflictDoNothing();

        imported++;
      } catch (err: any) {
        if (err?.message?.includes("duplicate")) {
          skipped++;
        } else {
          console.error(`Error importing pago divisa ${id}:`, err.message);
        }
      }
    }

    console.log(`Pagos Divisas: Imported ${imported}, Skipped ${skipped}`);
  } catch (err: any) {
    console.log(`Pagos Divisas: Sheet not found or empty (${err.message})`);
  }
}

async function importSolicitudes() {
  console.log("=== Importing Solicitudes ===");
  try {
    const content = await fetchSheetCSV("0");
    const rows = parseCSV(content);

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const id = row["ID"]?.trim();
      const estado = row["Estado"]?.trim();

      if (!id || estado === "ELIMINADO" || !row["Vendedor"]?.trim()) {
        skipped++;
        continue;
      }

      const numericId = parseInt(id);
      if (isNaN(numericId)) {
        skipped++;
        continue;
      }

      try {
        await db.insert(solicitudes).values({
          id: numericId,
          vendedor: row["Vendedor"] || "",
          cliente: row["Cliente"] || "",
          celular: row["Celular"] || null,
          sku: row["SKU"] || null,
          producto: row["Producto"] || "",
          cantidad: row["Cantidad"] || "1",
          fechaTope: row["FechaTope"] || null,
          observaciones: row["Observaciones"] || null,
          estado: estado || "Pendiente",
          creadoEn: row["CreadoEn"] ? new Date(row["CreadoEn"]) : new Date(),
          observacionesCompras: row["ObservacionesCompras"] || null,
          actualizadoEn: row["ActualizadoEn"] ? new Date(row["ActualizadoEn"]) : null,
          respondidoPor: row["RespondidoPor"] || null,
          categoria: row["Categoria"] || null,
        }).onConflictDoNothing();

        imported++;
      } catch (err: any) {
        if (err?.message?.includes("duplicate")) {
          skipped++;
        } else {
          console.error(`Error importing solicitud ${id}:`, err.message);
        }
      }
    }

    console.log(`Solicitudes: Imported ${imported}, Skipped ${skipped}`);
  } catch (err: any) {
    console.log(`Solicitudes: Sheet not found or empty (${err.message})`);
  }
}

async function main() {
  await importPagos();
  await importPagosDivisas();
  await importSolicitudes();

  console.log("\n=== Done ===");
  await pool.end();
}

main().catch(err => {
  console.error(err);
  pool.end();
  process.exit(1);
});