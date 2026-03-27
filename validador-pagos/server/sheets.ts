import { google } from "googleapis";
import { extractBancoCode } from "../shared/schema";

const SHEET_ID    = process.env.GOOGLE_SHEET_ID ?? "1l2PODqxJeecLP7ZhNMtDmMXBIkIGgkYWhI5hKgr4kKY";
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
  const lastCol = String.fromCharCode(64 + colCount);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A${rowIndex}:${lastCol}${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });
}

// --- PAGOS BS ---
export interface SheetPago {
  id: string; fechaPago: string; tipoPago: string; bancoEmisor: string;
  monto: string; celular: string; bancoReceptor: string; referencia: string;
  rif: string; factura: string; estado: string; validadoPor: string;
  vendedor: string; observaciones: string; creadoEn: string;
  cliente: string; megasoft: string; validadoEn: string; conciliadoEn?: string; conciliadoPor?: string; _rowIndex?: number;
}

export async function getPagos(): Promise<SheetPago[]> {
  const rows = await getRows(TAB_PAGOS);
  if (rows.length < 2) return [];
  return rows.slice(1)
    .map((row, i) => ({
      id: row[0]??"", fechaPago: row[1]??"", tipoPago: row[2]??"", bancoEmisor: row[3]??"",
      monto: row[4]??"", celular: row[5]??"", bancoReceptor: row[6]??"", referencia: row[7]??"",
      rif: row[8]??"", factura: row[9]??"", estado: row[10]??"", validadoPor: row[11]??"",
      vendedor: row[12]??"", observaciones: row[13]??"", creadoEn: row[14]??"",
      cliente: row[15]??"", megasoft: row[16]??"", validadoEn: row[17]??"", conciliadoEn: row[18]??"", conciliadoPor: row[19]??"", _rowIndex: i + 2,
    }))
    .filter(p => p.id !== "" && p.estado !== "ELIMINADO");
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
    pago.validadoPor, pago.vendedor, pago.observaciones, pago.creadoEn, pago.cliente??"", pago.megasoft??"", ""];
  await appendRow(TAB_PAGOS, row);
  return { ...pago, id: String(id), validadoEn: "" };
}

export async function updatePagoEstado(id: string, estado: string, validadoPor: string, observaciones: string): Promise<SheetPago|null> {
  const pagos = await getPagos();
  const pago = pagos.find(p => p.id === id);
  if (!pago || !pago._rowIndex) return null;
  const validadoEn = new Date().toISOString();
  const row = [pago.id, pago.fechaPago, pago.tipoPago, pago.bancoEmisor, pago.monto,
    pago.celular, pago.bancoReceptor, pago.referencia, pago.rif, pago.factura,
    estado, validadoPor, pago.vendedor, observaciones, pago.creadoEn, pago.cliente??"", pago.megasoft??"", validadoEn, pago.conciliadoEn??"", pago.conciliadoPor??""];
  await updateRow(TAB_PAGOS, pago._rowIndex, row);
  return { ...pago, estado, validadoPor, observaciones, validadoEn };
}

export async function updatePagoCajero(id: string, factura: string, megasoft: string, cliente?: string): Promise<SheetPago|null> {
  const pagos = await getPagos();
  const pago = pagos.find(p => p.id === id);
  if (!pago || !pago._rowIndex) return null;
  const clienteVal = (cliente !== undefined && cliente !== "") ? cliente : (pago.cliente ?? "");
  const row = [pago.id, pago.fechaPago, pago.tipoPago, pago.bancoEmisor, pago.monto,
    pago.celular, pago.bancoReceptor, pago.referencia, pago.rif, factura || pago.factura,
    pago.estado, pago.validadoPor, pago.vendedor, pago.observaciones, pago.creadoEn, clienteVal, megasoft, pago.validadoEn??"", pago.conciliadoEn??"", pago.conciliadoPor??""];
  await updateRow(TAB_PAGOS, pago._rowIndex, row);
  return { ...pago, factura: factura || pago.factura, megasoft, cliente: clienteVal };
}

