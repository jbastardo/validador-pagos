import { google } from "googleapis";

const SHEET_ID   = process.env.GOOGLE_SHEET_ID ?? "1l2PODqxJeecLP7ZhNMtDmMXBIkIGgkYWhI5hKgr4kKY";
const TAB_PAGOS   = process.env.GOOGLE_SHEET_TAB ?? "Hoja 1";
const TAB_USUARIOS = "Usuarios";
const TAB_DIVISAS  = "PagosDivisas";

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
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: tab,
  });
  return (res.data.values ?? []) as string[][];
}

async function appendRow(tab: string, row: string[]): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: tab,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

async function updateRow(tab: string, rowIndex: number, row: string[]): Promise<void> {
  const sheets = getSheets();
  const colCount = row.length;
  const lastCol = String.fromCharCode(64 + colCount); // A=1, Q=17 etc
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A${rowIndex}:${lastCol}${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });
}

// ─── PAGOS BS ─────────────────────────────────────────────────────────────────
export interface SheetPago {
  id: string; fechaPago: string; tipoPago: string; bancoEmisor: string;
  monto: string; celular: string; bancoReceptor: string; referencia: string;
  rif: string; factura: string; estado: string; validadoPor: string;
  vendedor: string; observaciones: string; creadoEn: string;
  cliente: string; megasoft: string; _rowIndex?: number;
}

export async function getPagos(): Promise<SheetPago[]> {
  const rows = await getRows(TAB_PAGOS);
  if (rows.length < 2) return [];
  return rows.slice(1).map((row, i) => ({
    id: row[0]??"", fechaPago: row[1]??"", tipoPago: row[2]??"", bancoEmisor: row[3]??"",
    monto: row[4]??"", celular: row[5]??"", bancoReceptor: row[6]??"", referencia: row[7]??"",
    rif: row[8]??"", factura: row[9]??"", estado: row[10]??"", validadoPor: row[11]??"",
    vendedor: row[12]??"", observaciones: row[13]??"", creadoEn: row[14]??"",
    cliente: row[15]??"", megasoft: row[16]??"", _rowIndex: i + 2,
  }));
}

export async function getNextId(): Promise<number> {
  const pagos = await getPagos();
  if (pagos.length === 0) return 1;
  return Math.max(...pagos.map(p => parseInt(p.id) || 0)) + 1;
}

export async function addPago(pago: Omit<SheetPago, "id"|"_rowIndex">): Promise<SheetPago> {
  const id = await getNextId();
  const row = [String(id), pago.fechaPago, pago.tipoPago, pago.bancoEmisor, pago.monto,
    pago.celular, pago.bancoReceptor, pago.referencia, pago.rif, pago.factura, pago.estado,
    pago.validadoPor, pago.vendedor, pago.observaciones, pago.creadoEn, pago.cliente??"", pago.megasoft??""];
  await appendRow(TAB_PAGOS, row);
  return { ...pago, id: String(id) };
}

export async function updatePagoEstado(id: string, estado: string, validadoPor: string, observaciones: string): Promise<SheetPago|null> {
  const pagos = await getPagos();
  const pago = pagos.find(p => p.id === id);
  if (!pago || !pago._rowIndex) return null;
  const row = [pago.id, pago.fechaPago, pago.tipoPago, pago.bancoEmisor, pago.monto,
    pago.celular, pago.bancoReceptor, pago.referencia, pago.rif, pago.factura,
    estado, validadoPor, pago.vendedor, observaciones, pago.creadoEn, pago.cliente??"", pago.megasoft??""];
  await updateRow(TAB_PAGOS, pago._rowIndex, row);
  return { ...pago, estado, validadoPor, observaciones };
}

export async function updatePagoCajero(id: string, factura: string, megasoft: string): Promise<SheetPago|null> {
  const pagos = await getPagos();
  const pago = pagos.find(p => p.id === id);
  if (!pago || !pago._rowIndex) return null;
  const row = [pago.id, pago.fechaPago, pago.tipoPago, pago.bancoEmisor, pago.monto,
    pago.celular, pago.bancoReceptor, pago.referencia, pago.rif, factura,
    pago.estado, pago.validadoPor, pago.vendedor, pago.observaciones, pago.creadoEn, pago.cliente??"", megasoft];
  await updateRow(TAB_PAGOS, pago._rowIndex, row);
  return { ...pago, factura, megasoft };
}

