/**
 * Parser de extractos bancarios Excel
 *
 * BANESCO (0134): Fecha|Referencia|Descripción|Monto|Balance
 *   - Monto es texto con signo y formato venezolano: "+40.217,16" o "-8.392,54"
 *   - Solo incluir filas con Monto positivo (empieza con "+")
 *   - Fecha es Excel serial number, convertir a DD/MM/YYYY
 *
 * BNC (0191): 3 formatos — "PreviousDay" (A), "Custom" (B), "Online" (C)
 *   - Encabezados dinámicos (buscar "Fecha"+"Referencia"), datos en fila siguiente
 *   - Format A (PreviousDay): Fecha=1, Desc=2,  Ref=9,  Haber=12 (date YYYY/MM/DD)
 *   - Format B (Custom):      Fecha=1, Desc=6+7,Ref=12, Haber=15 (date DD/MM/YYYY)
 *   - Format C (Online):      Fecha=1, Desc=3,  Ref=10, Haber=13 (date YYYY/MM/DD)
 *   - Detección por nombre de hoja (PreviousDay/Custom/Online), fallback por pos. Referencia
 *   - Última fila tiene "Totales" en col B — se detiene ahí
 *   - Montos son números planos con punto decimal (5897.82) — NO formato venezolano
 *
 * BDV (0102): 2 formatos — "Rango de fechas" (Format 1) y "Consulta de movimientos" (Format 2)
 *   - Sheet "data", fila 0 encabezados, datos desde fila 1
 *   - Formato 1 (13 cols): headers con "Día", filter by Col 4 = "NC", amount = Col 5
 *   - Formato 2 (11 cols): headers lowercase "fecha", filter by Col 7 = "Nota de Crédito", amount = Col 4
 *   - Detección por header col 0 ("Día" vs "fecha") o column count (13 vs 11)
 *   - Montos formato venezolano "2.234,02" → usar parseMontoVzla()
 */

import * as XLSX from "xlsx";

export interface ExtractoItem {
  fecha: string;        // YYYY-MM-DD
  banco: string;
  referencia: string;
  monto: number;
  descripcion: string;
  tipo: "ingreso" | "debito" | "comision";
}

// ─── Utilidades ───────────────────────────────────────────────────────────────
// ⚠️ WARNING: CRITICAL CODE - DO NOT REWRITE ⚠️
// These helper functions are shared by all bank extract parsers (BNC, BDV, Banesco).
// Verified against real bank extract files on 2026-03-17.
// Any modification may break bank reconciliation. Do NOT rewrite in future updates.

function excelSerialToDate(serial: number): string {
  const date = new Date((serial - 25569) * 86400 * 1000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// WARNING: parseMontoVzla — Parsea montos en formato venezolano (puntos = miles, coma = decimal).
// Duplicado de la función en routes.ts. Ambas deben mantenerse sincronizadas.
// Ejemplos: "7.863,76" → 7863.76, "7863,76" → 7863.76, "178.652,45" → 178652.45
// También maneja formato US "7,863.76" → 7863.76 y números planos.
function parseMontoVzla(val: string | number): number {
  if (typeof val === "number") return val;
  let s = String(val).trim();
  s = s.replace(/[Bb][Ss]\.?\s*/g, "").replace(/\$/g, "").trim();
  if (s.includes(",") && s.includes(".")) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  s = s.replace(/[^0-9.\-]/g, "");
  return parseFloat(s) || 0;
}

function parseDate(val: string | number | null): string {
  if (!val) return "";
  if (typeof val === "number") return excelSerialToDate(val);
  const s = String(val).trim();
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,"0")}-${m1[1].padStart(2,"0")}`;
  // YYYY/MM/DD o YYYY-MM-DD
  const m2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2,"0")}-${m2[3].padStart(2,"0")}`;
  return s;
}

function normalizeRef(ref: string | number | null): string {
  return String(ref ?? "").trim().replace(/\s+/g, "").padStart(10, "0").slice(-10);
}