export async function updatePagoCajeroPendiente(
  id: string, factura: string, cliente: string, megasoft: string, cajeroEmail: string
): Promise<SheetPago|null> {
  const pagos = await getPagos();
  const pago = pagos.find(p => p.id === id);
  if (!pago || !pago._rowIndex) return null;
  const autoAprueba = megasoft === "Si";
  const nuevoEstado = autoAprueba ? "Verificado" : pago.estado;
  const nuevoValidado = autoAprueba ? cajeroEmail : pago.validadoPor;
  const validadoEnCajero = autoAprueba ? new Date().toISOString() : (pago.validadoEn ?? "");
  const row = [
    pago.id, pago.fechaPago, pago.tipoPago, pago.bancoEmisor, pago.monto,
    pago.celular, pago.bancoReceptor, pago.referencia, pago.rif, factura || pago.factura,
    nuevoEstado, nuevoValidado, pago.vendedor, pago.observaciones, pago.creadoEn,
    cliente || (pago.cliente ?? ""), megasoft, validadoEnCajero, pago.conciliadoEn??"", pago.conciliadoPor??"",
  ];
  await updateRow(TAB_PAGOS, pago._rowIndex, row);
  return { ...pago, factura: factura || pago.factura, cliente: cliente || (pago.cliente ?? ""), megasoft, estado: nuevoEstado, validadoPor: nuevoValidado, validadoEn: validadoEnCajero };
}

export async function updatePagoFacturaCliente(id: string, factura: string, cliente: string, megasoft?: string, cajeroEmail?: string): Promise<SheetPago|null> {
  const pagos = await getPagos();
  const pago = pagos.find(p => p.id === id);
  if (!pago || !pago._rowIndex) return null;
  const newFactura = factura || pago.factura;
  const newCliente = cliente || (pago.cliente ?? "");
  const newMegasoft = (megasoft !== undefined && megasoft !== "") ? megasoft : (pago.megasoft ?? "");
  const autoAprueba = newMegasoft === "Si";
  const nuevoEstado = autoAprueba ? "Verificado" : pago.estado;
  const nuevoValidado = autoAprueba ? (cajeroEmail || "Cajero") + " (Megasoft)" : pago.validadoPor;
  const nuevoValidadoEn = autoAprueba ? new Date().toISOString() : (pago.validadoEn ?? "");
  const row = [pago.id, pago.fechaPago, pago.tipoPago, pago.bancoEmisor, pago.monto,
    pago.celular, pago.bancoReceptor, pago.referencia, pago.rif, newFactura,
    nuevoEstado, nuevoValidado, pago.vendedor, pago.observaciones, pago.creadoEn, newCliente, newMegasoft, nuevoValidadoEn, pago.conciliadoEn??"", pago.conciliadoPor??""];
  await updateRow(TAB_PAGOS, pago._rowIndex, row);
  return { ...pago, factura: newFactura, cliente: newCliente, megasoft: newMegasoft, estado: nuevoEstado, validadoPor: nuevoValidado, validadoEn: nuevoValidadoEn };
}

export async function checkDuplicado(
  referencia: string, monto: string, fechaPago: string, tipoPago: string, bancoReceptor?: string, celular?: string
): Promise<SheetPago|undefined> {
  const pagos = await getPagos();
  const norm10 = (s: string) => s.replace(/\D/g, "").padStart(10, "0").slice(-10);
  if (referencia?.trim()) {
    const refNorm = norm10(referencia);
    if (refNorm !== "0000000000") {
      const dup = pagos.find(p => {
        const pRefNorm = norm10(p.referencia);
        return (
          pRefNorm === refNorm &&
          pRefNorm !== "0000000000" &&
          extractBancoCode(p.bancoReceptor) === extractBancoCode(bancoReceptor ?? "")
        );
      });
      if (dup) return dup;
    }
  }
  if (tipoPago === "PagoMovil" && !referencia?.trim()) {
    return pagos.find(p =>
      p.tipoPago === "PagoMovil" && !p.referencia?.trim() &&
      p.monto === monto && p.fechaPago === fechaPago &&
      p.celular.trim() === (celular ?? "").trim()
    );
  }
}

// --- USUARIOS ---
export interface SheetUsuario {
  id: string; nombre: string; email: string; password: string; rol: string; activo: string; solicitudes: string; telegramChatId?: string; _rowIndex?: number;
}

