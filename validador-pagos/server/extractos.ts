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
    id: row[0]??"", banco: row[1]??"", fecha: row[2]??"", monto: row[3]??"",
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

// ─── Parser Excel (idéntico a extractos.ts) ────────────────────────────────────
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
  return s.slice(0, 10);
}

function normalizeMonto(raw: unknown): string {
  if (raw === null || raw === undefined) return "0";
  if (typeof raw === "number") return raw.toFixed(2);
  const s = String(raw).trim().replace(/[Bb][Ss]\.?\s*/i, "").trim();
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return s.replace(/\./g, "").replace(",", ".");
  return s.replace(",", ".");
}

function norm6(raw: unknown): string { return String(raw ?? "").replace(/\D/g, "").slice(-6); }
function normCelular(raw: unknown): string { return String(raw ?? "").replace(/\D/g, "").replace(/^58/, "0"); }

function detectColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const v = String(h ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!map.fecha      && /fecha|date|^fec/.test(v))             map.fecha      = i;
    if (!map.monto      && /monto|importe|credito|abono|amount|haber/.test(v)) map.monto = i;
    if (!map.referencia && /referen|^ref\b|nro.*ref|num.*ref|nro.*op/.test(v)) map.referencia = i;
    if (!map.celular    && /celular|telefon|movil|nro.*tel/.test(v))           map.celular    = i;
    if (!map.descripcion && /descrip|concepto|detalle|description/.test(v))   map.descripcion = i;
  });
  return map;
}

export interface ParseResult {
  movimientos: Omit<MovimientoExtracto, "_rowIndex">[];
  warnings: string[]; total: number; skipped: number;
}

export function parseExtractoExcel(buffer: Buffer, banco: string, subidoPor: string): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const warnings: string[] = [];
  const movimientos: Omit<MovimientoExtracto, "_rowIndex">[] = [];
  let skipped = 0;
  let headerRowIdx = -1;
  let colMap: Record<string, number> = {};
  for (let r = 0; r < Math.min(aoa.length, 20); r++) {
    const candidate = detectColumns(aoa[r].map(c => String(c ?? "")));
    if (candidate.fecha !== undefined && candidate.monto !== undefined) { headerRowIdx = r; colMap = candidate; break; }
  }
  if (headerRowIdx === -1) {
    warnings.push("No se detectaron encabezados. Asumiendo A=Fecha, B=Referencia, C=Monto, D=Celular.");
    colMap = { fecha: 0, referencia: 1, monto: 2, celular: 3, descripcion: 4 }; headerRowIdx = 0;
  }
  for (const row of aoa.slice(headerRowIdx + 1)) {
    const fecha = normalizeDate(row[colMap.fecha] ?? "");
    const monto = normalizeMonto(row[colMap.monto] ?? "");
    if (!fecha || isNaN(parseFloat(monto)) || parseFloat(monto) <= 0) { skipped++; continue; }
    movimientos.push({
      id: randomUUID(), banco, fecha, monto,
      referencia: norm6(colMap.referencia !== undefined ? row[colMap.referencia] : ""),
      celular: normCelular(colMap.celular !== undefined ? row[colMap.celular] : ""),
      descripcion: String(colMap.descripcion !== undefined ? row[colMap.descripcion] : "").slice(0, 100),
      subidoPor, subidoEn: new Date().toISOString(), usado: "false",
    });
  }
  return { movimientos, warnings, total: movimientos.length, skipped };
}

// ─── Auto-conciliación ──────────────────────────────────────────────────────────
export async function tryMatch(tipoPago: string, bancoReceptor: string, fechaPago: string, monto: string, referencia: string, celular: string): Promise<MovimientoExtracto | null> {
  const bancoCodigo = bancoReceptor.slice(0, 4);
  const movs = (await getMovimientos(bancoCodigo)).filter(m => m.usado !== "true");
  const montoNum = parseFloat(monto.replace(",", "."));
  const fechaTarget = new Date(fechaPago + "T12:00:00Z");
  for (const m of movs) {
    const diffDias = Math.abs((fechaTarget.getTime() - new Date(m.fecha + "T12:00:00Z").getTime()) / 86400000);
    if (diffDias > 1) continue;
    if (Math.abs(parseFloat(m.monto.replace(",", ".")) - montoNum) > 0.01) continue;
    if (tipoPago === "Transferencia") {
      if (referencia && m.referencia && m.referencia === referencia) return m;
      if (!referencia || !m.referencia) return m;
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