function isComision(desc: string): boolean {
  const d = desc.toUpperCase();
  return (
    d.includes("COMISION") ||
    d.includes("COMISIÓN") ||
    d.includes("COM. TRF") ||
    d.includes("COBRO COMISION") ||
    d.includes("CARGO POR") ||
    d.includes("IVA COMIS") ||
    d.includes("CARGOS")
  );
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
// ⚠️ WARNING: CRITICAL CODE - DO NOT REWRITE ⚠️
// Entry point for all bank extract parsing. Routes to bank-specific parsers.
// BDV uses sheet "data" specifically. Any modification may break bank reconciliation.

export function parseExtractoBuffer(
  buffer: Buffer,
  bancoCode: string,
  filename: string
): ExtractoItem[] {
  const code = bancoCode.substring(0, 4);

  // Banesco files are HTML tables disguised as .xls — parse HTML directly
  // XLSX.read destroys Venezuelan number format (dots=thousands, comma=decimal)
  if (code === "0134") {
    const html = buffer.toString("utf-8").trim();
    if (html.startsWith("<table") || html.startsWith("<TABLE")) {
      return parseBanescoHTML(html, bancoCode);
    }
  }

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });

  // BDV uses sheet named "data"
  let sheetName: string;
  if (code === "0102" && workbook.SheetNames.includes("data")) {
    sheetName = "data";
  } else {
    sheetName = workbook.SheetNames[0];
  }
  const sheet = workbook.Sheets[sheetName];

  const raw = XLSX.utils.sheet_to_json(sheet, {
    header: 1, defval: null, blankrows: false,
  }) as (string | number | null)[][];

  switch (code) {
    case "0191": return parseBNC(raw, bancoCode, sheetName);
    case "0102": return parseBDV(raw, bancoCode);
    case "0134": return parseBanesco(raw, bancoCode);
    default:     return [];
  }
}

// ─── BANESCO (0134) ───────────────────────────────────────────────────────────
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ ⚠️  WARNING: CRITICAL CODE - DO NOT REWRITE ⚠️                         ║
// ║                                                                         ║
// ║  This function handles Banesco extract parsing.                         ║
// ║  Cols: 0=Fecha (Excel serial), 1=Referencia, 2=Descripción,            ║
// ║        3=Monto (+/- Venezuelan format), 4=Balance                       ║
// ║  Solo incluir filas con Monto positivo (empieza con "+")                ║
// ║                                                                         ║
// ║  Verified against real bank extract files on 2026-03-17.                ║
// ║  Any modification may break bank reconciliation.                        ║
// ║  Do NOT rewrite in future updates.                                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function parseBanesco(
  raw: (string | number | null)[][],
  banco: string,
): ExtractoItem[] {
  const items: ExtractoItem[] = [];

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || row.every(c => c === null)) continue;

    const fecha = parseDate(row[0]);
    if (!fecha) continue;

    const montoStr = String(row[3] ?? "").trim();
    if (!montoStr.startsWith("+")) continue; // only credits

    const ref  = normalizeRef(row[1]);
    const desc = String(row[2] ?? "").trim();

    // Strip "+" prefix, then parse Venezuelan format
    const monto = parseMontoVzla(montoStr.substring(1));
    if (monto <= 0) continue;

    items.push({
      fecha,
      banco,
      referencia: ref,
      monto,
      descripcion: desc,
      tipo: "ingreso",
    });
  }

  return items;
}