export async function getUsuarios(): Promise<SheetUsuario[]> {
  const rows = await getRows(TAB_USUARIOS);
  if (rows.length < 2) return [];
  return rows.slice(1)
    .map((row, i) => ({
      id: row[0]??"", nombre: row[1]??"", email: row[2]??"", password: row[3]??"",
      rol: row[4]??"vendedor", activo: row[5]??"true", solicitudes: row[6]??"false",
      telegramChatId: row[7]??"",
      _rowIndex: i + 2,
    }))
    .filter(u => u.id !== "" && u.activo !== "ELIMINADO");
}

export async function addUsuario(u: Omit<SheetUsuario, "_rowIndex">): Promise<SheetUsuario> {
  const row = [u.id, u.nombre, u.email, u.password, u.rol, u.activo, u.solicitudes ?? "false", u.telegramChatId ?? ""];
  await appendRow(TAB_USUARIOS, row);
  return u;
}

export async function updateUsuario(id: string, data: Partial<SheetUsuario>): Promise<SheetUsuario> {
  const usuarios = await getUsuarios();
  const u = usuarios.find(x => x.id === id);
  if (!u || !u._rowIndex) throw new Error("Usuario no encontrado");
  const updated = { ...u, ...data };
  const row = [updated.id, updated.nombre, updated.email, updated.password, updated.rol, updated.activo, updated.solicitudes ?? "false", updated.telegramChatId ?? ""];
  await updateRow(TAB_USUARIOS, u._rowIndex, row);
  return updated;
}

export async function updateUsuarioTelegramChatId(email: string, chatId: string): Promise<SheetUsuario|null> {
  const usuarios = await getUsuarios();
  const u = usuarios.find(x => x.email === email);
  if (!u || !u._rowIndex) return null;
  const updated = { ...u, telegramChatId: chatId };
  const row = [updated.id, updated.nombre, updated.email, updated.password, updated.rol, updated.activo, updated.solicitudes ?? "false", chatId];
  await updateRow(TAB_USUARIOS, u._rowIndex, row);
  return updated;
}

// --- PAGOS DIVISAS ---
export interface SheetPagoDivisa {
  id: string; fecha: string; nombrePagador: string; correo: string; monto: string; tipo: string;
  referencia: string; cliente: string; rif: string; factura: string; observaciones: string;
  estado: string; validadoPor: string; vendedor: string; creadoEn: string; validadoEn: string; _rowIndex?: number;
}

export async function getPagosDivisas(): Promise<SheetPagoDivisa[]> {
  const rows = await getRows(TAB_DIVISAS);
  if (rows.length < 2) return [];
  return rows.slice(1)
    .map((row, i) => ({
      id: row[0]??"", fecha: row[1]??"", nombrePagador: row[2]??"", correo: row[3]??"",
      monto: row[4]??"", tipo: row[5]??"", referencia: row[6]??"", cliente: row[7]??"",
      rif: row[8]??"", factura: row[9]??"", observaciones: row[10]??"", estado: row[11]??"",
      validadoPor: row[12]??"", vendedor: row[13]??"", creadoEn: row[14]??"", validadoEn: row[15]??"",
      _rowIndex: i + 2,
    }))
    .filter(p => p.id !== "" && p.estado !== "ELIMINADO");
}

export async function addPagoDivisa(pago: Omit<SheetPagoDivisa, "id"|"_rowIndex"|"validadoEn">): Promise<SheetPagoDivisa> {
  const existing = await getPagosDivisas();
  const id = String((existing.length === 0 ? 0 : Math.max(...existing.map(p => parseInt(p.id) || 0))) + 1);
  const row = [id, pago.fecha, pago.nombrePagador, pago.correo, pago.monto, pago.tipo, pago.referencia, pago.cliente, pago.rif, pago.factura, pago.observaciones, pago.estado, pago.validadoPor, pago.vendedor, pago.creadoEn, ""];
  await appendRow(TAB_DIVISAS, row);
  return { ...pago, id, validadoEn: "" };
}

export async function updatePagoDivisaEstado(id: string, estado: string, validadoPor: string, observaciones: string): Promise<SheetPagoDivisa|null> {
  const pagos = await getPagosDivisas();
  const pago = pagos.find(p => p.id === id);
  if (!pago || !pago._rowIndex) return null;
  const validadoEn = new Date().toISOString();
  const row = [pago.id, pago.fecha, pago.nombrePagador, pago.correo, pago.monto, pago.tipo, pago.referencia, pago.cliente, pago.rif, pago.factura, pago.observaciones, estado, validadoPor, pago.vendedor, pago.creadoEn, validadoEn];
  await updateRow(TAB_DIVISAS, pago._rowIndex, row);
  return { ...pago, estado, validadoPor, observaciones, validadoEn };
}

