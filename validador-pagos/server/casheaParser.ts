/**
 * Parser de archivos Excel de Cashea para importación masiva de pagos.
 * 
 * Formato del archivo marketplace-orders.xlsx de Cashea:
 * - Columna 0: Cédula (RIF del cliente)
 * - Columna 1: Teléfono (celular del cliente)
 * - Columna 2: Email
 * - Columna 6: Fecha (ISO 8601)
 * - Columna 10: # Orden
 * - Columna 15: # Referencia (referencia bancaria - único)
 * - Columna 16: Monto en Bs
 * 
 * Características:
 * - Todos los pagos son PagoMovil
 * - Banco receptor: 0191 (BNC)
 * - Banco emisor: 0191 (BNC - se asume que viene del mismo banco)
 * - Vendedor: "Cashea" (fijo)
 */

import ExcelJS from "exceljs";

export interface PagoCashea {
  fechaPago: string;      // YYYY-MM-DD
  referencia: string;     // # Referencia (columna 15)
  monto: string;          // Monto en Bs (columna 16)
  bancoEmisor: string;    // código de 4 dígitos (asumido BNC 0191)
  celular: string;        // Teléfono (columna 1)
  rif: string;            // Cédula (columna 0)
  cliente: string;        // Email (columna 2)
  ordenId: string;        // # Orden (columna 10) - opcional
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
 * Parsea un archivo Excel de Cashea (marketplace-orders.xlsx) y extrae los pagos
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
    
    // Iterar desde la fila 2 (fila 1 es encabezado)
    worksheet.eachRow((row, rowNumber) => {
      // Saltar encabezado
      if (rowNumber === 1) return;
      
      resultado.total++;
      
      try {
        // Extraer datos según el formato real de Cashea
        const cedula = String(row.getCell(1).value || "").trim();  // Columna 0 (Cédula)
        const telefono = String(row.getCell(2).value || "").trim(); // Columna 1 (Teléfono)
        const email = String(row.getCell(3).value || "").trim();    // Columna 2 (Email)
        const fechaRaw = row.getCell(7).value;                      // Columna 6 (Fecha)
        const ordenId = String(row.getCell(11).value || "").trim(); // Columna 10 (# Orden)
        const referencia = String(row.getCell(16).value || "").trim(); // Columna 15 (# Referencia)
        const montoRaw = row.getCell(17).value;                     // Columna 16 (Monto en Bs)
        
        // Parsear fecha (viene en formato ISO 8601)
        let fecha = "";
        if (fechaRaw) {
          if (fechaRaw instanceof Date) {
            fecha = fechaRaw.toISOString().split("T")[0];
          } else if (typeof fechaRaw === "string") {
            // Si es string ISO, extraer la fecha
            const match = fechaRaw.match(/^(\d{4}-\d{2}-\d{2})/);
            if (match) fecha = match[1];
          }
        }
        
        // Normalizar celular
        const celular = normalizeCelular(telefono);
        
        // Parsear monto
        const monto = parseMonto(montoRaw);
        
        // Validaciones
        const erroresRow: string[] = [];
        
        if (!fecha) erroresRow.push("fecha inválida");
        if (!referencia) erroresRow.push("referencia vacía");
        if (!monto || parseFloat(monto) <= 0) erroresRow.push("monto inválido");
        if (!celular || celular.length < 10) erroresRow.push("celular inválido");
        if (!cedula) erroresRow.push("cédula vacía");
        
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
          bancoEmisor: "0191", // BNC (banco fijo para Cashea)
          celular,
          rif: cedula,
          cliente: email || cedula,
          ordenId,
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
