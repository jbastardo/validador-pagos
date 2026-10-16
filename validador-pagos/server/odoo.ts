// server/odoo.ts — Proxy hacia Odoo via JSON-RPC (sin dependencias extra)
const ODOO_URL  = process.env.ODOO_URL  || "https://www.onprotec.shop";
const ODOO_DB   = process.env.ODOO_DB   || "binaural-dev-onprotec-16-release-8815487";
const ODOO_USER = process.env.ODOO_USERNAME || "";
const ODOO_KEY  = process.env.ODOO_API_KEY  || "";
console.log("[odoo] config:", { ODOO_URL, ODOO_DB, ODOO_USER: ODOO_USER ? "SET" : "EMPTY", ODOO_KEY: ODOO_KEY ? "SET" : "EMPTY" });

let uidCache: number | null = null;

async function authenticate(): Promise<number> {
  if (uidCache) return uidCache;
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", method: "call", id: 1,
      params: { service: "common", method: "authenticate", args: [ODOO_DB, ODOO_USER, ODOO_KEY, {}] },
    }),
  });
  const json = await res.json();
  if (!json.result) throw new Error("Odoo authentication failed");
  uidCache = json.result as number;
  return uidCache;
}

async function searchRead(model: string, domain: any[], fields: string[], limit = 20, order?: string): Promise<any[]> {
  const uid = await authenticate();
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", method: "call", id: 2,
      params: {
        service: "object", method: "execute_kw",
        args: [ODOO_DB, uid, ODOO_KEY, model, "search_read", [domain], { fields, limit, order: order || "id asc", context: { lang: "es_VE" } }],
      },
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.data?.message || "search_read failed");
  return json.result || [];
}

async function create(model: string, values: Record<string, any>): Promise<number> {
  const uid = await authenticate();
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", method: "call", id: 3,
      params: {
        service: "object", method: "execute_kw",
        args: [ODOO_DB, uid, ODOO_KEY, model, "create", [values]],
      },
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.data?.message || "create failed");
  return json.result as number;
}

export async function searchClientes(q: string) {
  if (!ODOO_USER || !ODOO_KEY) return [];
  // Busca por nombre, RIF (vat), teléfono fijo (phone), móvil (mobile) y correo
  const domain: any[] = [
    "|", "|", "|", "|",
    ["name",   "ilike", q],
    ["vat",    "ilike", q],
    ["phone",  "ilike", q],
    ["mobile", "ilike", q],
    ["email",  "ilike", q],
  ];
  const results = await searchRead("res.partner", domain, ["id", "name", "vat", "phone", "mobile", "email"], 80);
  return results.map((r: any) => ({
    id:     r.id,
    name:   r.name   || "",
    vat:    r.vat    || "",
    phone:  r.phone  || "",
    mobile: r.mobile || "",
    email:  r.email  || "",
  }));
}

export async function createCliente(data: {
  name: string; vat?: string; phone?: string; mobile?: string; email?: string;
}) {
  if (!ODOO_USER || !ODOO_KEY) throw new Error("Odoo credentials not configured");
  const values: Record<string, any> = {
    name: data.name,
    customer_rank: 1,
  };
  if (data.vat)    values.vat    = data.vat;
  if (data.phone)  values.phone  = data.phone;
  if (data.mobile) values.mobile = data.mobile;
  if (data.email)  values.email  = data.email;
  const id = await create("res.partner", values);
  // Devolver el registro recién creado
  const [r] = await searchRead("res.partner", [["id", "=", id]], ["id", "name", "vat", "phone", "mobile", "email"], 1);
  return {
    id:     r.id,
    name:   r.name   || "",
    vat:    r.vat    || "",
    phone:  r.phone  || "",
    mobile: r.mobile || "",
    email:  r.email  || "",
  };
}

export async function searchProductos(q: string) {
  if (!ODOO_USER || !ODOO_KEY) return [];
  const cleanQ = q.trim();

  // 1. Buscar primero por coincidencia exacta de SKU (default_code)
  // Usamos order: "qty_available desc, name asc, id asc" para que si hay duplicados (SKUs repetidos),
  // traiga primero el que tiene stock, y si ninguno tiene, ordene alfabéticamente igual que la web.
  let exactResults = await searchRead("product.template", [
    "&", ["sale_ok", "=", true],
    ["default_code", "ilike", cleanQ]
  ], ["id", "name", "display_name", "default_code", "list_price", "qty_available", "categ_id"], 10, "qty_available desc, name asc, id asc");

  let results = exactResults;
  if (results.length === 0) {
    const domain: any[] = [
      "&", ["sale_ok", "=", true],
      "|", "|",
      ["default_code", "ilike", cleanQ],
      ["name",         "ilike", cleanQ],
      ["barcode",      "ilike", cleanQ],
    ];
    results = await searchRead("product.template", domain, ["id", "name", "display_name", "default_code", "list_price", "qty_available", "categ_id"], 50, "qty_available desc, name asc, id asc");
  }

  console.log("[odoo] searchProductos resultados:", JSON.stringify(results.slice(0, 3)));
  
  return results.map((r: any) => {
    let rawName = r.display_name || r.name || "";
    return {
      id:            r.id,
      name:          rawName,
      default_code:  r.default_code  || "",
      list_price:    r.list_price    || 0,
      qty_available: r.qty_available || 0,
      categ_id:      r.categ_id?.[1] || "",
    };
  });
}