export async function checkDuplicado(referencia: string, monto: string, fechaPago: string, tipoPago: string): Promise<SheetPago|undefined> {
  const pagos = await getPagos();
  if (referencia?.trim()) {
    const dup = pagos.find(p => p.referencia.trim() === referencia.trim() && p.tipoPago === tipoPago);
    if (dup) return dup;
  }
  if (tipoPago === "PagoMovil")
    return pagos.find(p => p.monto === monto && p.fechaPago === fechaPago && p.tipoPago === tipoPago);
}

// ─── USUARIOS ─────────────────────────────────────────────────────────────────
export interface SheetUsuario {
  id: string; nombre: string; email: string; password: string; rol: string; activo: string; _rowIndex?: number;
}

export async function getUsuarios(): Promise<SheetUsuario[]> {
  const rows = await getRows(TAB_USUARIOS);
  if (rows.length < 2) return [];
  return rows.slice(1).map((row, i) => ({
    id: row[0]??"", nombre: row[1]??"", email: row[2]??"", password: row[3]??"",
    rol: row[4]??"vendedor", activo: row[5]??"true", _rowIndex: i + 2,
  }));
}

export async function addUsuario(u: Omit<SheetUsuario, "_rowIndex">): Promise<SheetUsuario> {
  const row = [u.id, u.nombre, u.email, u.password, u.rol, u.activo];
  await appendRow(TAB_USUARIOS, row);
  return u;
}

export async function updateUsuario(id: string, data: Partial<SheetUsuario>): Promise<SheetUsuario> {
  const usuarios = await getUsuarios();
  const u = usuarios.find(x => x.id === id);
  if (!u || !u._rowIndex) throw new Error("Usuario no encontrado");
  const updated = { ...u, ...data };
  const row = [updated.id, updated.nombre, updated.email, updated.password, updated.rol, updated.activo];
  await updateRow(TAB_USUARIOS, u._rowIndex, row);
  return updated;
}

// ─── PAGOS DIVISAS ────────────────────────────────────────────────────────────
export interface SheetPagoDivisa {
  id: string; fecha: string; nombrePagador: string; correo: string;
  monto: string; tipo: string; referencia: string; cliente: string;
  rif: string; factura: string; observaciones: string; estado: string;
  validadoPor: string; vendedor: string; creadoEn: string; _rowIndex?: number;
}

export async function getPagosDivisas(): Promise<SheetPagoDivisa[]> {
  const rows = await getRows(TAB_DIVISAS);
  if (rows.length < 2) return [];
  return rows.slice(1).map((row, i) => ({
    id: row[0]??"", fecha: row[1]??"", nombrePagador: row[2]??"", correo: row[3]??"",
    monto: row[4]??"", tipo: row[5]??"", referencia: row[6]??"", cliente: row[7]??"",
    rif: row[8]??"", factura: row[9]??"", observaciones: row[10]??"", estado: row[11]??"",
    validadoPor: row[12]??"", vendedor: row[13]??"", creadoEn: row[14]??"", _rowIndex: i + 2,
  }));
}

export async function addPagoDivisa(pago: Omit<SheetPagoDivisa, "id"|"_rowIndex">): Promise<SheetPagoDivisa> {
  const existing = await getPagosDivisas();
  const id = String((existing.length === 0 ? 0 : Math.max(...existing.map(p => parseInt(p.id) || 0))) + 1);
  const row = [id, pago.fecha, pago.nombrePagador, pago.correo, pago.monto, pago.tipo,
    pago.referencia, pago.cliente, pago.rif, pago.factura, pago.observaciones,
    pago.estado, pago.validadoPor, pago.vendedor, pago.creadoEn];
  await appendRow(TAB_DIVISAS, row);
  return { ...pago, id };
}
