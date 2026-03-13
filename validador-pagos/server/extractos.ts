/**
 * extractos_railway.ts — Motor de conciliación automática (versión Railway / googleapis)
 *
 * Mismo comportamiento que extractos.ts pero usando googleapis en lugar del CLI external-tool.
 */

import { google } from "googleapis";
import * as XLSX from "xlsx";
import { randomUUID } from "crypto";

const SHEET_ID    = process.env.GOOGLE_SHEET_ID ?? "1l2PODqxJeecLP7ZhNMtDmMXBIkIGgkYWhI5hKgr4kKY";
const TAB_EXTRACTOS = "Extractos";

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

async function appendRows(tab: string, rows: string[][]): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: tab,
    valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

async function updateRow(tab: string, rowIndex: number, row: string[]): Promise<void> {
  const sheets = getSheets();
  const colEnd = String.fromCharCode(65 + row.length - 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `${tab}!A${rowIndex}:${colEnd}${rowIndex}`,
    valueInputOption: "RAW", requestBody: { values: [row] },
  });
}

/** Asegura que la hoja Extractos existe, con cabecera */
async function ensureExtractosSheet(): Promise<void> {
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets?.some(s => s.properties?.title === TAB_EXTRACTOS);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB_EXTRACTOS } } }] },
    });
    await appendRows(TAB_EXTRACTOS, [["id","banco","fecha","monto","referencia","celular","descripcion","subidoPor","subidoEn","usado"]]);
  }
}

// ─── Tipo ───────────────────────────────────────────────────────────────────────
export interface MovimientoExtracto {
  id: string; banco: string; fecha: string; monto: string;
  referencia: string; celular: string; descripcion: string;
  subidoPor: string; subidoEn: string; usado: string; _rowIndex?: number;
}

// ─── CRUD ───────────────────────────────────────────────────────────────────────
export async function getMovimientos(banco?: string): Promise<MovimientoExtracto[]> {
  await ensureExtractosSheet();
  const rows = await getRows(TAB_EXTRACTOS);
  if (rows.length < 2) return [];
  const all = rows.slice(1).map((row, i): MovimientoExtracto => ({
    id: row[0]??"", banco: String(row[1]??"").replace(/\D/g,"").padStart(4,"0"), fecha: row[2]??"", monto: row[3]??"",
    referencia: row[4]??"", celular: row[5]??"", descripcion: row[6]??"",
    subidoPor: row[7]??"", subidoEn: row[8]??"", usado: row[9]??"false",
    _rowIndex: i + 2,
  })).filter(m => m.id !== "");
  return banco ? all.filter(m => m.banco === banco) : all;
}

export async function addMovimientos(items: Omit<MovimientoExtracto, "_rowIndex">[]): Promise<void> {
  if (items.length === 0) return;
  await ensureExtractosSheet();
  const rows = items.map(m => [m.id, m.banco, m.fecha, m.monto, m.referencia, m.celular, m.descripcion, m.subidoPor, m.subidoEn, m.usado]);
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    await appendRows(TAB_EXTRACTOS, rows.slice(i, i + BATCH));
  }
}

export async function deleteMovimientosBanco(banco: string): Promise<number> {
  const movs = await getMovimientos(banco);
  for (const m of movs) {
    if (!m._rowIndex) continue;
    await updateRow(TAB_EXTRACTOS, m._rowIndex, ["","","","","","","","","",""]);
  }
  return movs.length;
}

export async function marcarUsado(movId: string): Promise<void> {
  const movs = await getMovimientos();
  const m = movs.find(x => x.id === movId);
  if (!m || !m._rowIndex) return;
  await updateRow(TAB_EXTRACTOS, m._rowIndex, [m.id, m.banco, m.fecha, m.monto, m.referencia, m.celular, m.descripcion, m.subidoPor, m.subidoEn, "true"]);
}

// ─── Parser Excel ──────────────────────────────────────────────────────────────

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
    movimientos.push({ id: randomUUID(), banco, fecha, monto: montoNum.toFixed(2),
      referencia: esPM ? "" : norm10(row[1]), celular,
      descripcion: desc.slice(0, 100), subidoPor, subidoEn: new Date().toISOString(), usado: "false" });
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
    movimientos.push({ id: randomUUID(), banco, fecha, monto: haberNum.toFixed(2),
      referencia: esPM ? "" : norm10(row[12]), celular,
      descripcion: desc.slice(0, 100), subidoPor, subidoEn: new Date().toISOString(), usado: "false" });
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
    movimientos.push({ id: randomUUID(), banco, fecha, monto,
      referencia: esPM ? "" : norm10(row[1]), celular,
      descripcion: desc.slice(0, 100), subidoPor, subidoEn: new Date().toISOString(), usado: "false" });
  }
  return { movimientos, warnings: [], total: movimientos.length, skipped };
}

export interface ParseResult {
  movimientos: Omit<MovimientoExtracto, "_rowIndex">[];
  warnings: string[]; total: number; skipped: number;
}

export function parseExtractoExcel(buffer: Buffer, banco: string, subidoPor: string): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (banco === "0134") return parseBanesco(aoa, banco, subidoPor);
  if (banco === "0191") return parseBNC(aoa, banco, subidoPor);
  if (banco === "0102") return parseBDV(aoa, banco, subidoPor);
  return { movimientos: [], warnings: [`Banco ${banco} sin parser específico`], total: 0, skipped: 0 };
}

// ─── Auto-conciliación ──────────────────────────────────────────────────────────
export async function tryMatch(tipoPago: string, bancoReceptor: string, fechaPago: string, monto: string, referencia: string, celular: string): Promise<MovimientoExtracto | null> {
  const bancoCodigo = bancoReceptor.slice(0, 4);
  const movs = (await getMovimientos(bancoCodigo)).filter(m => m.usado !== "true");
  const montoNum = parseFloat(monto.replace(",", "."));
  const fechaTarget = new Date(fechaPago + "T12:00:00Z");
  const TOLERANCIA_MONTO = 5; // Bs — diferencias por redondeo bancario
  for (const m of movs) {
    const diffDias = Math.abs((fechaTarget.getTime() - new Date(m.fecha + "T12:00:00Z").getTime()) / 86400000);
    if (diffDias > 1) continue;
    if (Math.abs(parseFloat(m.monto.replace(",", ".")) - montoNum) > TOLERANCIA_MONTO) continue;
    if (tipoPago === "Transferencia") {
      const refPago = referencia.replace(/\D/g, "").slice(-6);
      const refMov  = m.referencia.replace(/\D/g, "").slice(-6);
      if (refPago && refMov && refPago === refMov) return m;
      if (!refPago && !refMov) return m;
    }
    if (tipoPago === "PagoMovil") {
      if (celular && m.celular && celular.replace(/\D/g,"").slice(-9) === m.celular.replace(/\D/g,"").slice(-9)) return m;
    }
  }
  return null;
}

export async function getExtractosStats() {
  const todos = await getMovimientos();
  const byBanco: Record<string, { total: number; usados: number; disponibles: number; ultimaSubida: string }> = {};
  for (const m of todos) {
    if (!byBanco[m.banco]) byBanco[m.banco] = { total: 0, usados: 0, disponibles: 0, ultimaSubida: "" };
    byBanco[m.banco].total++;
    if (m.usado === "true") byBanco[m.banco].usados++; else byBanco[m.banco].disponibles++;
    if (!byBanco[m.banco].ultimaSubida || m.subidoEn > byBanco[m.banco].ultimaSubida) byBanco[m.banco].ultimaSubida = m.subidoEn;
  }
  return { byBanco };
}
