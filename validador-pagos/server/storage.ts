import { pagos, usuarios, type Pago, type InsertPago, type Usuario, type InsertUsuario } from "@shared/schema";

export interface IStorage {
  // Pagos
  getPagos(): Promise<Pago[]>;
  getPagoById(id: number): Promise<Pago | undefined>;
  createPago(pago: InsertPago): Promise<Pago>;
  updatePagoEstado(id: number, estado: string, validadoPor: string, observaciones?: string): Promise<Pago | undefined>;
  deletePago(id: number): Promise<boolean>;
  checkDuplicado(referencia: string, monto: string, fechaPago: string, tipoPago: string): Promise<Pago | undefined>;

  // Usuarios
  getUsuarios(): Promise<Usuario[]>;
  getUsuarioById(id: number): Promise<Usuario | undefined>;
  getUsuarioByEmail(email: string): Promise<Usuario | undefined>;
  createUsuario(usuario: InsertUsuario): Promise<Usuario>;
  updateUsuario(id: number, data: Partial<InsertUsuario>): Promise<Usuario | undefined>;
}

export class MemStorage implements IStorage {
  private pagosData: Map<number, Pago> = new Map();
  private usuariosData: Map<number, Usuario> = new Map();
  private pagoIdCounter = 1;
  private usuarioIdCounter = 1;

  constructor() {
    // Crear usuarios predeterminados
    this.seedUsuarios();
    // Crear pagos de ejemplo
    this.seedPagos();
  }

  private seedUsuarios() {
    const defaultUsuarios: InsertUsuario[] = [
      { nombre: "Juan Admin", email: "juan@onprotec.com", password: "admin123", rol: "admin", activo: "true" },
      { nombre: "Contabilidad", email: "contabilidad@onprotec.com", password: "conta123", rol: "contabilidad", activo: "true" },
      { nombre: "Vendedor 1", email: "vendedor1@onprotec.com", password: "vend123", rol: "vendedor", activo: "true" },
      { nombre: "Vendedor 2", email: "vendedor2@onprotec.com", password: "vend123", rol: "vendedor", activo: "true" },
      { nombre: "Vendedor 3", email: "vendedor3@onprotec.com", password: "vend123", rol: "vendedor", activo: "true" },
      { nombre: "Vendedor 4", email: "vendedor4@onprotec.com", password: "vend123", rol: "vendedor", activo: "true" },
      { nombre: "Milagros Morales", email: "m.morales@onprotec.com", password: "vend123", rol: "vendedor", activo: "true" },
    ];
    defaultUsuarios.forEach(u => {
      const id = this.usuarioIdCounter++;
      this.usuariosData.set(id, {
        ...u,
        id,
        creadoEn: new Date(),
        rol: u.rol ?? "vendedor",
        activo: u.activo ?? "true",
        solicitudes: "false",
        telegramChatId: null,
      });
    });
  }

  private seedPagos() {
    const samplePagos: InsertPago[] = [
      {
        fechaPago: "11/03/2026",
        bancoEmisor: "0102 Banco de Venezuela",
        monto: "555.00",
        celular: "0424-2318804",
        bancoReceptor: "0102 Banco de Venezuela",
        referencia: "285689",
        rif: "J406854492",
        factura: "",
        tipoPago: "PagoMovil",
        estado: "Pendiente",
        validadoPor: "",
        vendedor: "vendedor1@onprotec.com",
        observaciones: "",
      },
      {
        fechaPago: "10/03/2026",
        bancoEmisor: "0105 Banco Mercantil",
        monto: "5000.00",
        celular: "0414-8956325",
        bancoReceptor: "0102 Banco de Venezuela",
        referencia: "",
        rif: "",
        factura: "",
        tipoPago: "PagoMovil",
        estado: "Verificado",
        validadoPor: "juan@onprotec.com",
        vendedor: "m.morales@onprotec.com",
        observaciones: "",
      },
      {
        fechaPago: "10/03/2026",
        bancoEmisor: "0105 Banco Mercantil",
        monto: "98500.00",
        celular: "",
        bancoReceptor: "0134 Banesco",
        referencia: "154839",
        rif: "",
        factura: "",
        tipoPago: "Transferencia",
        estado: "Rechazado",
        validadoPor: "juan@onprotec.com",
        vendedor: "m.morales@onprotec.com",
        observaciones: "Referencia no coincide",
      },
      {
        fechaPago: "06/03/2026",
        bancoEmisor: "0151 Banco Fondo Comun",
        monto: "9500.00",
        celular: "",
        bancoReceptor: "0102 Banco de Venezuela",
        referencia: "2345690",
        rif: "",
        factura: "",
        tipoPago: "Transferencia",
        estado: "Pendiente",
        validadoPor: "",
        vendedor: "vendedor2@onprotec.com",
        observaciones: "",
      },
    ];
    samplePagos.forEach(p => {
      const id = this.pagoIdCounter++;
      this.pagosData.set(id, {
        ...p,
        id,
        creadoEn: new Date(),
        celular: p.celular ?? null,
        referencia: p.referencia ?? null,
        rif: p.rif ?? null,
        factura: p.factura ?? null,
        observaciones: p.observaciones ?? null,
        cliente: null,
        megasoft: null,
        validadoPor: p.validadoPor ?? null,
        validadoEn: null,
        conciliadoEn: null,
        conciliadoPor: null,
        estado: p.estado ?? "Pendiente",
      });
    });
  }

