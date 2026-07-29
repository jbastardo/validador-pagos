/**
 * Exporta todas las hojas de Google Sheets a archivos CSV
 * Requiere: GOOGLE_SERVICE_ACCOUNT_JSON y GOOGLE_SHEET_ID
 */

import { google } from "googleapis";
import { writeFileSync } from "fs";
import { join } from "path";

const SHEET_ID = process.env.GOOGLE_SHEET_ID ?? "1l2PODqxJeecLP7ZhNMtDmMXBIkIGgkYWhI5hKgr4kKY";
const TABS = ["Hoja 1", "PagosDivisas", "Usuarios", "Solicitudes", "Extractos"];

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

function arrayToCsv(rows: any[][]): string {
  return rows.map(row =>
    row.map(cell => {
      const str = String(cell ?? "");
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (/[,"\n\r]/.test(str)) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(",")
  ).join("\n");
}

async function exportTab(tabName: string): Promise<void> {
  const sheets = getSheets();
  console.log(`Exportando ${tabName}...`);
  
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: tabName,
  });
  
  const rows = (res.data.values ?? []) as any[][];
  if (rows.length === 0) {
    console.log(`  ⚠ ${tabName} está vacía`);
    return;
  }
  
  const csv = arrayToCsv(rows);
  const filename = `${tabName.replace(/\s+/g, "_")}.csv`;
  const filepath = join(__dirname, "csv-exports", filename);
  
  // Create directory if not exists
  const { mkdirSync } = require("fs");
  mkdirSync(join(__dirname, "csv-exports"), { recursive: true });
  
  writeFileSync(filepath, csv, "utf8");
  console.log(`  ✓ ${rows.length} filas exportadas a ${filename}`);
}

async function main() {
  console.log("Iniciando exportación de Google Sheets a CSV...\n");
  
  for (const tab of TABS) {
    try {
      await exportTab(tab);
    } catch (e: any) {
      console.error(`  ✗ Error exportando ${tab}: ${e.message}`);
    }
  }
  
  console.log("\n✅ Exportación completada. Archivos en ./csv-exports/");
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
