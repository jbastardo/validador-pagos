/**
 * extractos.ts — Parser de archivos Excel para extractos bancarios
 *
 * Solo mantiene las funciones de parsing. El almacenamiento ahora es en PostgreSQL (ver db.ts).
 */

import ExcelJS from "exceljs";

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface MovimientoExtracto {
  id: string; banco: string; fecha: string; monto: string;
  referencia: string; celular: string; descripcion: string;
  subidoPor: string; subidoEn: string; usado: string;
}

export interface ParseResult {
  movimientos: Omit<MovimientoExtracto, "_rowIndex">[];
  warnings: string[]; total: number; skipped: number;
}

// ─── Funciones auxiliares ───────────────────────────────────────────────────

/** Convierte un valor de celda ExcelJS (que puede ser objeto Date, número, string, formula, hyperlink) a un primitivo. */
function cellToPrimitive(raw: unknown): unknown {
  if (raw === null || raw === undefined) return "";
  if (raw instanceof Date) return raw;
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    // Hyperlink cell: { text, hyperlink }
    if ("text" in obj && typeof obj.text === "string") return obj.text;
    // Rich text: { richText: [{ text, ... }] }
    if (Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: unknown }>).map(r => String(r.text ?? "")).join("");
    }
    // Formula result: { result, formula }
    if ("result" in obj) return cellToPrimitive(obj.result);
    // Error cell: { error }
    if ("error" in obj) return "";
  }
  return raw;
}