// ─── BANESCO HTML (0134) ─────────────────────────────────────────────────────
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ ⚠️  WARNING: CRITICAL CODE - DO NOT REWRITE ⚠️                         ║
// ║                                                                         ║
// ║  Banesco .xls files are HTML tables, NOT real Excel files.              ║
// ║  XLSX.read() destroys Venezuelan number format (dots=thousands,         ║
// ║  comma=decimal) and strips leading zeros from references.               ║
// ║  This function parses the raw HTML directly to preserve correct values. ║
// ║                                                                         ║
// ║  Cols: 0=Fecha (YYYY/MM/DD), 1=Referencia, 2=Descripción,              ║
// ║        3=Monto (+/- Venezuelan format), 4=Balance                       ║
// ║  Solo incluir filas con Monto positivo (empieza con "+")                ║
// ║                                                                         ║
// ║  Verified against real Banesco extract files on 2026-03-17.             ║
// ║  Any modification may break bank reconciliation.                        ║
// ║  Do NOT rewrite in future updates.                                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function parseBanescoHTML(html: string, banco: string): ExtractoItem[] {
  const items: ExtractoItem[] = [];

  // Extract all <tr> rows
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  let trMatch;
  let isFirst = true; // skip header row

  while ((trMatch = trRegex.exec(html)) !== null) {
    if (isFirst) { isFirst = false; continue; } // skip header

    const cells: string[] = [];
    let tdMatch;
    tdRegex.lastIndex = 0;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
      cells.push(tdMatch[1].replace(/<[^>]*>/g, "").trim());
    }

    if (cells.length < 5) continue;

    // cells: [0]=Fecha (YYYY/MM/DD), [1]=Referencia, [2]=Descripción, [3]=Monto (+/-), [4]=Balance
    const fecha = parseDate(cells[0]);
    if (!fecha) continue;

    const montoStr = cells[3].trim();
    if (!montoStr.startsWith("+")) continue; // only credits

    const ref = normalizeRef(cells[1]);
    const desc = cells[2].trim();
    const monto = parseMontoVzla(montoStr.substring(1)); // strip "+" then parse
    if (monto <= 0) continue;

    items.push({ fecha, banco, referencia: ref, monto, descripcion: desc, tipo: "ingreso" });
  }

  return items;
}

