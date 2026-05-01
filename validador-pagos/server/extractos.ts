/**
 * extractos.ts — Parser de archivos Excel para extractos bancarios
 *
 * Solo mantiene las funciones de parsing. El almacenamiento ahora es en PostgreSQL (ver db.ts).
 */

import * as XLSX from "xlsx";

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
function normalizeDate(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,"0")}-${m1[1].padStart(2,"0")}`;
  return "";
}

function normalizeMonto(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";
  if (typeof raw === "number") return Math.abs(raw).toFixed(2);
  let s = String(raw).trim().replace(/^[+]/, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Math.abs(parseFloat(s.replace(/\./g, "").replace(",", "."))).toFixed(2);
  if (/^\d+(,\d+)?$/.test(s)) return Math.abs(parseFloat(s.replace(",", "."))).toFixed(2);
  if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(s)) return Math.abs(parseFloat(s.replace(/,/g, ""))).toFixed(2);
  const num = parseFloat(s.replace(/[^0-9.-]/g, ""));
  return isNaN(num) ? "" : Math.abs(num).toFixed(2);
}

function norm10(raw: unknown): string { return String(raw ?? "").replace(/\D/g, "").slice(-10).padStart(10, "0"); }

function normCelular(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "").replace(/^58/, "0");
  const m = digits.match(/(04\d{9})$/);
  return m ? m[1] : digits.slice(-11);
}

// ─── Parsers por banco ────────────────────────────────────────────────────

// BANESCO: header fila 0 [Fecha(serial), Referencia, Descripción, Monto(float), Balance]
function parseBanesco(aoa: unknown[][], banco: string, subidoPor: string): ParseResult {
  const movimientos: Omit<MovimientoExtracto, "_rowIndex">[] = [];
  let skipped = 0;
  for (const row of aoa.slice(1)) {
    const fecha = normalizeDate(row[0]);
    if (!fecha) { skipped++; continue; }
    const montoNum = typeof row[3] === "number" ? row[3]
      : parseFloat(String(row[3] ?? "").replace(/[^0-9.,-]/g, "").replace(",", "."));
    if (isNaN(montoNum) || montoNum <= 0) { skipped++; continue; }
    const desc = String(row[2] ?? "").trim();
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
    if (String(aoa[i][1] ?? "").trim().toLowerCase() === "fecha") { headerIdx = i; break; }
  }
  if (headerIdx === -1) return { movimientos, warnings: ["BNC: header no encontrado"], total: 0, skipped: aoa.length };
  for (const row of aoa.slice(headerIdx + 1)) {
    const fecha = normalizeDate(row[1]);
    if (!fecha) { skipped++; continue; }
    const haberNum = typeof row[15] === "number" ? row[15]
      : parseFloat(String(row[15] ?? "0").replace(/,/g, "."));
    if (isNaN(haberNum) || haberNum <= 0) { skipped++; continue; }
    const tipoOp = String(row[6] ?? "").trim();
    const desc = String(row[7] ?? "").trim();
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
    if (String(row[4] ?? "").trim().toUpperCase() !== "NC") { skipped++; continue; }
    const fecha = normalizeDate(row[3]);
    if (!fecha) { skipped++; continue; }
    const monto = normalizeMonto(row[5]);
    if (!monto || parseFloat(monto) <= 0) { skipped++; continue; }
    const desc = String(row[2] ?? "").trim();
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
export function parseExtractoExcel(buffer: Buffer, banco: string, subidoPor: string): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (banco === "0134") return parseBanesco(aoa, banco, subidoPor);
  if (banco === "0191") return parseBNC(aoa, banco, subidoPor);
  if (banco === "0102") return parseBDV(aoa, banco, subidoPor);
  return { movimientos: [], warnings: [`Banco ${banco} sin parser específico`], total: 0, skipped: 0 };
}