export async function updatePagoEdicion(id: string, data: { fechaPago: string; bancoEmisor: string; bancoReceptor: string; monto: string; referencia: string; celular: string; cliente?: string; observaciones?: string; rif?: string; factura?: string; megasoft?: string; cajeroEmail?: string }): Promise<SheetPago|null> {
  const pagos = await getPagos();
  const pago = pagos.find(p => p.id === id);
  if (!pago || !pago._rowIndex) return null;
  const clienteVal = data.cliente !== undefined ? data.cliente : (pago.cliente ?? "");
  const obsVal = data.observaciones !== undefined ? data.observaciones : (pago.observaciones ?? "");
  const rifVal = data.rif !== undefined ? data.rif : (pago.rif ?? "");
  const facturaVal = data.factura !== undefined ? data.factura : (pago.factura ?? "");
  const megasoftVal = (data.megasoft !== undefined && data.megasoft !== "") ? data.megasoft : (pago.megasoft ?? "");
  const autoAprueba = megasoftVal === "Si" && pago.megasoft !== "Si";
  const nuevoEstado = autoAprueba ? "Verificado" : pago.estado;
  const nuevoValidado = autoAprueba ? (data.cajeroEmail || "Admin") + " (Megasoft)" : pago.validadoPor;
  const nuevoValidadoEn = autoAprueba ? new Date().toISOString() : (pago.validadoEn ?? "");
  const row = [pago.id, data.fechaPago, pago.tipoPago, data.bancoEmisor, data.monto, data.celular, data.bancoReceptor, data.referencia, rifVal, facturaVal, nuevoEstado, nuevoValidado, pago.vendedor, obsVal, pago.creadoEn, clienteVal, megasoftVal, nuevoValidadoEn, pago.conciliadoEn??"", pago.conciliadoPor??""];
  await updateRow(TAB_PAGOS, pago._rowIndex, row);
  return { ...pago, ...data, cliente: clienteVal, observaciones: obsVal, rif: rifVal, factura: facturaVal, megasoft: megasoftVal, estado: nuevoEstado, validadoPor: nuevoValidado, validadoEn: nuevoValidadoEn };
}

export async function updatePagoDivisaEdicion(id: string, data: { fecha: string; nombrePagador: string; monto: string; tipo: string; referencia: string; observaciones?: string }): Promise<SheetPagoDivisa|null> {
  const pagos = await getPagosDivisas();
  const pago = pagos.find(p => p.id === id);
  if (!pago || !pago._rowIndex) return null;
  const obsVal = data.observaciones !== undefined ? data.observaciones : (pago.observaciones ?? "");
  const row = [pago.id, data.fecha, data.nombrePagador, pago.correo, data.monto, data.tipo, data.referencia, pago.cliente, pago.rif, pago.factura, obsVal, pago.estado, pago.validadoPor, pago.vendedor, pago.creadoEn, pago.validadoEn??""];
  await updateRow(TAB_DIVISAS, pago._rowIndex, row);
  return { ...pago, ...data, observaciones: obsVal };
}

// --- ELIMINAR ---
export async function deletePago(id: string): Promise<boolean> {
  const pagos = await getPagos();
  const pago = pagos.find(p => p.id === id);
  if (!pago || !pago._rowIndex) return false;
  const emptyRow = ["", "", "", "", "", "", "", "", "", "", "ELIMINADO", "", "", "", "", "", ""];
  await updateRow(TAB_PAGOS, pago._rowIndex, emptyRow);
  return true;
}

export async function deletePagoDivisa(id: string): Promise<boolean> {
  const pagos = await getPagosDivisas();
  const pago = pagos.find(p => p.id === id);
  if (!pago || !pago._rowIndex) return false;
  const emptyRow = ["", "", "", "", "", "", "", "", "", "", "", "ELIMINADO", "", "", ""];
  await updateRow(TAB_DIVISAS, pago._rowIndex, emptyRow);
  return true;
}

