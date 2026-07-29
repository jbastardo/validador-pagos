/**
 * Cliente HTTP para comunicarse con la app validador-pagos.
 * No acceder directamente a la BD del validador - usar su API REST.
 */

const VALIDATOR_API_URL = process.env.VALIDATOR_API_URL || "https://validador.onprotec.com";
const CONCILIADOR_SECRET = process.env.CONCILIADOR_SECRET || "";

function conciliadorHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (CONCILIADOR_SECRET) h["x-conciliador-token"] = CONCILIADOR_SECRET;
  return h;
}

interface PagoValidadorAPI {
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
  cliente: string;
  megasoft: string;
  validadoEn: string;
  conciliadoEn: string;
  conciliadoPor: string;
  _rowIndex: number;
}

export interface PagoValidador {
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
  cliente: string;
  megasoft: string;
  validadoEn: string;
  conciliadoEn: string;
  conciliadoPor: string;
  _rowIndex: number;
}

function extractBancoCode(s: string): string {
  return (s || "").trim().substring(0, 4);
}

function toISO(f: string): string {
  if (!f) return "";
  const m = f.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return f.substring(0, 10);
}

export async function getPagosValidador(filtros?: {
  fechaDesde?: string;
  fechaHasta?: string;
  banco?: string;
}): Promise<PagoValidador[]> {
  const url = new URL(`${VALIDATOR_API_URL}/api/pagos`);
  
  if (filtros?.fechaDesde) url.searchParams.set("fechaDesde", filtros.fechaDesde);
  if (filtros?.fechaHasta) url.searchParams.set("fechaHasta", filtros.fechaHasta);
  if (filtros?.banco) url.searchParams.set("banco", filtros.banco);
  url.searchParams.set("estado", "Verificado");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Error fetching from validator: ${res.statusText}`);
  
  const pagos: PagoValidadorAPI[] = await res.json();
  
  return pagos
    .filter(p => {
      if (!p.id || p.estado === "ELIMINADO") return false;
      if (filtros?.banco && extractBancoCode(p.bancoReceptor) !== extractBancoCode(filtros.banco)) return false;
      
      if (filtros?.fechaDesde || filtros?.fechaHasta) {
        const iso = toISO(p.fechaPago);
        if (filtros.fechaDesde && iso < filtros.fechaDesde) return false;
        if (filtros.fechaHasta && iso > filtros.fechaHasta) return false;
      }
      
      return true;
    })
    .map(p => ({
      ...p,
      _rowIndex: parseInt(p.id) || 0,
    }));
}

export async function getTodosPagosValidador(): Promise<PagoValidador[]> {
  const res = await fetch(`${VALIDATOR_API_URL}/api/pagos?estado=Verificado,Pendiente`);
  if (!res.ok) throw new Error(`Error fetching from validator: ${res.statusText}`);
  
  const pagos: PagoValidadorAPI[] = await res.json();
  
  return pagos
    .filter(p => {
      if (!p.id || p.estado === "ELIMINADO") return false;
      if (p.conciliadoEn && p.conciliadoEn.trim() !== "") return false;
      return true;
    })
    .map(p => ({
      ...p,
      _rowIndex: parseInt(p.id) || 0,
    }));
}

export async function getPagosValidadorConciliados(): Promise<PagoValidador[]> {
  const res = await fetch(`${VALIDATOR_API_URL}/api/pagos?conciliadoEn=true`);
  if (!res.ok) throw new Error(`Error fetching from validator: ${res.statusText}`);
  
  const pagos: PagoValidadorAPI[] = await res.json();
  
  return pagos
    .filter(p => {
      if (!p.id || p.estado === "ELIMINADO") return false;
      return p.conciliadoEn && p.conciliadoEn.trim() !== "";
    })
    .map(p => ({
      ...p,
      _rowIndex: parseInt(p.id) || 0,
    }));
}

export async function marcarConciliadoEnValidador(
  pagoId: string,
  conciliadoEn: string,
  conciliadoPor: string
): Promise<void> {
  const res = await fetch(`${VALIDATOR_API_URL}/api/pagos/${pagoId}/conciliar`, {
    method: "POST",
    headers: conciliadorHeaders(),
    body: JSON.stringify({
      accion: "conciliar",
      conciliadoEn,
      conciliadoPor,
    }),
  });
  
  if (!res.ok) throw new Error(`Error updating validator: ${res.statusText}`);
}

export async function autoValidarYConciliarEnValidador(
  pagoId: string,
  validadoPor: string,
  fechaConciliacion: string,
  conciliadoPor: string
): Promise<void> {
  // Marcar como Verificado + conciliado en una sola operación
  // Usar el endpoint de actualización del validador
  const res = await fetch(`${VALIDATOR_API_URL}/api/pagos/${pagoId}`, {
    method: "PUT",
    headers: conciliadorHeaders(),
    body: JSON.stringify({
      estado: "Verificado",
      validadoPor,
      validadoEn: fechaConciliacion,
      conciliadoEn: fechaConciliacion,
      conciliadoPor,
    }),
  });
  
  if (!res.ok) {
    console.log(`[validadorApi] Error updating validator: ${res.statusText}`);
    throw new Error(`Error updating validator: ${res.statusText}`);
  }
}

export async function batchMarcarConciliadoEnValidador(
  entries: Array<{ pagoId: string; conciliadoEn: string; conciliadoPor: string }>
): Promise<void> {
  await Promise.all(
    entries.map(e => marcarConciliadoEnValidador(e.pagoId, e.conciliadoEn, e.conciliadoPor))
  );
}

export async function batchAutoValidarYConciliarEnValidador(
  entries: Array<{
    pagoId: string;
    validadoPor: string;
    fechaConciliacion: string;
    conciliadoPor: string;
  }>
): Promise<void> {
  await Promise.all(
    entries.map(e => autoValidarYConciliarEnValidador(
      e.pagoId,
      e.validadoPor,
      e.fechaConciliacion,
      e.conciliadoPor
    ))
  );
}
