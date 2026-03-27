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

async function searchRead(model: string, domain: any[], fields: string[], limit = 20): Promise<any[]> {
  const uid = await authenticate();
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", method: "call", id: 2,
      params: {
        service: "object", method: "execute_kw",
        args: [ODOO_DB, uid, ODOO_KEY, model, "search_read", [domain], { fields, limit }],
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
  const domain: any[] = [
    "&", ["sale_ok", "=", true],
    "|", "|",
    ["name",         "ilike", q],
    ["default_code", "ilike", q],
    ["barcode",      "ilike", q],
  ];
  const results = await searchRead("product.product", domain, ["id", "name", "default_code", "list_price", "qty_available"], 30);
  return results.map((r: any) => ({
    id:            r.id,
    name:          r.name          || "",
    default_code:  r.default_code  || "",
    list_price:    r.list_price    || 0,
    qty_available: r.qty_available || 0,
  }));
}