function normalizeDate(raw: unknown): string {
  const v = cellToPrimitive(raw);
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") {
    // Excel serial date → JS date (Excel epoch: 1899-12-30)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const dt = new Date(ms);
    if (!isNaN(dt.getTime())) {
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
      const d = String(dt.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,"0")}-${m1[1].padStart(2,"0")}`;
  return "";
}

function normalizeMonto(raw: unknown): string {
  const v = cellToPrimitive(raw);
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return Math.abs(v).toFixed(2);
  let s = String(v).trim().replace(/^[+]/, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Math.abs(parseFloat(s.replace(/\./g, "").replace(",", "."))).toFixed(2);
  if (/^\d+(,\d+)?$/.test(s)) return Math.abs(parseFloat(s.replace(",", "."))).toFixed(2);
  if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(s)) return Math.abs(parseFloat(s.replace(/,/g, ""))).toFixed(2);
  const num = parseFloat(s.replace(/[^0-9.-]/g, ""));
  return isNaN(num) ? "" : Math.abs(num).toFixed(2);
}

function norm10(raw: unknown): string {
  const v = cellToPrimitive(raw);
  return String(v ?? "").replace(/\D/g, "").slice(-10).padStart(10, "0");
}

function normCelular(raw: unknown): string {
  const v = cellToPrimitive(raw);
  const digits = String(v ?? "").replace(/\D/g, "").replace(/^58/, "0");
  const m = digits.match(/(04\d{9})$/);
  return m ? m[1] : digits.slice(-11);
}

function asString(raw: unknown): string {
  const v = cellToPrimitive(raw);
  if (v instanceof Date) return v.toISOString();
  return String(v ?? "");
}

function asNumber(raw: unknown): number {
  const v = cellToPrimitive(raw);
  if (typeof v === "number") return v;
  if (v instanceof Date) return NaN;
  const s = String(v ?? "").replace(/[^0-9.,-]/g, "").replace(",", ".");
  return parseFloat(s);
}

// ─── Parsers por banco ────────────────────────────────────────────────────

// BANESCO: header fila 0 [Fecha(serial), Referencia, Descripción, Monto(float), Balance]
function parseBanesco(aoa: unknown[][], banco: string, subidoPor: string): ParseResult {
  const movimientos: Omit<MovimientoExtracto, "_rowIndex">[] = [];
  let skipped = 0;
  for (const row of aoa.slice(1)) {
    const fecha = normalizeDate(row[0]);
    if (!fecha) { skipped++; continue; }
    const montoNum = asNumber(row[3]);
    if (isNaN(montoNum) || montoNum <= 0) { skipped++; continue; }
    const desc = asString(row[2]).trim();
    const esPM = /pago.?movil|banesco.?pago/i.test(desc);
    let celular = "";
    const telM = desc.match(/TELF[:\.]+([\d]+)/i);
    if (telM) celular = normCelular(telM[1]);
    movimientos.push({
      id: crypto.randomUUID(), banco, fecha, monto: montoNum.toFixed(2),
      referencia: esPM ? "" : norm10(row[1]), celular,
      descripcion: desc.slice(0, 100), subidoPor, subidoEn: new Date().toISOString(), usado: "false",
    });
  }
  return { movimientos, warnings: [], total: movimientos.length, skipped };
}

// BNC: cabecera institucional filas 0-14, header en fila 15
// cols: 1=Fecha, 6=TipoOp, 7=Descripción, 12=Referencia, 15=Haber
function parseBNC(aoa: unknown[][], banco: string, subidoPor: string): ParseResult {
  const movimientos: Omit<MovimientoExtracto, "_rowIndex">[] = [];
  let skipped = 0;
  let headerIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 25); i++) {
    if (asString(aoa[i][1]).trim().toLowerCase() === "fecha") { headerIdx = i; break; }
  }
  if (headerIdx === -1) return { movimientos, warnings: ["BNC: header no encontrado"], total: 0, skipped: aoa.length };
  for (const row of aoa.slice(headerIdx + 1)) {
    const fecha = normalizeDate(row[1]);
    if (!fecha) { skipped++; continue; }
    const haberNum = asNumber(row[15]);
    if (isNaN(haberNum) || haberNum <= 0) { skipped++; continue; }
    const tipoOp = asString(row[6]).trim();
    const desc = asString(row[7]).trim();
    const esPM = /pago.?movil|abono.?pago/i.test(tipoOp);
    let celular = "";
    const telM = desc.match(/TELF[:\.]+([0-9]{7,15})/i);
    if (telM) celular = normCelular(telM[1]);
    movimientos.push({
      id: crypto.randomUUID(), banco, fecha, monto: haberNum.toFixed(2),
      referencia: esPM ? "" : norm10(row[12]), celular,
      descripcion: desc.slice(0, 100), subidoPor, subidoEn: new Date().toISOString(), usado: "false",
    });
  }
  return { movimientos, warnings: [], total: movimientos.length, skipped };
}

// BDV: header fila 0, cols: 1=Ref, 2=Desc, 3=Fecha(DD/MM/YYYY), 4=TipoMov, 5=Crédito
// Solo filas NC (créditos), monto en formato venezolano "11.100,22"
function parseBDV(aoa: unknown[][], banco: string, subidoPor: string): ParseResult {
  const movimientos: Omit<MovimientoExtracto, "_rowIndex">[] = [];
  let skipped = 0;
  for (const row of aoa.slice(1)) {
    if (asString(row[4]).trim().toUpperCase() !== "NC") { skipped++; continue; }
    const fecha = normalizeDate(row[3]);
    if (!fecha) { skipped++; continue; }
    const monto = normalizeMonto(row[5]);
    if (!monto || parseFloat(monto) <= 0) { skipped++; continue; }
    const desc = asString(row[2]).trim();
    const esPM = /pagomovil|pago.?movil/i.test(desc);
    let celular = "";
    const telM = desc.match(/(04[0-9]{9})/);
    if (telM) celular = telM[1];
    movimientos.push({
      id: crypto.randomUUID(), banco, fecha, monto,
      referencia: esPM ? "" : norm10(row[1]), celular,
      descripcion: desc.slice(0, 100), subidoPor, subidoEn: new Date().toISOString(), usado: "false",
    });
  }
  return { movimientos, warnings: [], total: movimientos.length, skipped };
}

// ─── Parser principal ─────────────────────────────────────────────────────

/**
 * Convierte un Worksheet de ExcelJS a un array-of-arrays como el que producía xlsx.utils.sheet_to_json
 * con `{ header: 1, defval: "" }`. Las celdas vacías se rellenan con "".
 */
function worksheetToAoa(ws: ExcelJS.Worksheet): unknown[][] {
  const aoa: unknown[][] = [];
  const lastCol = ws.actualColumnCount || ws.columnCount || 0;
  ws.eachRow({ includeEmpty: true }, (row) => {
    const arr: unknown[] = [];
    // ExcelJS row indices are 1-based; column 0 in row.values is always undefined.
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      const v = cell.value;
      arr.push(v === null || v === undefined ? "" : v);
    }
    aoa.push(arr);
  });
  return aoa;
}

export async function parseExtractoExcel(buffer: Buffer, banco: string, subidoPor: string): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { movimientos: [], warnings: ["Archivo sin hojas"], total: 0, skipped: 0 };
  const aoa = worksheetToAoa(ws);
  if (banco === "0134") return parseBanesco(aoa, banco, subidoPor);
  if (banco === "0191") return parseBNC(aoa, banco, subidoPor);
  if (banco === "0102") return parseBDV(aoa, banco, subidoPor);
  return { movimientos: [], warnings: [`Banco ${banco} sin parser específico`], total: 0, skipped: 0 };
}