// ─── BNC (0191) ───────────────────────────────────────────────────────────────
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ ⚠️  WARNING: CRITICAL CODE - DO NOT REWRITE ⚠️                         ║
// ║  PARSER BNC — NO MODIFICAR columnas sin verificar archivo               ║
// ║                                                                         ║
// ║  BNC genera 3 formatos de extracto .xls:                                ║
// ║                                                                         ║
// ║  Format A: "PreviousDay" (rpt_TransactionsPreviousDay_Lis)              ║
// ║    • Sheet name contains "PreviousDay"                                  ║
// ║    • Col 1 = Fecha (YYYY/MM/DD → convert to DD/MM/YYYY)                ║
// ║    • Col 2 = Descripción                                                ║
// ║    • Col 9 = Referencia                                                 ║
// ║    • Col 10 = Debe                                                      ║
// ║    • Col 12 = Haber (monto de la transacción)                           ║
// ║    • Col 13 = Saldo (NO usar como monto!)                               ║
// ║                                                                         ║
// ║  Format B: "Custom" (rpt_TransactionsCustom_List)                       ║
// ║    • Sheet name contains "Custom"                                       ║
// ║    • Col 1 = Fecha (DD/MM/YYYY — already correct!)                      ║
// ║    • Col 6 = Descripción (Tipo Operación)                               ║
// ║    • Col 7 = Detalle adicional                                          ║
// ║    • Col 12 = Referencia                                                ║
// ║    • Col 13 = Debe                                                      ║
// ║    • Col 15 = Haber (monto de la transacción)                           ║
// ║    • Col 16 = Saldo (NO usar como monto!)                               ║
// ║                                                                         ║
// ║  Format C: "Online" (rpt_TransactionsOnline_List)                       ║
// ║    • Sheet name contains "Online"                                       ║
// ║    • Col 1 = Fecha (YYYY/MM/DD → convert to DD/MM/YYYY)                ║
// ║    • Col 3 = Descripción                                                ║
// ║    • Col 10 = Referencia                                                ║
// ║    • Col 11 = Debe                                                      ║
// ║    • Col 13 = Haber (monto de la transacción)                           ║
// ║    • Col 14 = Saldo (NO usar como monto!)                               ║
// ║                                                                         ║
// ║  Todos: última fila "Totales" en col 1, montos planos (5897.82)         ║
// ║  NO usan formato venezolano.                                            ║
// ║                                                                         ║
// ║  Quick reference (0-based column indices):                               ║
// ║  | Field   | A (PreviousDay) | B (Custom) | C (Online) |                ║
// ║  |---------|-----------------|------------|------------|                 ║
// ║  | Fecha   |       1         |     1      |     1      |                ║
// ║  | Desc    |       2         |     6 (+7) |     3      |                ║
// ║  | Ref     |       9         |    12      |    10      |                ║
// ║  | Debe    |      10         |    13      |    11      |                ║
// ║  | Haber   |      12         |    15      |    13      |                ║
// ║  | Saldo   |      13         |    16      |    14      |                ║
// ║  | DateFmt | YYYY/MM/DD      | DD/MM/YYYY | YYYY/MM/DD |                ║
// ║                                                                         ║
// ║  Verified against 4 real extract files on 2026-03-17:                   ║
// ║    bnc-170326.xls (A) → 138 credits                                    ║
// ║    bnc.xls (B) → 112 credits                                           ║
// ║    Rpt20260317103943.xls (B) → 536 credits                             ║
// ║    Rpt20260317103957.xls (C) → 35 credits                              ║
// ║  Any modification may break bank reconciliation.                        ║
// ║  Do NOT rewrite in future updates.                                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝
// Detection: sheet name ("PreviousDay" / "Custom" / "Online"), fallback by
// column count in header row. Header row found dynamically (Fecha + Referencia).
function parseBNC(raw: (string | number | null)[][], banco: string, sheetName?: string): ExtractoItem[] {
  const items: ExtractoItem[] = [];

  // ── Find header row dynamically (row containing both "Fecha" and "Referencia") ──
  let headerRow = -1;
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row) continue;
    const cells = row.map(c => String(c ?? "").trim().toLowerCase());
    if (cells.some(c => c === "fecha") && cells.some(c => c === "referencia")) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) return items;

  // ── Detect format: A (PreviousDay), B (Custom), or C (Online) ──
  // Primary: sheet name; Fallback: position of "Referencia" in header
  type BNCFormat = "A" | "B" | "C";
  let format: BNCFormat;
  const sn = (sheetName ?? "").toLowerCase();
  if (sn.includes("previousday")) {
    format = "A";
  } else if (sn.includes("custom")) {
    format = "B";
  } else if (sn.includes("online")) {
    format = "C";
  } else {
    // Fallback: detect by Referencia position in header row
    const headerCells = raw[headerRow].map(c => String(c ?? "").trim().toLowerCase());
    const refIdx = headerCells.indexOf("referencia");
    if (refIdx === 12) format = "B";
    else if (refIdx === 10) format = "C";
    else format = "A"; // refIdx === 9
  }

  // ── Column indices per format ──
  // Format A (PreviousDay): Desc=2, Ref=9,  Haber=12
  // Format B (Custom):      Desc=6, Ref=12, Haber=15 (detail in col 7)
  // Format C (Online):      Desc=3, Ref=10, Haber=13
  const colDesc  = format === "A" ? 2  : format === "B" ? 6  : 3;
  const colRef   = format === "A" ? 9  : format === "B" ? 12 : 10;
  const colHaber = format === "A" ? 12 : format === "B" ? 15 : 13;

  const dataStart = headerRow + 1;

  for (let i = dataStart; i < raw.length; i++) {
    const row = raw[i];
    if (!row) continue;

    // Stop at "Totales" row
    const primerVal = String(row[1] ?? "").trim().toLowerCase();
    if (primerVal === "totales" || primerVal === "total") break;
    if (!row[1]) continue;

    // Parse date — Format B is already DD/MM/YYYY, A and C are YYYY/MM/DD
    const fecha = parseDate(row[1]);
    if (!fecha) continue;

    // Description — Format B concatenates col 6 + col 7 (detail)
    let desc = String(row[colDesc] ?? "").trim();
    if (format === "B") {
      const detail = String(row[7] ?? "").trim();
      if (detail) desc = desc + " " + detail;
    }

    const ref   = normalizeRef(row[colRef]);
    const haber = typeof row[colHaber] === "number"
      ? row[colHaber]
      : parseFloat(String(row[colHaber] ?? "0")) || 0;

    // Only include rows where Haber > 0 (credits/incoming payments)
    if (haber <= 0) continue;

    items.push({
      fecha,
      banco,
      referencia: ref,
      monto: haber,
      descripcion: desc,
      tipo: "ingreso",
    });
  }

  return items;
}

