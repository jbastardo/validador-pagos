// ╔══════════════════════════════════════════════════════════════════════╗
// ║  NOTAS IMPORTANTES PARA FUTUROS CAMBIOS:                           ║
// ║                                                                     ║
// ║  1. Montos del validador están en formato VENEZOLANO (7.863,76)     ║
// ║     → Usar parseMontoVzla(), NUNCA parseFloat directo               ║
// ║  2. Referencias bancarias pueden tener prefijos (BNC: 663...)       ║
// ║     → Usar refsMatch() con sufijo, NUNCA comparación exacta         ║
// ║  3. Códigos de banco varían entre apps ("0191" vs "0191 BNC...")    ║
// ║     → Usar extractBancoCode(), comparar solo primeros 4 chars       ║
// ║  4. Parser BNC tiene columnas verificadas contra extracto real      ║
// ║     → NO cambiar índices sin verificar con archivo .xls             ║
// ╚══════════════════════════════════════════════════════════════════════╝

import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import { eq } from "drizzle-orm";
import {
  db,
  getUsuarios,
  getExtractos,
  getPagos,
  appendRows,
  appendPago,
  updatePagoEstado,
  getRows,
  clearExtractos,
  appendConciliacion,
  appendConciliaciones,
  getConciliaciones,
  appendRow,
  updateRow,
  TABS,
  extractosTable,
  pagosTable,
} from "./db";
import {
  getPagosValidador,
  getTodosPagosValidador,
  getPagosValidadorConciliados,
  marcarConciliadoEnValidador,
  autoValidarYConciliarEnValidador,
  batchMarcarConciliadoEnValidador,
  batchAutoValidarYConciliarEnValidador,
  type PagoValidador,
} from "./validadorApi";
import { parseExtractoBuffer } from "./extractoParser";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export function registerRoutes(httpServer: Server, app: Express) {
  // ─── AUTH ──────────────────────────────────────────────────────────────────
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Credenciales requeridas" });
      }
      const usuarios = await getUsuarios();
      // Filtrar eliminados y vacíos igual que el validador
      const activos = usuarios.filter(u => u.id !== "" && u.activo?.trim() !== "ELIMINADO");
      const user = activos.find(
        (u) =>
          u.email && 
          u.email.toLowerCase() === email.toLowerCase() &&
          u.password === password &&
          u.activo?.trim().toLowerCase() === "true"
      );
      if (!user) {
        // Log de diagnóstico — muestra qué encontró sin exponer passwords
        const encontrado = activos.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
        if (!encontrado) {
          console.log(`[login] email no encontrado: "${email}"`);
          return res.status(401).json({ error: "Email no registrado" });
        }
        console.log(`[login] password no coincide para: ${email} | activo: "${encontrado.activo}"`);
        return res.status(401).json({ error: "Contraseña incorrecta" });
      }
      res.json({ username: user.email || "", rol: user.rol || "operador", nombre: user.nombre || "" });
    } catch (e: any) {
      console.error("[login] Error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── EXTRACTOS ────────────────────────────────────────────────────────────
  app.get("/api/extractos", async (req, res) => {
    try {
      const { banco, fechaDesde, fechaHasta } = req.query;
      let extractos = await getExtractos();

      // Solo ingresos
      extractos = extractos.filter((e) => e.tipo === "ingreso");

      if (banco) extractos = extractos.filter((e) => extractBancoCode(e.banco) === extractBancoCode(String(banco)));
      if (fechaDesde) extractos = extractos.filter((e) => e.fecha >= String(fechaDesde));
      if (fechaHasta) extractos = extractos.filter((e) => e.fecha <= String(fechaHasta));

      res.json(extractos);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/extractos/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No se recibió archivo" });

      const banco = req.body.banco || "";
      if (!banco) return res.status(400).json({ error: "Banco requerido" });
      const subidoPor = req.body.subidoPor || req.body.cargadoPor || "";

      console.log(`[extractos/upload] Archivo: ${req.file.originalname} | Banco: ${banco} | Subido por: ${subidoPor}`);

      // ── Paso 1: Parsear el archivo ──
      let items;
      try {
        items = parseExtractoBuffer(req.file.buffer, banco, req.file.originalname);
      } catch (parseErr: any) {
        console.error("[extractos/upload] Error al parsear archivo:", parseErr.message);
        return res.status(422).json({ error: `Error al parsear el archivo: ${parseErr.message}` });
      }
      console.log(`[extractos/upload] Parseados: ${items.length} registros totales`);

      // Filtrar solo ingresos para guardar
      const ingresos = items.filter((i) => i.tipo === "ingreso");
      console.log(`[extractos/upload] Ingresos: ${ingresos.length} (omitidos: ${items.length - ingresos.length} débitos/comisiones)`);
      const ahora = new Date().toISOString();

      // ── Paso 2: Verificar duplicados (banco + referencia + monto + fecha ya existentes) ──
      const existentes = await getExtractos();
      const normRef2 = (r: string) => String(r).trim().replace(/\s+/g,"").padStart(10,"0").slice(-10);
      const existSet = new Set(existentes.map((e) => `${extractBancoCode(e.banco)}|${normRef2(e.referencia)}|${Number(e.monto).toFixed(2)}|${e.fecha}`));

      // ── Paso 3: Obtener extractos ya usados en conciliaciones ──
      const conciliaciones = await getConciliaciones();
      const extractosYaConciliados = new Set(
        conciliaciones
          .filter((c) => c.estado === "Conciliado" && c.extractoId)
          .map((c) => c.extractoId)
      );
      console.log(`[extractos/upload] Extractos existentes en DB: ${existentes.length} | Ya conciliados: ${extractosYaConciliados.size}`);

      let guardados = 0;
      let duplicados = 0;

      // ── Paso 4: Filtrar duplicados y preparar filas nuevas ──
      // Usar timestamp base + índice para garantizar IDs únicos incluso en lotes grandes
      const tsBase = Date.now();
      const filasNuevas: (string | number | null)[][] = [];
      for (const item of ingresos) {
        const key = `${extractBancoCode(item.banco)}|${normRef2(item.referencia)}|${Number(item.monto).toFixed(2)}|${item.fecha}`;
        if (existSet.has(key)) {
          duplicados++;
          continue;
        }
        // ID único: timestamp base + índice secuencial para evitar colisiones en lotes
        const id = `E${tsBase}_${guardados}`;
        filasNuevas.push([
          id,
          item.fecha,
          item.banco,
          item.referencia,
          item.monto,
          item.descripcion,
          item.tipo,
          ahora,                  // [7] creadoEn
          req.file!.originalname, // [8] archivoOrigen
          subidoPor,              // [9] subidoPor
          ahora,                  // [10] subidoEn
        ]);
        existSet.add(key);
        guardados++;
      }
      console.log(`[extractos/upload] Nuevos a guardar: ${guardados} | Duplicados omitidos: ${duplicados}`);

      // ── Paso 5: Insertar en base de datos ──
      if (filasNuevas.length > 0) {
        await appendRows(TABS.EXTRACTOS, filasNuevas);
        console.log(`[extractos/upload] Insertados ${filasNuevas.length} extractos en DB`);
      }

      // ── Paso 6: Auto-validación — buscar pagos pendientes que coincidan con los nuevos extractos ──
      let autoValidados = 0;
      if (filasNuevas.length > 0) {
        try {
          autoValidados = await autoValidarConNuevosExtractos(filasNuevas, subidoPor);
          console.log(`[extractos/upload] Auto-validados: ${autoValidados}`);
        } catch (err: any) {
          console.error("[extractos/upload] Error en auto-validación:", err.message);
        }
      }

      res.json({
        total: items.length,
        ingresos: ingresos.length,
        guardados,
        duplicados,
        omitidos: items.length - ingresos.length, // débitos y comisiones
        autoValidados,
      });
    } catch (e: any) {
      console.error("[extractos/upload] Error inesperado:", e);
      res.status(500).json({ error: e.message });
    }
  });


  // GET /api/extractos/buscar — busca extractos por fecha, banco, monto (con tolerancia) y/o referencia
  app.get("/api/extractos/buscar", async (req, res) => {
    try {
      const { fecha, banco, monto, tolerancia, referencia } = req.query as Record<string, string>;

      let extractos = await getExtractos();
      // Solo ingresos
      extractos = extractos.filter((e) => e.tipo === "ingreso");

      const results: typeof extractos = [];
      // WARNING: montos del frontend pueden llegar en formato venezolano ("129.380,01")
      // Usar parseMontoVzla, NUNCA parseFloat directo.
      const montoNum = monto ? parseMontoVzla(monto) : null;
      const tol = tolerancia ? parseFloat(tolerancia) : 5;

      // Paso 1: buscar por fecha + banco + monto (con tolerancia)
      if (fecha || banco || montoNum != null) {
        for (const e of extractos) {
          let match = true;
          if (fecha && e.fecha !== fecha) match = false;
          if (banco && extractBancoCode(e.banco) !== extractBancoCode(banco)) match = false;
          if (montoNum != null && Math.abs(e.monto - montoNum) > tol) match = false;
          if (match) results.push(e);
        }
      }

      // Paso 2: si no hay resultados y hay referencia, buscar por referencia
      if (results.length === 0 && referencia) {
        const refNorm = String(referencia).trim().replace(/\s+/g, "").replace(/^0+/, "");
        for (const e of extractos) {
          const refExt = String(e.referencia).trim().replace(/\s+/g, "").replace(/^0+/, "");
          if (refExt.includes(refNorm) || refNorm.includes(refExt)) {
            results.push(e);
          }
        }
      }

      // Si se proporcionó referencia junto con otros filtros y hay resultados, no hacer fallback
      // Pero si se pide solo referencia, ya se cubrió arriba

      res.json({ ok: true, extractos: results.slice(0, 50) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/extractos/limpiar — borra todos los extractos cargados (excepto el encabezado)
  app.delete("/api/extractos/limpiar", async (req, res) => {
    try {
      const borrados = await clearExtractos();
      res.json({ ok: true, borrados });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── PAGOS ────────────────────────────────────────────────────────────────
  app.get("/api/pagos", async (req, res) => {
    try {
      const { estado, banco, fechaDesde, fechaHasta } = req.query;
      let pagos = await getPagos();

      if (estado) pagos = pagos.filter((p) => p.estado === String(estado));
      if (banco) pagos = pagos.filter((p) => extractBancoCode(p.banco) === extractBancoCode(String(banco)));
      if (fechaDesde) pagos = pagos.filter((p) => p.fecha >= String(fechaDesde));
      if (fechaHasta) pagos = pagos.filter((p) => p.fecha <= String(fechaHasta));

      res.json(pagos);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/extractos/deduplicar — elimina registros duplicados de extractos ya cargados
  app.post("/api/extractos/deduplicar", async (req, res) => {
    try {
      const rows = await getRows(TABS.EXTRACTOS);
      const seen = new Set<string>();
      const filasUnicas: any[][] = [];
      let duplicados = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        // Columnas: 0=id, 1=fecha, 2=banco, 3=referencia, 4=monto, 5=descripcion, 6=tipo
        const bancoCode = extractBancoCode(String(row[2]));
        const ref = String(row[3]).trim().replace(/\s+/g, "").padStart(10, "0").slice(-10);
        const monto = Number(row[4]).toFixed(2);
        const fecha = String(row[1]);
        const key = `${bancoCode}|${ref}|${monto}|${fecha}`;
        if (seen.has(key)) {
          duplicados++;
          continue;
        }
        seen.add(key);
        filasUnicas.push(row);
      }

      if (duplicados === 0) {
        return res.json({ ok: true, duplicados: 0, registrosFinales: filasUnicas.length, mensaje: "No hay duplicados" });
      }

      // Limpiar y reescribir solo las filas únicas
      await clearExtractos();
      if (filasUnicas.length > 0) {
        await appendRows(TABS.EXTRACTOS, filasUnicas);
      }

      console.log(`[deduplicar] Eliminados ${duplicados} duplicados. Quedan ${filasUnicas.length} registros únicos.`);
      res.json({ ok: true, duplicados, registrosFinales: filasUnicas.length });
    } catch (e: any) {
      console.error("[deduplicar] Error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/pagos", async (req, res) => {
    try {
      const { fecha, banco, referencia, monto, cliente, rif, factura, registradoPor, observaciones } = req.body;
      if (!fecha || !banco || !referencia || !monto) {
        return res.status(400).json({ error: "Campos requeridos: fecha, banco, referencia, monto" });
      }

      // Normalizar referencia
      const refNorm = String(referencia).trim().replace(/\s+/g, "").padStart(10, "0").slice(-10);

      const id = await appendPago({
        fecha,
        banco,
        referencia: refNorm,
        monto: parseFloat(monto),
        cliente: cliente || "",
        rif: rif || "",
        factura: factura || "",
        estado: "Pendiente",
        registradoPor: registradoPor || "",
        observaciones: observaciones || "",
        conciliadoCon: "",
        creadoEn: new Date().toISOString(),
      });

      res.json({ id });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── BUSCAR MATCH en EXTRACTOS ────────────────────────────────────────────
  app.post("/api/pagos/buscar-match", async (req, res) => {
    try {
      const { banco, referencia, monto, fecha } = req.body;
      if (!banco || !referencia) {
        return res.status(400).json({ error: "banco y referencia requeridos" });
      }

      const refNorm = String(referencia).trim().replace(/\s+/g, "").padStart(10, "0").slice(-10);
      const montoNum = parseFloat(monto) || 0;

      const extractos = await getExtractos();
      const ingresos = extractos.filter((e) => e.tipo === "ingreso" && extractBancoCode(e.banco) === extractBancoCode(banco));

      // Buscar match exacto por referencia (con tolerancia a prefijos como 663 de BNC)
      const exacto = ingresos.find((e) => refsMatch(e.referencia, refNorm));

      // Match parcial: mismo monto ±1% o misma fecha y monto similar
      const parciales = ingresos.filter((e) => {
        if (exacto && e.id === exacto.id) return false;
        const diffMonto = montoNum > 0 ? Math.abs(e.monto - montoNum) / montoNum : 1;
        const mismaFecha = fecha ? e.fecha === fecha : false;
        return diffMonto < 0.01 || (mismaFecha && diffMonto < 0.05);
      }).slice(0, 5);

      res.json({
        exacto: exacto || null,
        parciales,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── CONCILIAR PAGO ───────────────────────────────────────────────────────
  app.post("/api/pagos/:id/conciliar", async (req, res) => {
    try {
      const { id } = req.params;
      const { extractoId, estado, observaciones } = req.body;
      // "Conciliado" o "NoConciliado"

      await updatePagoEstado(id, estado || "Conciliado", extractoId || "", observaciones || "");
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });


  // ─── IMPORTAR PAGOS VALIDADOR ─────────────────────────────────────────────
  // Helpers de normalización
  function normRef(r: string): string {
    return String(r).trim().replace(/\s+/g, "").replace(/^0+/, ""); // sin leading zeros para comparar por sufijo
  }

  // ╔══════════════════════════════════════════════════════════════════╗
  // ║ ⚠️  FUNCIÓN CRÍTICA — NO MODIFICAR                             ║
  // ║                                                                 ║
  // ║  Los bancos venezolanos anteponen prefijos a las referencias:   ║
  // ║    • BNC antepone "663": pago ref 758319 → extracto 663758319  ║
  // ║    • Otros bancos pueden tener prefijos similares               ║
  // ║                                                                 ║
  // ║  Por eso se compara por SUFIJO (endsWith), NO por igualdad.    ║
  // ║  NO cambiar a comparación exacta (===).                         ║
  // ╚══════════════════════════════════════════════════════════════════╝
  /**
   * Compara dos referencias bancarias con tolerancia a prefijos (ej. BNC antepone 663).
   * Quita leading zeros de ambas y luego verifica si una es sufijo de la otra.
   */
  function refsMatch(a: string, b: string): boolean {
    const na = normRef(a);
    const nb = normRef(b);
    if (!na || !nb) return false;
    return na.endsWith(nb) || nb.endsWith(na);
  }
  function toISO(d: string): string {
    // Acepta DD/MM/YYYY o YYYY-MM-DD
    if (!d) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    const [dd, mm, yyyy] = d.split("/");
    if (!yyyy) return d;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  // ╔══════════════════════════════════════════════════════════════════╗
  // ║ ⚠️  FUNCIÓN CRÍTICA — NO MODIFICAR SIN ENTENDER EL CONTEXTO   ║
  // ║                                                                 ║
  // ║  Venezuela usa formato numérico LATINO:                         ║
  // ║    • Punto (.) = separador de miles                             ║
  // ║    • Coma (,) = separador decimal                               ║
  // ║    • Ejemplo: "7.863,76" = 7863.76 USD/Bs                      ║
  // ║                                                                 ║
  // ║  Esta función ha sido reescrita VARIAS VECES causando bugs      ║
  // ║  graves en producción. NO reemplazar con parseFloat simple.     ║
  // ║  NO usar .replace(/[^0-9.]/g, "") — eso DESTRUYE el formato.   ║
  // ╚══════════════════════════════════════════════════════════════════╝
  /**
   * Parsea montos en formato venezolano (puntos = miles, coma = decimal).
   * Ejemplos: "7.863,76" → 7863.76, "7863,76" → 7863.76, "17.602,32" → 17602.32
   * También maneja formato US "7,863.76" → 7863.76 y números planos.
   */
  function parseMontoVzla(val: string | number): number {
    if (typeof val === "number") return val;
    let s = String(val).trim();
    // Remove currency symbols and spaces
    s = s.replace(/[Bb][Ss]\.?\s*/g, "").replace(/\$/g, "").trim();
    if (s.includes(",") && s.includes(".")) {
      const lastComma = s.lastIndexOf(",");
      const lastDot = s.lastIndexOf(".");
      if (lastComma > lastDot) {
        // Venezuelan: 7.863,76 → dots are thousands, comma is decimal
        s = s.replace(/\./g, "").replace(",", ".");
      } else {
        // US format: 7,863.76
        s = s.replace(/,/g, "");
      }
    } else if (s.includes(",")) {
      // Only comma: 7863,76 → comma is decimal
      s = s.replace(",", ".");
    }
    s = s.replace(/[^0-9.\-]/g, "");
    return parseFloat(s) || 0;
  }

  /**
   * Evalúa el tipo de match entre un pago y un extracto.
   * Retorna:
   *   "exacto"  — ref idéntica Y monto exacto (diferencia < 0.01 Bs)
   *   "fuzzy"   — ref por sufijo O monto con centavos (diff <=5 Bs), pero no exacto
   *   null      — no hay match
   *
   * Condiciones base (siempre requeridas):
   *   · Banco receptor (4 dígitos) == banco del extracto
   *   · Fecha exacta
   *   · Monto diferencia <= 5.00 Bs
   *   · Referencia: ref del pago es sufijo de la ref del extracto (o igual)
   */
  // ╔══════════════════════════════════════════════════════════════════╗
  // ║ ⚠️  FUNCIÓN CRÍTICA — NO MODIFICAR                             ║
  // ║                                                                 ║
  // ║  Los bancos se almacenan en distintos formatos entre apps:      ║
  // ║    • Validador: "0191 BNC (Banco Nacional de Crédito)"          ║
  // ║    • Conciliador: "0191"                                        ║
  // ║    • Extracto: "0191"                                           ║
  // ║                                                                 ║
  // ║  SIEMPRE comparar por los primeros 4 caracteres (código).       ║
  // ║  NUNCA comparar nombres completos de bancos.                    ║
  // ╚══════════════════════════════════════════════════════════════════╝
  /**
   * Extrae los primeros 4 caracteres (código bancario) de cualquier string de banco.
   * Funciona tanto para "0191" como para "0191 BNC (Banco Nacional de Crédito)".
   */
  function extractBancoCode(s: string): string {
    return (s || "").trim().substring(0, 4);
  }

  // ╔══════════════════════════════════════════════════════════════════╗
  // ║ ⚠️  FUNCIÓN CRÍTICA DE CONCILIACIÓN — NO SIMPLIFICAR           ║
  // ║                                                                 ║
  // ║  Usa parseMontoVzla (NO parseFloat directo)                     ║
  // ║  Usa refsMatch con sufijo (NO comparación exacta)               ║
  // ║  Usa extractBancoCode (NO comparación de nombre)                ║
  // ║  Tolerancia monto: ±5 Bs                                       ║
  // ║                                                                 ║
  // ║  REGLA DE MATCHING (aplica a TODOS los bancos):                 ║
  // ║                                                                 ║
  // ║  • "exacto": banco + fecha + monto exacto + ref sufijo          ║
  // ║  • "fuzzy":  banco + fecha + monto ±5 Bs (SIN referencia)       ║
  // ║                                                                 ║
  // ║  La referencia NO es obligatoria para match fuzzy porque:       ║
  // ║  - Los clientes frecuentemente reportan refs incompletas        ║
  // ║  - Los bancos anteponen prefijos (BNC: 663...)                  ║
  // ║  - Es normal que el pago tenga menos dígitos que el extracto    ║
  // ║                                                                 ║
  // ║  Cada una de estas decisiones corrige un bug real de producción.║
  // ║  NO agregar referencia como requisito para match fuzzy.         ║
  // ╚══════════════════════════════════════════════════════════════════╝
  function evalMatch(
    pago: { bancoReceptor: string; fechaPago: string; monto: string; referencia: string },
    ext:  { banco: string; fecha: string; monto: number; referencia: string }
  ): "exacto" | "fuzzy" | null {
    // 1. Banco receptor — comparar por los primeros 4 caracteres (código)
    if (extractBancoCode(pago.bancoReceptor) !== extractBancoCode(ext.banco)) return null;

    // 2. Fecha
    const fechaPago = toISO(pago.fechaPago);
    if (fechaPago !== ext.fecha) return null;

    // 3. Monto ±5 Bs
    const montoPago = parseMontoVzla(pago.monto);
    const diffMonto = Math.abs(montoPago - ext.monto);
    if (diffMonto > 5.00) return null;

    // 4. Referencia — determina si es "exacto" o "fuzzy"
    const refCoincide = refsMatch(pago.referencia, ext.referencia);
    const montoExacto = diffMonto < 0.01;

    if (refCoincide && montoExacto) return "exacto";
    // ref coincide pero monto difiere (dentro de ±5 Bs), o ref no coincide
    return "fuzzy";
  }

  // GET /api/importar-pagos?banco=XXXX&fechaDesde=YYYY-MM-DD&fechaHasta=YYYY-MM-DD&estado=Verificado|Pendiente|todos
  // Devuelve pagos del validador con estado de match vs extractos cargados
  app.get("/api/importar-pagos", async (req, res) => {
    try {
      const { banco, fechaDesde, fechaHasta, estado } = req.query as Record<string, string>;

      // 1. Traer pagos de validador
      // Siempre usar getTodosPagosValidador() como base — devuelve todos los pagos
      // no conciliados independientemente de su estado. Luego filtrar por estado
      // si se especificó. Esto evita que getPagosValidador() (que solo devuelve
      // estado==="Verificado") excluya pagos con otros estados válidos.
      let pagosVal = await getTodosPagosValidador();

      // Filtrar por estado del validador si se especificó (y no es "todos")
      if (estado && estado !== "todos") {
        pagosVal = pagosVal.filter((p) => p.estado === estado);
      }

      // Filtrar por banco RECEPTOR — normalizar ambos lados con extractBancoCode
      if (banco) {
        const bancoFiltro = extractBancoCode(banco);
        pagosVal = pagosVal.filter((p) =>
          extractBancoCode(p.bancoReceptor || "") === bancoFiltro
        );
      }
      // Filtrar por fechas (fechaPago está en DD/MM/YYYY en validador)
      if (fechaDesde) {
        pagosVal = pagosVal.filter((p) => toISO(p.fechaPago) >= fechaDesde);
      }
      if (fechaHasta) {
        pagosVal = pagosVal.filter((p) => toISO(p.fechaPago) <= fechaHasta);
      }
      // Solo excluir los que ya fueron conciliados (conciliadoEn es string vacío si no conciliado)
      pagosVal = pagosVal.filter((p) => !p.conciliadoEn || p.conciliadoEn.trim() === "");

      // 2. Traer extractos ya cargados en conciliador
      // IMPORTANTE: NO filtrar extractos por fecha — evalMatch ya verifica la fecha
      // internamente. Filtrar extractos por fecha aquí causaría que pagos con fechas
      // fuera del rango seleccionado no encuentren match aunque el extracto exista.
      let extractos = await getExtractos();
      if (banco) {
        extractos = extractos.filter((e) =>
          extractBancoCode(e.banco) === extractBancoCode(banco)
        );
      }
      // Solo ingresos
      const ingresos = extractos.filter((e) => e.tipo === "ingreso");

      // Excluir extractos ya conciliados — un extracto solo puede usarse una vez
      const conciliaciones = await getConciliaciones();
      const extractosConciliados = new Set(
        conciliaciones
          .filter(c => c.estado === "Conciliado" && c.extractoId)
          .map(c => c.extractoId)
      );
      const ingresosDisponibles = ingresos.filter(e => !extractosConciliados.has(e.id));

      // 3. Evaluar match para cada pago
      // Track extractos used in this matching pass
      const extractosUsadosEnEstePase = new Set<string>();

      const resultado = pagosVal.map((p) => {
        let matchTipo: "exacto" | "fuzzy" | null = null;
        let extractoMatch: typeof ingresosDisponibles[0] | null = null;

        // Prioridad: primero buscar match exacto, luego fuzzy
        for (const e of ingresosDisponibles) {
          if (extractosUsadosEnEstePase.has(e.id)) continue; // skip already matched in this pass
          const t = evalMatch(p, e);
          if (t === "exacto") {
            matchTipo = "exacto";
            extractoMatch = e;
            break; // exacto es suficiente, no seguir buscando
          }
          if (t === "fuzzy" && !extractoMatch) {
            // Guardar el primero fuzzy encontrado pero seguir buscando por si hay exacto
            matchTipo = "fuzzy";
            extractoMatch = e;
          }
        }

        // Mark extracto as used in this pass
        if (extractoMatch) {
          extractosUsadosEnEstePase.add(extractoMatch.id);
        }

        return {
          ...p,
          match: matchTipo !== null,
          matchTipo,                          // "exacto" | "fuzzy" | null
          extractoId: extractoMatch?.id ?? null,
          // Datos del extracto sugerido para mostrar al operador
          extractoRef:    extractoMatch?.referencia ?? null,
          extractoMonto:  extractoMatch?.monto ?? null,
          extractoFecha:  extractoMatch?.fecha ?? null,
          extractoDesc:   extractoMatch?.descripcion ?? null,
          rowIndex: p._rowIndex,
        };
      });

      console.log(`[importar-pagos] estado=${estado ?? "n/a"} banco=${banco ?? "todos"} fechaDesde=${fechaDesde ?? "-"} fechaHasta=${fechaHasta ?? "-"} → pagosVal=${pagosVal.length} ingresos=${ingresosDisponibles.length} resultado=${resultado.length} exactos=${resultado.filter(r => r.matchTipo === "exacto").length} fuzzy=${resultado.filter(r => r.matchTipo === "fuzzy").length}`);
      res.json({ ok: true, pagos: resultado });
    } catch (e: any) {
      console.error("[importar-pagos] Error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/confirmar-conciliacion
  // Body: { pagos: [{ rowIndex, extractoId, pagoData? }] }
  // Marca en validador col S (conciliadoEn), actualiza estado en conciliador
  // y registra permanentemente en el tab Conciliaciones.
  app.post("/api/confirmar-conciliacion", async (req, res) => {
    try {
      const { pagos, conciliadoPor } = req.body as {
        pagos: Array<{
          rowIndex: number;
          extractoId: string;
          // datos del pago para el registro permanente
          pagoId?: string;
          referenciaPago?: string;
          referenciaExtracto?: string;
          montoPago?: number;
          montoExtracto?: number;
          banco?: string;
          cliente?: string;
          matchTipo?: string;
        }>;
        conciliadoPor?: string;
      };
      if (!pagos || !Array.isArray(pagos)) {
        return res.status(400).json({ error: "Se requiere array de pagos" });
      }

      // Validar que ningún extracto ya fue conciliado
      const conciliaciones = await getConciliaciones();
      const extractosConciliados = new Set(
        conciliaciones
          .filter(c => c.estado === "Conciliado" && c.extractoId)
          .map(c => c.extractoId)
      );
      const duplicados = pagos.filter(p => p.extractoId && extractosConciliados.has(p.extractoId));
      if (duplicados.length > 0) {
        return res.status(409).json({
          error: "Uno o más extractos ya fueron conciliados con otro pago",
          extractosDuplicados: duplicados.map(d => d.extractoId),
        });
      }

      const now = new Date().toISOString();
      const nowDate = now.slice(0, 10); // YYYY-MM-DD

      // ── BATCH: marcar todos los pagos en validador (col S + col T) en una sola llamada ──
      await batchMarcarConciliadoEnValidador(
        pagos.map((item) => ({ pagoId: item.pagoId || String(item.rowIndex), conciliadoEn: now, conciliadoPor: conciliadoPor || "" }))
      );

      // ── BATCH: registrar todas las conciliaciones en una sola llamada ──
      await appendConciliaciones(
        pagos.map((item) => ({
          fecha: nowDate,
          pagoId: item.pagoId || String(item.rowIndex),
          extractoId: item.extractoId || "",
          referenciaPago: item.referenciaPago || "",
          referenciaExtracto: item.referenciaExtracto || "",
          montoPago: item.montoPago || 0,
          montoExtracto: item.montoExtracto || 0,
          banco: item.banco || "",
          cliente: item.cliente || "",
          conciliadoPor: conciliadoPor || "",
          conciliadoEn: now,
          tipo: item.matchTipo === "exacto" ? "automatico" : item.matchTipo === "fuzzy" ? "sugerido" : "manual",
          estado: "Conciliado",
          observaciones: "",
        }))
      );

      console.log(`[confirmar-conciliacion] ${nowDate} — ${pagos.length} pago(s) conciliados en batch (2 API calls)`);
      res.json({ ok: true, conciliados: pagos.length });
    } catch (e: any) {
      console.error("[confirmar-conciliacion] Error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/conciliar-manual
  app.post("/api/conciliar-manual", async (req, res) => {
    try {
      const {
        rowIndex,
        accion,
        extractoId,
        referenciaExtracto,
        montoExtracto,
        observaciones,
        pagoId,
        referenciaPago,
        montoPago,
        banco,
        cliente,
        conciliadoPor,
      } = req.body;

      if (!rowIndex || !accion) {
        return res.status(400).json({ error: "rowIndex y accion son requeridos" });
      }
      if (accion !== "conciliar" && accion !== "rechazar") {
        return res.status(400).json({ error: "accion debe ser 'conciliar' o 'rechazar'" });
      }
      if (accion === "conciliar" && !extractoId) {
        return res.status(400).json({ error: "extractoId es requerido para conciliar" });
      }

      if (accion === "conciliar") {
        // Validar que el extracto no fue conciliado previamente
        const conciliaciones = await getConciliaciones();
        const yaUsado = conciliaciones.some(
          c => c.estado === "Conciliado" && c.extractoId === extractoId
        );
        if (yaUsado) {
          return res.status(409).json({ error: "Este extracto ya fue conciliado con otro pago" });
        }
      }

      const now = new Date().toISOString();
      const nowDate = now.slice(0, 10);
      const estado = accion === "conciliar" ? "Conciliado" : "Rechazado";

      if (accion === "conciliar") {
        await marcarConciliadoEnValidador(pagoId || String(rowIndex), now, conciliadoPor || "");
      }

      // Update pago estado using pagoId (ID-based lookup in PostgreSQL)
      if (pagoId) {
        await updatePagoEstado(
          pagoId,
          estado === "Rechazado" ? "NoConciliado" : estado,
          extractoId || "",
          observaciones || ""
        );
      }

      await appendConciliacion({
        fecha: nowDate,
        pagoId: pagoId || String(rowIndex),
        extractoId: extractoId || "",
        referenciaPago: referenciaPago || "",
        referenciaExtracto: referenciaExtracto || "",
        montoPago: montoPago || 0,
        montoExtracto: montoExtracto || 0,
        banco: banco || "",
        cliente: cliente || "",
        conciliadoPor: conciliadoPor || "",
        conciliadoEn: now,
        tipo: "manual",
        estado,
        observaciones: observaciones || "",
      });

      res.json({ ok: true, estado });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/conciliaciones — historial de operaciones conciliadas
  app.get("/api/conciliaciones", async (req, res) => {
    try {
      const { fechaDesde, fechaHasta, tipo, estado } = req.query as Record<string, string>;
      let rows = await getConciliaciones();
      if (fechaDesde) rows = rows.filter((r) => r.fecha >= fechaDesde);
      if (fechaHasta) rows = rows.filter((r) => r.fecha <= fechaHasta);
      if (tipo) rows = rows.filter((r) => r.tipo === tipo);
      if (estado) rows = rows.filter((r) => r.estado === estado);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── HISTORIAL COMPLETO ──────────────────────────────────────────────────
  app.get("/api/historial-completo", async (req, res) => {
    try {
      const { fechaDesde, fechaHasta, tipo, estado, banco } = req.query as Record<string, string>;

      const rowsConciliaciones = await getConciliaciones();
      // getPagosValidadorConciliados trae todos los pagos que tienen conciliadoEn marcado,
      // independientemente de su estado (Verificado, Pendiente, etc.)
      const pagosValidador = await getPagosValidadorConciliados();
      const pagosYaConciliados = pagosValidador.filter(
        (p) => p.conciliadoEn && p.conciliadoEn.trim() !== ""
      );

      const idsConciliados = new Set(rowsConciliaciones.map((r) => r.pagoId));

      const rowsDeValidador = pagosYaConciliados
        .filter((p) => !idsConciliados.has(p.id))
        .map((p) => ({
          id: `V${p._rowIndex}`,
          fecha: p.conciliadoEn.slice(0, 10) || toISO(p.fechaPago),
          pagoId: p.id,
          extractoId: "",
          referenciaPago: p.referencia,
          referenciaExtracto: "",
          montoPago: parseMontoVzla(p.monto),
          montoExtracto: 0,
          banco: p.bancoReceptor || p.bancoEmisor || "",
          cliente: p.cliente || "",
          conciliadoPor: "",
          conciliadoEn: p.conciliadoEn,
          tipo: "automatico" as string,
          estado: "Conciliado" as string,
          observaciones: "",
        }));

      let todos = [...rowsConciliaciones, ...rowsDeValidador];
      todos.sort((a, b) => (b.fecha > a.fecha ? 1 : -1));

      if (fechaDesde) todos = todos.filter((r) => r.fecha >= fechaDesde);
      if (fechaHasta) todos = todos.filter((r) => r.fecha <= fechaHasta);
      if (tipo)       todos = todos.filter((r) => r.tipo === tipo);
      if (estado)     todos = todos.filter((r) => r.estado === estado);
      if (banco) {
        todos = todos.filter((r) => extractBancoCode(r.banco) === extractBancoCode(banco));
      }

      res.json(todos);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── USUARIOS CRUD ───────────────────────────────────────────────────────
  app.get("/api/usuarios", async (req, res) => {
    try {
      const usuarios = await getUsuarios();
      res.json(
        usuarios
          .filter((u) => u.id && u.activo !== "ELIMINADO")
          .map((u) => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, activo: u.activo }))
      );
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/usuarios", async (req, res) => {
    try {
      const { nombre, email, password, rol } = req.body;
      if (!nombre || !email || !password || !rol) {
        return res.status(400).json({ error: "nombre, email, password y rol son requeridos" });
      }
      const existentes = await getUsuarios();
      if (existentes.some((u) => u.email.toLowerCase() === email.toLowerCase() && u.activo !== "ELIMINADO")) {
        return res.status(409).json({ error: "Ya existe un usuario con ese email" });
      }
      const id = `U${Date.now()}`;
      await appendRow(TABS.USUARIOS, [id, nombre, email, password, rol, "true"]);
      res.json({ ok: true, id });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/usuarios/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { nombre, email, password, rol, activo } = req.body;
      const rows = await getRows(TABS.USUARIOS);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === id);
      if (idx === -1) return res.status(404).json({ error: "Usuario no encontrado" });
      const row = rows[idx];
      const updated = [
        id,
        nombre   ?? row[1],
        email    ?? row[2],
        (password && password.trim() !== "") ? password : row[3],
        rol      ?? row[4],
        activo   ?? row[5],
      ];
      await updateRow(TABS.USUARIOS, idx + 1, updated);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/usuarios/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const rows = await getRows(TABS.USUARIOS);
      const idx = rows.findIndex((r, i) => i > 0 && r[0] === id);
      if (idx === -1) return res.status(404).json({ error: "Usuario no encontrado" });
      const row = [...rows[idx]];
      row[5] = "ELIMINADO";
      await updateRow(TABS.USUARIOS, idx + 1, row);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── AUTO-CONCILIACIÓN ──────────────────────────────────────────────────
  // POST /api/auto-conciliar
  // Ejecuta la conciliación automática (solo exactos) sin intervención humana.
  // Los fuzzy se contabilizan como sugeridos pero NO se concilian solas (requieren confirmación).
  app.post("/api/auto-conciliar", async (req, res) => {
    try {
      const pagosVal = await getPagosValidador();
      const pendientes = pagosVal.filter((p) => !p.conciliadoEn || p.conciliadoEn.trim() === "");

      if (pendientes.length === 0) {
        return res.json({ ok: true, automaticos: 0, sugeridos: 0, sinMatch: 0, errores: [] });
      }

      const extractos = await getExtractos();
      const ingresos = extractos.filter((e) => e.tipo === "ingreso");

      const now = new Date().toISOString();
      const nowDate = now.slice(0, 10);
      let sugeridos = 0;
      let sinMatch = 0;

      // Acumular las operaciones para hacer batch al final
      const validadorUpdates: Array<{ pagoId: string; conciliadoEn: string; conciliadoPor: string }> = [];
      const conciliacionesBatch: Array<{
        fecha: string; pagoId: string; extractoId: string;
        referenciaPago: string; referenciaExtracto: string;
        montoPago: number; montoExtracto: number;
        banco: string; cliente: string; conciliadoPor: string;
        conciliadoEn: string; tipo: string; estado: string; observaciones: string;
      }> = [];

      for (const pago of pendientes) {
        let matchTipo: "exacto" | "fuzzy" | null = null;
        let extractoMatch: typeof ingresos[0] | null = null;

        for (const e of ingresos) {
          const t = evalMatch(pago, e);
          if (t === "exacto") {
            matchTipo = "exacto";
            extractoMatch = e;
            break;
          }
          if (t === "fuzzy" && !extractoMatch) {
            matchTipo = "fuzzy";
            extractoMatch = e;
          }
        }

        if (!matchTipo || !extractoMatch) {
          sinMatch++;
          continue;
        }

        // Solo conciliar automáticamente los exactos
        // Los fuzzy requieren confirmación humana
        if (matchTipo === "fuzzy") {
          sugeridos++;
          continue;
        }

        validadorUpdates.push({ pagoId: pago.id, conciliadoEn: now, conciliadoPor: "sistema" });
        conciliacionesBatch.push({
          fecha: nowDate,
          pagoId: pago.id,
          extractoId: extractoMatch.id,
          referenciaPago: pago.referencia,
          referenciaExtracto: extractoMatch.referencia,
          montoPago: parseMontoVzla(pago.monto),
          montoExtracto: extractoMatch.monto,
          banco: pago.bancoReceptor || pago.bancoEmisor || "",
          cliente: pago.cliente || "",
          conciliadoPor: "sistema",
          conciliadoEn: now,
          tipo: "automatico",
          estado: "Conciliado",
          observaciones: "Autoconciliado automáticamente",
        });
      }

      // ── BATCH: ejecutar todas las escrituras en 2 llamadas API ──
      const automaticos = validadorUpdates.length;
      if (automaticos > 0) {
        await batchMarcarConciliadoEnValidador(validadorUpdates);
        await appendConciliaciones(conciliacionesBatch);
      }

      console.log(`[auto-conciliar] ${nowDate} — automáticos: ${automaticos}, sugeridos: ${sugeridos}, sin match: ${sinMatch} (2 API calls)`);
      res.json({ ok: true, automaticos, sugeridos, sinMatch, errores: [] });
    } catch (e: any) {
      console.error("[auto-conciliar] Error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── QUERY HELPERS ──────────────────────────────────────────────────────
  /**
   * Obtiene los IDs de extractos de ingreso que NO están usados en conciliaciones activas.
   * Usa consulta directa a la DB (db + extractosTable) para mayor eficiencia que
   * cargar todos los extractos en memoria y filtrar en JS.
   */
  async function getExtractosNoUsados(): Promise<string[]> {
    const todosExtractos = await db
      .select({ id: extractosTable.id })
      .from(extractosTable)
      .where(eq(extractosTable.tipo, "ingreso"));

    if (todosExtractos.length === 0) return [];

    const conciliaciones = await getConciliaciones();
    const usados = new Set(
      conciliaciones
        .filter((c) => c.estado === "Conciliado" && c.extractoId)
        .map((c) => c.extractoId)
    );

    return todosExtractos
      .map((e) => e.id)
      .filter((id) => !usados.has(id));
  }

  // ─── AUTO-VALIDACIÓN al subir extracto ─────────────────────────────────
  // Cuando se suben nuevos extractos, busca pagos pendientes en el validador que
  // coincidan (exacto o fuzzy) y los auto-valida + auto-concilia automáticamente.
  // El "validador" del pago se establece como el usuario conciliador que subió el extracto.

  async function autoValidarConNuevosExtractos(
    filasNuevas: (string | number | null)[][],
    subidoPor: string
  ): Promise<number> {
    // Convertir filas nuevas a formato ExtractoRow para evalMatch
    const nuevosExtractos = filasNuevas.map((r) => ({
      id: String(r[0] || ""),
      fecha: String(r[1] || ""),
      banco: String(r[2] || ""),
      referencia: String(r[3] || ""),
      monto: parseFloat(String(r[4])) || 0,
      descripcion: String(r[5] || ""),
      tipo: String(r[6] || ""),
    }));

    // Obtener todos los pagos del validador que no están conciliados
    const pagosVal = await getTodosPagosValidador();
    if (pagosVal.length === 0) return 0;

    const now = new Date().toISOString();
    const nowDate = now.slice(0, 10);
    // Set para no usar el mismo extracto dos veces
    const extractosUsados = new Set<string>();

    // Acumular operaciones para batch
    const autoValidarEntries: Array<{ pagoId: string; validadoPor: string; fechaConciliacion: string; conciliadoPor: string }> = [];
    const marcarEntries: Array<{ pagoId: string; conciliadoEn: string; conciliadoPor: string }> = [];
    const conciliacionesBatch: Array<{
      fecha: string; pagoId: string; extractoId: string;
      referenciaPago: string; referenciaExtracto: string;
      montoPago: number; montoExtracto: number;
      banco: string; cliente: string; conciliadoPor: string;
      conciliadoEn: string; tipo: string; estado: string; observaciones: string;
    }> = [];

    for (const pago of pagosVal) {
      let extractoMatch: typeof nuevosExtractos[0] | null = null;
      let matchTipo: "exacto" | "fuzzy" | null = null;

      // Prioridad: primero buscar match exacto, luego fuzzy — igual que /api/importar-pagos
      for (const e of nuevosExtractos) {
        if (extractosUsados.has(e.id)) continue;
        const t = evalMatch(pago, e);
        if (t === "exacto") {
          extractoMatch = e;
          matchTipo = "exacto";
          break; // exacto es suficiente, no seguir buscando
        }
        if (t === "fuzzy" && !extractoMatch) {
          // Guardar el primero fuzzy encontrado pero seguir buscando por si hay exacto
          extractoMatch = e;
          matchTipo = "fuzzy";
        }
      }

      // Auto-validar con match exacto o fuzzy
      if (!extractoMatch || !matchTipo) continue;

      console.log(`[auto-validar] Pago ${pago.id} → match ${matchTipo} con extracto ${extractoMatch.id} (ref: ${pago.referencia} / ${extractoMatch.referencia}, monto: ${pago.monto} / ${extractoMatch.monto})`);

      // Si el pago no está Verificado, auto-validarlo primero
      if (pago.estado !== "Verificado") {
        autoValidarEntries.push({ pagoId: pago.id, validadoPor: subidoPor, fechaConciliacion: now, conciliadoPor: subidoPor || "sistema" });
      } else {
        // Ya está verificado, solo marcar conciliadoEn + conciliadoPor
        marcarEntries.push({ pagoId: pago.id, conciliadoEn: now, conciliadoPor: subidoPor || "sistema" });
      }

      conciliacionesBatch.push({
        fecha: nowDate,
        pagoId: pago.id,
        extractoId: extractoMatch.id,
        referenciaPago: pago.referencia,
        referenciaExtracto: extractoMatch.referencia,
        montoPago: parseMontoVzla(pago.monto),
        montoExtracto: extractoMatch.monto,
        banco: pago.bancoReceptor || pago.bancoEmisor || "",
        cliente: pago.cliente || "",
        conciliadoPor: subidoPor || "sistema",
        conciliadoEn: now,
        tipo: "automatico",
        estado: "Conciliado",
        observaciones: `Auto-validado (${matchTipo}) al subir extracto${subidoPor ? ` por ${subidoPor}` : ""}`,
      });

      extractosUsados.add(extractoMatch.id);
    }

    const autoValidados = conciliacionesBatch.length;
    if (autoValidados === 0) {
      console.log(`[auto-validar] Sin matches — ningún pago pendiente coincide con los ${nuevosExtractos.length} extracto(s) nuevos`);
      return 0;
    }

    // ── BATCH: ejecutar todas las escrituras en pocas llamadas API ──
    if (autoValidarEntries.length > 0) {
      console.log(`[auto-validar] Llamando batchAutoValidarYConciliarEnValidador para ${autoValidarEntries.length} pago(s) no verificados`);
      await batchAutoValidarYConciliarEnValidador(autoValidarEntries);
    }
    if (marcarEntries.length > 0) {
      console.log(`[auto-validar] Llamando batchMarcarConciliadoEnValidador para ${marcarEntries.length} pago(s) ya verificados`);
      await batchMarcarConciliadoEnValidador(marcarEntries);
    }
    await appendConciliaciones(conciliacionesBatch);

    // ── Actualizar estado de pagos locales (pagosTable) a "Conciliado" ──
    // Los pagos del validador y los pagos locales son registros independientes;
    // hay que actualizar ambos para que la UI refleje el estado correcto.
    const pagosPendientesLocales = (await getPagos()).filter((p) => p.estado === "Pendiente");
    if (pagosPendientesLocales.length > 0) {
      // Reutilizar el mismo set de extractos usados para evitar doble-conciliación
      const extractosUsadosLocal = new Set<string>(extractosUsados);
      let actualizadosLocal = 0;
      for (const pagoLocal of pagosPendientesLocales) {
        // Adaptar PagoRow al shape que espera evalMatch
        const pagoParaMatch = {
          bancoReceptor: pagoLocal.banco,
          fechaPago: pagoLocal.fecha,
          monto: String(pagoLocal.monto),
          referencia: pagoLocal.referencia,
        };
        let extractoMatchLocal: typeof nuevosExtractos[0] | null = null;
        let matchTipoLocal: "exacto" | "fuzzy" | null = null;
        for (const e of nuevosExtractos) {
          if (extractosUsadosLocal.has(e.id)) continue;
          const t = evalMatch(pagoParaMatch, e);
          if (t === "exacto") {
            extractoMatchLocal = e;
            matchTipoLocal = "exacto";
            break;
          }
          if (t === "fuzzy" && !extractoMatchLocal) {
            extractoMatchLocal = e;
            matchTipoLocal = "fuzzy";
          }
        }
        if (!extractoMatchLocal || !matchTipoLocal) continue;
        await updatePagoEstado(
          pagoLocal.id,
          "Conciliado",
          extractoMatchLocal.id,
          `Auto-conciliado (${matchTipoLocal}) al subir extracto${subidoPor ? ` por ${subidoPor}` : ""}`
        );
        extractosUsadosLocal.add(extractoMatchLocal.id);
        actualizadosLocal++;
      }
      if (actualizadosLocal > 0) {
        console.log(`[auto-validar] ${actualizadosLocal} pago(s) local(es) marcados como Conciliado en DB`);
      }
    }

    const exactos = conciliacionesBatch.filter(c => c.observaciones.includes("(exacto)")).length;
    const fuzzy  = conciliacionesBatch.filter(c => c.observaciones.includes("(fuzzy)")).length;
    console.log(`[auto-validar] ${nowDate} — ${autoValidados} pago(s) auto-validados al subir extracto (exactos: ${exactos}, fuzzy: ${fuzzy})`);
    return autoValidados;
  }


  // POST /api/auto-validar-pago
  // Webhook para que el validador-pagos llame cuando se registra un nuevo pago.
  // Busca si el pago coincide con algún extracto previamente subido y lo auto-valida.
  app.post("/api/auto-validar-pago", async (req, res) => {
    try {
      const { pagoId, fechaPago, bancoReceptor, referencia, monto, cliente, bancoEmisor } = req.body;
      if (!referencia || !monto) {
        return res.status(400).json({ error: "referencia y monto son requeridos" });
      }

      // Traer todos los extractos de ingreso
      const extractos = await getExtractos();
      const ingresos = extractos.filter((e) => e.tipo === "ingreso");

      // Construir el pago como lo espera evalMatch
      const pagoData = {
        bancoReceptor: bancoReceptor || "",
        fechaPago: fechaPago || "",
        monto: String(monto),
        referencia: referencia || "",
      };

      let matchTipo: "exacto" | "fuzzy" | null = null;
      let extractoMatch: typeof ingresos[0] | null = null;

      for (const e of ingresos) {
        const t = evalMatch(pagoData, e);
        if (t === "exacto") {
          matchTipo = "exacto";
          extractoMatch = e;
          break;
        }
        if (t === "fuzzy" && !extractoMatch) {
          extractoMatch = e;
          matchTipo = "fuzzy";
        }
      }

      if (!matchTipo || !extractoMatch) {
        return res.json({ ok: true, autoValidado: false, motivo: "Sin match en extractos" });
      }

      // ── Bloqueo en memoria para evitar race condition ──
      const EXTRACTOS_EN_PROCESO: Set<string> = (globalThis as any).__extractosEnProceso ||= new Set();
      if (EXTRACTOS_EN_PROCESO.has(extractoMatch.id)) {
        return res.json({ ok: true, autoValidado: false, motivo: "Extracto en proceso por otra solicitud" });
      }
      EXTRACTOS_EN_PROCESO.add(extractoMatch.id);

      try {
        // Verificar nuevamente dentro del lock que el extracto no fue conciliado
        const conciliaciones = await getConciliaciones();
        const yaUsado = conciliaciones.some(
          c => c.estado === "Conciliado" && c.extractoId === extractoMatch!.id
        );
        if (yaUsado) {
          return res.json({ ok: true, autoValidado: false, motivo: "Extracto ya conciliado con otro pago" });
        }

        // El validador del pago será el usuario conciliador que subió el extracto
        const validadoPor = extractoMatch.subidoPor || "sistema";
        const now = new Date().toISOString();
        const nowDate = now.slice(0, 10);

        // Buscar el pago en el validador
        const pagosVal = await getTodosPagosValidador();
        const pagoEnSheet = pagosVal.find((p) => {
          if (pagoId && p.id === pagoId) return true;
          const refMatch = refsMatch(p.referencia, referencia);
          const montoMatch = Math.abs(
            (parseMontoVzla(p.monto)) -
            parseMontoVzla(monto)
          ) < 0.01;
          return refMatch && montoMatch;
        });

        if (!pagoEnSheet) {
          return res.json({ ok: true, autoValidado: false, motivo: "Pago no encontrado" });
        }

        // Auto-validar y conciliar
        if (pagoEnSheet.estado !== "Verificado") {
          await autoValidarYConciliarEnValidador(pagoEnSheet.id, validadoPor, now, validadoPor);
        } else {
          await marcarConciliadoEnValidador(pagoEnSheet.id, now, validadoPor);
        }

        await appendConciliacion({
          fecha: nowDate,
          pagoId: pagoEnSheet.id,
          extractoId: extractoMatch.id,
          referenciaPago: pagoEnSheet.referencia,
          referenciaExtracto: extractoMatch.referencia,
          montoPago: parseMontoVzla(pagoEnSheet.monto),
          montoExtracto: extractoMatch.monto,
          banco: pagoEnSheet.bancoReceptor || pagoEnSheet.bancoEmisor || "",
          cliente: pagoEnSheet.cliente || cliente || "",
          conciliadoPor: validadoPor,
          conciliadoEn: now,
          tipo: "automatico",
          estado: "Conciliado",
          observaciones: `Auto-validado: extracto subido por ${validadoPor}`,
        });

        console.log(`[auto-validar-pago] Pago ${pagoEnSheet.id} auto-validado con extracto ${extractoMatch.id} (validador: ${validadoPor})`);
        res.json({
          ok: true,
          autoValidado: true,
          pagoId: pagoEnSheet.id,
          extractoId: extractoMatch.id,
          validadoPor,
        });
      } finally {
        EXTRACTOS_EN_PROCESO.delete(extractoMatch.id);
      }
    } catch (e: any) {
      console.error("[auto-validar-pago] Error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── STATS ────────────────────────────────────────────────────────────────
  app.get("/api/stats", async (req, res) => {
    try {
      const { fechaDesde, fechaHasta } = req.query;
      
      // Usar conciliaciones reales + validador en vez del tab PAGOS vacío
      let conciliaciones = await getConciliaciones();
      let extractos = await getExtractos();
      const pagosVal = await getTodosPagosValidador();

      if (fechaDesde) {
        conciliaciones = conciliaciones.filter(c => c.fecha >= String(fechaDesde));
        extractos = extractos.filter(e => e.fecha >= String(fechaDesde));
      }
      if (fechaHasta) {
        conciliaciones = conciliaciones.filter(c => c.fecha <= String(fechaHasta));
        extractos = extractos.filter(e => e.fecha <= String(fechaHasta));
      }

      const ingresos = extractos.filter(e => e.tipo === "ingreso");
      const conciliados = conciliaciones.filter(c => c.estado === "Conciliado");
      const rechazados = conciliaciones.filter(c => c.estado === "Rechazado");
      const pendientesVal = pagosVal.filter(p => !p.conciliadoEn || p.conciliadoEn.trim() === "");

      const extractosConciliadosSet = new Set(
        conciliados.filter(c => c.extractoId).map(c => c.extractoId)
      );

      res.json({
        totalPagos: pendientesVal.length + conciliados.length + rechazados.length,
        pendientes: pendientesVal.length,
        conciliados: conciliados.length,
        noConciliados: rechazados.length,
        totalExtractos: ingresos.length,
        extractosSinMatch: ingresos.filter(e => !extractosConciliadosSet.has(e.id)).length,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