export async function deleteUsuario(id: string): Promise<boolean> {
  const usuarios = await getUsuarios();
  const u = usuarios.find(x => x.id === id);
  if (!u || !u._rowIndex) return false;
  const emptyRow = ["", "", "", "", "", "ELIMINADO", "", ""];
  await updateRow(TAB_USUARIOS, u._rowIndex, emptyRow);
  return true;
}

// --- SOLICITUDES ---
const TAB_SOLICITUDES = "Solicitudes";

export interface SheetSolicitud {
  id: string; vendedor: string; cliente: string; celular: string; sku: string; producto: string;
  cantidad: string; fechaTope: string; observaciones: string; estado: string; creadoEn: string;
  _rowIndex?: number; observacionesCompras?: string; actualizadoEn?: string; respondidoPor?: string;
}

export async function getSolicitudes(): Promise<SheetSolicitud[]> {
  const rows = await getRows(TAB_SOLICITUDES);
  if (rows.length < 2) return [];
  return rows.slice(1)
    .map((row, i) => ({
      id: row[0]??"", vendedor: row[1]??"", cliente: row[2]??"", celular: row[3]??"",
      sku: row[4]??"", producto: row[5]??"", cantidad: row[6]??"", fechaTope: row[7]??"",
      observaciones: row[8]??"", estado: row[9]??"", creadoEn: row[10]??"",
      observacionesCompras: row[11]??"", actualizadoEn: row[12]??"", respondidoPor: row[13]??"",
      _rowIndex: i + 2,
    }))
    .filter(s => s.id !== "" && s.estado !== "ELIMINADO");
}

export async function addSolicitud(s: Omit<SheetSolicitud, "id"|"_rowIndex">): Promise<SheetSolicitud> {
  const existing = await getSolicitudes();
  const id = String((existing.length === 0 ? 0 : Math.max(...existing.map(x => parseInt(x.id) || 0))) + 1);
  const row = [id, s.vendedor, s.cliente, s.celular ?? "", s.sku, s.producto, s.cantidad, s.fechaTope, s.observaciones, s.estado, s.creadoEn];
  await appendRow(TAB_SOLICITUDES, row);
  return { ...s, id };
}

export async function updateSolicitudEstado(id: string, estado: string): Promise<SheetSolicitud|null> {
  const solicitudes = await getSolicitudes();
  const s = solicitudes.find(x => x.id === id);
  if (!s || !s._rowIndex) return null;
  const row = [s.id, s.vendedor, s.cliente, s.celular ?? "", s.sku, s.producto, s.cantidad, s.fechaTope, s.observaciones, estado, s.creadoEn];
  await updateRow(TAB_SOLICITUDES, s._rowIndex, row);
  return { ...s, estado };
}

export async function deleteSolicitud(id: string): Promise<boolean> {
  const solicitudes = await getSolicitudes();
  const s = solicitudes.find(x => x.id === id);
  if (!s || !s._rowIndex) return false;
  const emptyRow = ["", "", "", "", "", "", "", "", "", "ELIMINADO", ""];
  await updateRow(TAB_SOLICITUDES, s._rowIndex, emptyRow);
  return true;
}

export async function updateSolicitudEdicion(
  id: string, data: { estado?: string; observacionesCompras?: string; fechaTope?: string; cantidad?: string },
  usuario?: string,
): Promise<SheetSolicitud|null> {
  const solicitudes = await getSolicitudes();
  const s = solicitudes.find(x => x.id === id);
  if (!s || !s._rowIndex) return null;
  const nuevoEstado = data.estado ?? s.estado;
  const nuevaObs = data.observacionesCompras !== undefined ? data.observacionesCompras : (s.observacionesCompras ?? "");
  const nuevaFecha = data.fechaTope ?? s.fechaTope;
  const nuevaCant = data.cantidad ?? s.cantidad;
  const actualizadoEn = new Date().toISOString();
      const respondidoPor = usuario || s.respondidoPor || "";
  const row = [
    s.id, s.vendedor, s.cliente, s.celular ?? "", s.sku, s.producto, nuevaCant, nuevaFecha,
    s.observaciones, nuevoEstado, s.creadoEn, nuevaObs, actualizadoEn, respondidoPor,
  ];
  await updateRow(TAB_SOLICITUDES, s._rowIndex, row);
  return { ...s, estado: nuevoEstado, observacionesCompras: nuevaObs, fechaTope: nuevaFecha, cantidad: nuevaCant, actualizadoEn , respondidoPor };
}