export async function getOdooPosStats(fechaDesde?: string, fechaHasta?: string) {
  if (!ODOO_USER || !ODOO_KEY) {
    return {
      totalPagosPos: 0,
      megasoft: { cant: 0, monto: 0 },
      pabilo: {
        cant: 0,
        monto: 0,
        bs: { cant: 0, monto: 0 },
        crypto: { cant: 0, monto: 0 },
      },
    };
  }

  const desde = (fechaDesde ? fechaDesde.slice(0, 10) : new Date().toISOString().slice(0, 10)) + " 00:00:00";
  const hasta = (fechaHasta ? fechaHasta.slice(0, 10) : new Date().toISOString().slice(0, 10)) + " 23:59:59";

  const domain: any[] = [
    ["payment_date", ">=", desde],
    ["payment_date", "<=", hasta],
  ];

  const payments = await searchRead("pos.payment", domain, ["id", "amount", "payment_method_id", "payment_date"], 3000);

  let megasoftCant = 0;
  let megasoftMonto = 0;
  let pabiloCant = 0;
  let pabiloMonto = 0;
  let pabiloBsCant = 0;
  let pabiloBsMonto = 0;
  let pabiloCryptoCant = 0;
  let pabiloCryptoMonto = 0;

  for (const p of payments) {
    const name = (p.payment_method_id ? p.payment_method_id[1] : "").toLowerCase();
    const amt = Number(p.amount) || 0;
    if (name.includes("megasoft") || name.includes("banco venezuela pdv")) {
      megasoftCant++;
      megasoftMonto += amt;
    } else if (name.includes("pabilo")) {
      pabiloCant++;
      pabiloMonto += amt;
      if (name.includes("binance") || name.includes("crypto") || name.includes("usdt")) {
        pabiloCryptoCant++;
        pabiloCryptoMonto += amt;
      } else {
        pabiloBsCant++;
        pabiloBsMonto += amt;
      }
    }
  }

  return {
    totalPagosPos: payments.length,
    megasoft: { cant: megasoftCant, monto: Math.round(megasoftMonto * 100) / 100 },
    pabilo: {
      cant: pabiloCant,
      monto: Math.round(pabiloMonto * 100) / 100,
      bs: { cant: pabiloBsCant, monto: Math.round(pabiloBsMonto * 100) / 100 },
      crypto: { cant: pabiloCryptoCant, monto: Math.round(pabiloCryptoMonto * 100) / 100 },
    },
  };
}

export async function searchOdooFacturas(params: {
  rif?: string;
  fecha?: string;
  monto?: string;
  cliente?: string;
  q?: string;
}) {
  if (!ODOO_USER || !ODOO_KEY) return [];

  const dateStr = params.fecha ? params.fecha.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const qStr = (params.q || "").trim().toLowerCase();
  const cleanCli = (params.cliente || "").trim().toLowerCase();
  const montoNum = parseFloat((params.monto || "0").replace(",", "."));

  // Buscar pedidos POS del día
  const domain: any[] = [
    ["date_order", ">=", `${dateStr} 00:00:00`],
    ["date_order", "<=", `${dateStr} 23:59:59`],
  ];

  const posOrders = await searchRead(
    "pos.order",
    domain,
    ["id", "name", "pos_reference", "partner_id", "amount_total", "foreign_amount_total", "mf_invoice_number", "account_move", "date_order"],
    300,
    "id desc"
  );

  const results: any[] = [];

  for (const o of posOrders) {
    const pName = (o.partner_id ? o.partner_id[1] : "").toLowerCase();
    const mf = (o.mf_invoice_number || "").trim();
    const invName = o.account_move ? o.account_move[1] : "";
    const oBs = Number(o.foreign_amount_total) || 0;

    let score = 0;
    const reasons: string[] = [];

    // Si viene término de búsqueda manual q
    if (qStr) {
      if (mf.toLowerCase().includes(qStr)) { score += 80; reasons.push("Coincide Nro Factura Fiscal"); }
      if (invName.toLowerCase().includes(qStr)) { score += 70; reasons.push("Coincide Factura Odoo"); }
      if (pName.includes(qStr)) { score += 60; reasons.push("Coincide Cliente"); }
    } else {
      // Coincidencia automática por cliente
      if (cleanCli && pName && (pName.includes(cleanCli) || cleanCli.includes(pName.slice(0, 10)))) {
        score += 50;
        reasons.push("Cliente coincide");
      }

      // Coincidencia por monto en Bs (margen de 2 Bs por redondeo/tasa)
      if (montoNum > 0 && oBs > 0 && Math.abs(montoNum - oBs) < 2) {
        score += 40;
        reasons.push(`Monto Bs exacto (${oBs.toFixed(2)})`);
      }
    }

    if (score > 0) {
      results.push({
        id: o.id,
        orderName: o.name,
        posReference: o.pos_reference,
        mfInvoiceNumber: mf,
        invoiceName: invName,
        facturaSugerida: mf || (invName ? invName.split(" ")[0] : ""),
        partnerName: o.partner_id ? o.partner_id[1] : "Sin cliente",
        amountTotalUsd: o.amount_total,
        foreignAmountBs: oBs,
        dateOrder: o.date_order,
        score,
        reason: reasons.join(", "),
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 10);
}
