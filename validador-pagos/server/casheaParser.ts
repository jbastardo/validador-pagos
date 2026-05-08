/**
 * Parser de archivos Excel de Cashea para importación masiva de pagos.
 * 
 * Formato esperado del Excel:
 * - Columna A (0): Fecha (DD/MM/YYYY o serial Excel)
 * - Columna B (1): Referencia (único)
 * - Columna C (2): Monto
 * - Columna D (3): Banco Emisor (código 4 dígitos)
 * - Columna E (4): Celular
 * - Columna F (5): Cliente/RIF (opcional)
 * 
 * Características:
 * - Todos los pagos son PagoMovil
 * - Banco receptor: 0191 (BNC)
 * - Vendedor: "Cashea" (fijo)
 */

import ExcelJS from "exceljs";

export interface PagoCashea {
  fechaPago: string;      // YYYY-MM-DD
  referencia: string;
  monto: string;
  bancoEmisor: string;    // código de 4 dígitos
  celular: string;
  rif: string;            // opcional
  cliente: string;        // opcional
}

export interface ParseResult {
  pagos: PagoCashea[];
  errores: string[];
  total: number;
  validos: number;
  invalidos: number;
}

/**
 * Convierte un serial number de Excel a fecha YYYY-MM-DD
 */
function excelSerialToDate(serial: number): string {
  // Excel epoch: Jan 1, 1900 (con ajuste por bug de Excel)
  const epoch = new Date(1899, 11, 30);
  const date = new Date(epoch.getTime() + serial * 86400000);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parsea una fecha desde varios formatos posibles
 */
function parseDate(val: unknown): string {
  if (!val) return "";
  
  // Si es número (serial Excel)
  if (typeof val === "number") {
    return excelSerialToDate(val);
  }
  
  // Si es string
  const s = String(val).trim();
  
  // DD/MM/YYYY o DD-MM-YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) {
    return `${m1[3]}-${m1[2].padStart(2, "0")}-${m1[1].padStart(2, "0")}`;
  }
  
  // YYYY-MM-DD o YYYY/MM/DD
  const m2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m2) {
    return `${m2[1]}-${m2[2].padStart(2, "0")}-${m2[3].padStart(2, "0")}`;
  }
  
  return "";
}

/**
 * Normaliza un monto a formato string con 2 decimales
 */
function parseMonto(val: unknown): string {
  if (!val) return "";
  
  if (typeof val === "number") {
    return val.toFixed(2);
  }
  
  let s = String(val).trim();
  
  // Remover símbolos de moneda
  s = s.replace(/[Bb][Ss]\.?\s*/g, "").replace(/\$/g, "").trim();
  
  // Formato venezolano: 7.863,76 (punto = miles, coma = decimal)
  if (s.includes(",") && s.includes(".")) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      // Venezuelan format
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US format
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(",")) {
    // Solo coma: asumir decimal
    s = s.replace(",", ".");
  }
  
  // Remover todo excepto dígitos y punto decimal
  s = s.replace(/[^0-9.]/g, "");
  
  const num = parseFloat(s);
  return isNaN(num) ? "" : num.toFixed(2);
}

/**
 * Normaliza código de banco a 4 dígitos
 */
function normalizeBanco(val: unknown): string {
  if (!val) return "";
  const s = String(val).trim().replace(/\D/g, "");
  return s.padStart(4, "0").slice(0, 4);
}

/**
 * Normaliza número de celular venezolano
 */
function normalizeCelular(val: unknown): string {
  if (!val) return "";
  let s = String(val).trim().replace(/\D/g, "");
  
  // Remover prefijo 58 si existe
  if (s.startsWith("58")) {
    s = s.slice(2);
  }
  
  // Si no empieza con 0, agregarlo
  if (!s.startsWith("0")) {
    s = "0" + s;
  }
  
  // Debe ser 04XXXXXXXXX (11 dígitos)
  if (s.length === 10 && s.startsWith("4")) {
    s = "0" + s;
  }
  
  return s.slice(0, 11);
}

/**
 * Parsea un archivo Excel de Cashea y extrae los pagos
 */
export async function parseCasheaExcel(buffer: Buffer): Promise<ParseResult> {
  const resultado: ParseResult = {
    pagos: [],
    errores: [],
    total: 0,
    validos: 0,
    invalidos: 0,
  };
  
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    
    // Tomar la primera hoja
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      resultado.errores.push("El archivo no contiene hojas de cálculo");
      return resultado;
    }
    
    // Iterar desde la fila 2 (asumiendo fila 1 es encabezado)
    worksheet.eachRow((row, rowNumber) => {
      // Saltar encabezado
      if (rowNumber === 1) return;
      
      resultado.total++;
      
      try {
        const fecha = parseDate(row.getCell(1).value);
        const referencia = String(row.getCell(2).value || "").trim();
        const monto = parseMonto(row.getCell(3).value);
        const bancoEmisor = normalizeBanco(row.getCell(4).value);
        const celular = normalizeCelular(row.getCell(5).value);
        const rifOCliente = String(row.getCell(6).value || "").trim();
        
        // Validaciones
        const erroresRow: string[] = [];
        
        if (!fecha) erroresRow.push("fecha inválida");
        if (!referencia) erroresRow.push("referencia vacía");
        if (!monto || parseFloat(monto) <= 0) erroresRow.push("monto inválido");
        if (!bancoEmisor || bancoEmisor.length !== 4) erroresRow.push("banco emisor inválido");
        if (!celular || celular.length !== 11) erroresRow.push("celular inválido");
        
        if (erroresRow.length > 0) {
          resultado.errores.push(`Fila ${rowNumber}: ${erroresRow.join(", ")}`);
          resultado.invalidos++;
          return;
        }
        
        // Crear el pago
        resultado.pagos.push({
          fechaPago: fecha,
          referencia,
          monto,
          bancoEmisor,
          celular,
          rif: rifOCliente,
          cliente: rifOCliente,
        });
        
        resultado.validos++;
      } catch (err: any) {
        resultado.errores.push(`Fila ${rowNumber}: ${err.message}`);
        resultado.invalidos++;
      }
    });
    
  } catch (err: any) {
    resultado.errores.push(`Error al leer el archivo: ${err.message}`);
  }
  
  return resultado;
}