// ─── BDV / Banco de Venezuela (0102) ─────────────────────────────────────────
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ ⚠️  WARNING: CRITICAL CODE - DO NOT REWRITE ⚠️                         ║
// ║                                                                         ║
// ║  This function handles BDV extract parsing with dual format             ║
// ║  auto-detection.                                                        ║
// ║                                                                         ║
// ║  Format 1: "Rango de fechas" (13 cols)                                  ║
// ║    • Col 0 = Día, Col 1 = Referencia, Col 2 = Descripción              ║
// ║    • Col 3 = Fecha (DD/MM/YYYY), Col 4 = Tipo Movimiento (NC/ND)       ║
// ║    • Col 5 = Crédito (Venezuelan format), Col 6 = Débito, Col 7 = Saldo║
// ║    • Filter: Col 4 === "NC"                                             ║
// ║    • Amount: Col 5 (Crédito)                                            ║
// ║                                                                         ║
// ║  Format 2: "Consulta de movimientos" (11 cols, lowercase headers)       ║
// ║    • Col 0 = fecha ("DD-MM-YYYY HH:MM"), Col 1 = referencia            ║
// ║    • Col 2 = descripcion, Col 3 = debito, Col 4 = credito              ║
// ║    • Col 5 = saldo, Col 6 = tipoMovimiento, Col 7 = indicadorCargoAbono║
// ║    • Col 8 = importe, Col 9 = numMovimiento, Col 10 = fechaHora        ║
// ║    • Filter: Col 7 === "Nota de Crédito"                               ║
// ║    • Amount: Col 4 (credito)                                            ║
// ║                                                                         ║
// ║  Detection: col 0 header "Día" or 13 cols → Format 1                   ║
// ║             col 0 header "fecha" or 11 cols → Format 2                  ║
// ║                                                                         ║
// ║  Verified against real bank extract files on 2026-03-17.                ║
// ║  Any modification may break bank reconciliation.                        ║
// ║  Do NOT rewrite in future updates.                                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝
function parseBDV(raw: (string | number | null)[][], banco: string): ExtractoItem[] {
  const items: ExtractoItem[] = [];
  if (raw.length === 0) return items;

  // Auto-detect format from header row
  const header0 = String(raw[0]?.[0] ?? "").trim();
  const colCount = raw[0]?.length ?? 0;
  const isFormat2 = header0 === "fecha" || colCount === 11;

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || row.every(c => c === null)) continue;

    if (isFormat2) {
      // Format 2: "Consulta de movimientos" (11 cols, lowercase headers)
      const indicador = String(row[7] ?? "").trim();
      if (indicador !== "Nota de Crédito") continue;

      // Date: "17-03-2026 10:43" → extract "17-03-2026" → convert to YYYY-MM-DD via parseDate
      const fechaRaw = String(row[0] ?? "").trim();
      const fechaPart = fechaRaw.split(" ")[0]; // "17-03-2026"
      const fecha = parseDate(fechaPart);
      if (!fecha) continue;

      const ref   = normalizeRef(row[1]);
      const desc  = String(row[2] ?? "").trim();
      const monto = parseMontoVzla(row[4] ?? 0); // credito column

      if (monto <= 0) continue;

      items.push({ fecha, banco, referencia: ref, monto, descripcion: desc, tipo: "ingreso" });
    } else {
      // Format 1: "Rango de fechas" (13 cols)
      const fecha = parseDate(row[3]);
      if (!fecha) continue;

      const tipoMov = String(row[4] ?? "").trim().toUpperCase();
      if (tipoMov !== "NC") continue; // only credits

      const ref   = normalizeRef(row[1]);
      const desc  = String(row[2] ?? "").trim();
      const monto = parseMontoVzla(row[5] ?? 0);

      if (monto <= 0) continue;

      items.push({ fecha, banco, referencia: ref, monto, descripcion: desc, tipo: "ingreso" });
    }
  }

  return items;
}
