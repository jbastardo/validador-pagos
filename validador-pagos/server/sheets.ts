import { google } from "googleapis";

// ─── Configuración ────────────────────────────────────────────────────────────
// En producción estas variables vienen del entorno (Railway / .env)
const SHEET_ID   = process.env.GOOGLE_SHEET_ID   ?? "1l2PODqxJeecLP7ZhNMtDmMXBIkIGgkYWhI5hKgr4kKY";
const TAB_NAME   = process.env.GOOGLE_SHEET_TAB  ?? "Pagos";     // nombre de la pestaña
const RANGE_READ = `${TAB_NAME}!A:Q`;

// Autenticación con Service Account
// GOOGLE_SERVICE_ACCOUNT_JSON debe ser el contenido JSON completo del archivo de credenciales
function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Falta la variable de entorno GOOGLE_SERVICE_ACCOUNT_JSON");
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

// ─── Interfaz ─────────────────────────────────────────────────────────────────
export interface SheetPago {
  id: string;
  fechaPago: string;
  tipoPago: string;
  bancoEmisor: string;
  monto: string;
  celular: string;
  bancoReceptor: string;
  referencia: string;
  rif: string;
  factura: string;
  estado: string;
  validadoPor: string;
  vendedor: string;
  observaciones: string;
  creadoEn: string;
  cliente: string;   // col P (index 15)
  megasoft: string;  // col Q (index 16) — "Sí" | "No" | ""
  _rowIndex?: number;
}

// ─── Leer todos los pagos ─────────────────────────────────────────────────────
export async function getPagos(): Promise<SheetPago[]> {
  const sheets = getSheetsClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: RANGE_READ,
  });
  const rows = resp.data.values ?? [];
  if (rows.length < 2) return [];
  // rows[0] = headers, rows[1..n] = datos
  return rows.slice(1).map((row, i) => ({
    id:            row[0]  ?? "",
    fechaPago:     row[1]  ?? "",
    tipoPago:      row[2]  ?? "",
    bancoEmisor:   row[3]  ?? "",
    monto:         row[4]  ?? "",
    celular:       row[5]  ?? "",
    bancoReceptor: row[6]  ?? "",
    referencia:    row[7]  ?? "",
    rif:           row[8]  ?? "",
    factura:       row[9]  ?? "",
    estado:        row[10] ?? "",
    validadoPor:   row[11] ?? "",
    vendedor:      row[12] ?? "",
    observaciones: row[13] ?? "",
    creadoEn:      row[14] ?? "",
    cliente:       row[15] ?? "",
    megasoft:      row[16] ?? "",
    _rowIndex:     i + 2,  // fila real en Sheet (1-indexed, +1 por header)
  }));
}

// ─── Generar siguiente ID ─────────────────────────────────────────────────────
export async function getNextId(): Promise<number> {
  const pagos = await getPagos();
  if (pagos.length === 0) return 1;
  const maxId = Math.max(...pagos.map(p => parseInt(p.id) || 0));
  return maxId + 1;
}

// ─── Agregar pago nuevo ───────────────────────────────────────────────────────
export async function addPago(pago: Omit<SheetPago, "id" | "_rowIndex">): Promise<SheetPago> {
  const sheets = getSheetsClient();
  const id = await getNextId();
  const row = [
    String(id),
    pago.fechaPago, pago.tipoPago, pago.bancoEmisor, pago.monto,
    pago.celular, pago.bancoReceptor, pago.referencia,
    pago.rif, pago.factura, pago.estado,
    pago.validadoPor, pago.vendedor, pago.observaciones, pago.creadoEn,
    pago.cliente ?? "", pago.megasoft ?? "",
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${TAB_NAME}!A:Q`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
  return { ...pago, id: String(id) };
}

// ─── Actualizar estado (contabilidad / admin) ─────────────────────────────────
export async function updatePagoEstado(
  id: string,
  estado: string,
  validadoPor: string,
  observaciones: string
): Promise<SheetPago | null> {
  const sheets = getSheetsClient();
  const pagos = await getPagos();
  const pago = pagos.find(p => p.id === id);
  if (!pago || !pago._rowIndex) return null;

  const updatedRow = [
    pago.id, pago.fechaPago, pago.tipoPago, pago.bancoEmisor, pago.monto,
    pago.celular, pago.bancoReceptor, pago.referencia, pago.rif, pago.factura,
    estado, validadoPor, pago.vendedor, observaciones, pago.creadoEn,
    pago.cliente ?? "", pago.megasoft ?? "",
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TAB_NAME}!A${pago._rowIndex}:Q${pago._rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [updatedRow] },
  });

  return { ...pago, estado, validadoPor, observaciones };
}

// ─── Actualizar factura + megasoft (cajero) ───────────────────────────────────
export async function updatePagoCajero(
  id: string,
  factura: string,
  megasoft: string
): Promise<SheetPago | null> {
  const sheets = getSheetsClient();
  const pagos = await getPagos();
  const pago = pagos.find(p => p.id === id);
  if (!pago || !pago._rowIndex) return null;

  const updatedRow = [
    pago.id, pago.fechaPago, pago.tipoPago, pago.bancoEmisor, pago.monto,
    pago.celular, pago.bancoReceptor, pago.referencia, pago.rif,
    factura,
    pago.estado, pago.validadoPor, pago.vendedor, pago.observaciones, pago.creadoEn,
    pago.cliente ?? "",
    megasoft,
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TAB_NAME}!A${pago._rowIndex}:Q${pago._rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [updatedRow] },
  });

  return { ...pago, factura, megasoft };
}

// ─── Verificar duplicado ──────────────────────────────────────────────────────
export async function checkDuplicado(
  referencia: string,
  monto: string,
  fechaPago: string,
  tipoPago: string
): Promise<SheetPago | undefined> {
  const pagos = await getPagos();
  if (referencia && referencia.trim() !== "") {
    const dup = pagos.find(
      p => p.referencia.trim() === referencia.trim() && p.tipoPago === tipoPago
    );
    if (dup) return dup;
  }
  if (tipoPago === "PagoMovil") {
    const dup = pagos.find(
      p => p.monto === monto && p.fechaPago === fechaPago && p.tipoPago === tipoPago
    );
    if (dup) return dup;
  }
  return undefined;
}