  async getPagos(): Promise<Pago[]> {
    return Array.from(this.pagosData.values()).sort(
      (a, b) => new Date(b.creadoEn!).getTime() - new Date(a.creadoEn!).getTime()
    );
  }

  async getPagoById(id: number): Promise<Pago | undefined> {
    return this.pagosData.get(id);
  }

  async createPago(pago: InsertPago): Promise<Pago> {
    const id = this.pagoIdCounter++;
    const newPago: Pago = {
      ...pago,
      id,
      creadoEn: new Date(),
      celular: pago.celular ?? null,
      referencia: pago.referencia ?? null,
      rif: pago.rif ?? null,
      factura: pago.factura ?? null,
      observaciones: pago.observaciones ?? null,
      cliente: pago.cliente ?? null,
      megasoft: pago.megasoft ?? null,
      validadoPor: pago.validadoPor ?? null,
      validadoEn: null,
      conciliadoEn: null,
      conciliadoPor: pago.conciliadoPor ?? null,
      estado: pago.estado ?? "Pendiente",
    };
    this.pagosData.set(id, newPago);
    return newPago;
  }

  async updatePagoEstado(id: number, estado: string, validadoPor: string, observaciones?: string): Promise<Pago | undefined> {
    const pago = this.pagosData.get(id);
    if (!pago) return undefined;
    const updated = { ...pago, estado, validadoPor, observaciones: observaciones ?? pago.observaciones };
    this.pagosData.set(id, updated);
    return updated;
  }

  async deletePago(id: number): Promise<boolean> {
    return this.pagosData.delete(id);
  }

  async checkDuplicado(referencia: string, monto: string, fechaPago: string, tipoPago: string): Promise<Pago | undefined> {
    // Verificar duplicado por referencia (si existe)
    if (referencia && referencia.trim() !== "") {
      for (const pago of this.pagosData.values()) {
        if (pago.referencia && pago.referencia.trim() === referencia.trim() && pago.tipoPago === tipoPago) {
          return pago;
        }
      }
    }
    // Verificar duplicado por monto + fecha + tipo (para PagoMovil sin referencia)
    if (tipoPago === "PagoMovil") {
      for (const pago of this.pagosData.values()) {
        if (pago.monto === monto && pago.fechaPago === fechaPago && pago.tipoPago === tipoPago) {
          return pago;
        }
      }
    }
    return undefined;
  }

  async getUsuarios(): Promise<Usuario[]> {
    return Array.from(this.usuariosData.values());
  }

  async getUsuarioById(id: number): Promise<Usuario | undefined> {
    return this.usuariosData.get(id);
  }

  async getUsuarioByEmail(email: string): Promise<Usuario | undefined> {
    for (const usuario of this.usuariosData.values()) {
      if (usuario.email === email) return usuario;
    }
    return undefined;
  }

  async createUsuario(usuario: InsertUsuario): Promise<Usuario> {
    const id = this.usuarioIdCounter++;
    const newUsuario: Usuario = {
      ...usuario,
      id,
      creadoEn: new Date(),
      rol: usuario.rol ?? "vendedor",
      activo: usuario.activo ?? "true",
      solicitudes: usuario.solicitudes ?? "false",
      telegramChatId: usuario.telegramChatId ?? null,
    };
    this.usuariosData.set(id, newUsuario);
    return newUsuario;
  }

  async updateUsuario(id: number, data: Partial<InsertUsuario>): Promise<Usuario | undefined> {
    const usuario = this.usuariosData.get(id);
    if (!usuario) return undefined;
    const updated = { ...usuario, ...data };
    this.usuariosData.set(id, updated);
    return updated;
  }
}

export const storage = new MemStorage();
