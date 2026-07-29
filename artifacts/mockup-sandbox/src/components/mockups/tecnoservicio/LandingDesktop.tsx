import "./styles.css";

const NAV_LINKS = ["Servicios", "Experiencia", "Cómo trabajo", "Contacto"];

const SERVICES = [
  {
    icon: "🖥️",
    title: "Monitoreo Proactivo 24/7",
    subtitle: "Detectamos problemas antes de que los sienta",
    desc: "Supervisión continua de todos sus equipos, servidores y conexiones. Recibe alertas en tiempo real y reportes de disponibilidad mensuales. Sus operaciones no se detienen.",
    tags: ["Alertas en tiempo real", "Reportes mensuales", "RMM + Uptime"],
    color: "#1E3A8A",
  },
  {
    icon: "🔧",
    title: "Soporte Remoto Sin Fronteras",
    subtitle: "Asistencia técnica inmediata, sin desplazamiento",
    desc: "Atención directa al equipo del usuario mediante acceso remoto seguro y sistema de tickets. Tiempo de respuesta garantizado, historial completo de cada incidencia.",
    tags: ["Sistema de tickets", "Acceso seguro remoto", "Registro de atención"],
    color: "#1E3A8A",
  },
  {
    icon: "☁️",
    title: "Intercambio Seguro de Archivos",
    subtitle: "Su información siempre bajo su control",
    desc: "Plataforma privada para compartir, sincronizar y colaborar en documentos sensibles. Cifrado de extremo a extremo, sin depender de servicios de terceros.",
    tags: ["Cifrado E2E", "Colaboración interna", "Sin almacenamiento externo"],
    color: "#1E3A8A",
  },
  {
    icon: "⚙️",
    title: "Desarrollo de Aplicaciones a la Medida",
    subtitle: "Software que se adapta a su proceso, no al revés",
    desc: "Diseño e implementación de webapps, integraciones entre sistemas (ERP, API), automatizaciones y flujos de trabajo digitales. Desde la idea hasta producción.",
    tags: ["Integraciones API", "ERP & Odoo", "Webapps propias"],
    color: "#1E3A8A",
  },
  {
    icon: "🔒",
    title: "Seguridad y Conectividad Corporativa",
    subtitle: "Redes robustas y acceso seguro donde sea",
    desc: "Implementación y gestión de firewall perimetral, VPN empresarial, gestión de contraseñas y conectividad unificada. Trabaje desde cualquier lugar con confianza.",
    tags: ["Firewall perimetral", "VPN corporativa", "Gestión de credenciales"],
    color: "#1E3A8A",
  },
];

const STEPS = [
  { num: "01", title: "Diagnóstico inicial", desc: "Evaluamos su infraestructura actual sin compromiso y le presentamos un mapa claro de riesgos y oportunidades." },
  { num: "02", title: "Propuesta a la medida", desc: "Diseñamos un plan de servicios ajustado a su tamaño, presupuesto y prioridades operativas." },
  { num: "03", title: "Implementación y activación", desc: "Configuramos las herramientas, capacitamos al equipo y ponemos en marcha los servicios con mínima disrupción." },
  { num: "04", title: "Soporte continuo", desc: "Monitoreo permanente, atención ante incidencias y revisiones periódicas para mantener el rendimiento óptimo." },
];

const TRUST_ITEMS = [
  { icon: "🏆", label: "28 años", sub: "de experiencia técnica" },
  { icon: "🏢", label: "11 años", sub: "como Gerente de Tecnología" },
  { icon: "🛡️", label: "Infraestructura", sub: "100% bajo su control" },
  { icon: "⚡", label: "Respuesta", sub: "en el menor tiempo posible" },
];

export function LandingDesktop() {
  return (
    <div className="ts-root" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", minHeight: "100vh", background: "#fff", color: "#1a1a2e" }}>
      {/* NAV */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(13, 28, 64, 0.97)", backdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 48px", height: 68,
      }}>
        <img
          src="/__mockup/images/tecnoservicio/logo-horizontal.png"
          alt="TecnoServicio"
          style={{ height: 40, objectFit: "contain" }}
        />
        <div style={{ display: "flex", gap: 36 }}>
          {NAV_LINKS.map(l => (
            <a key={l} href="#" style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none", fontSize: 14, fontWeight: 500, letterSpacing: "0.02em" }}>{l}</a>
          ))}
        </div>
        <a href="#contacto" style={{
          background: "#F97316", color: "#fff", borderRadius: 8,
          padding: "10px 24px", fontSize: 14, fontWeight: 600, textDecoration: "none",
          boxShadow: "0 2px 12px rgba(249,115,22,0.35)",
        }}>
          Hablar con un experto
        </a>
      </nav>

      {/* HERO */}
      <section style={{
        background: "linear-gradient(135deg, #0D1C40 0%, #1E3A8A 60%, #0D1C40 100%)",
        padding: "96px 48px 80px",
        position: "relative", overflow: "hidden",
      }}>
        {/* Decorative circles */}
        <div style={{ position: "absolute", top: -80, right: -80, width: 400, height: 400, borderRadius: "50%", background: "rgba(249,115,22,0.08)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -60, left: -60, width: 280, height: 280, borderRadius: "50%", background: "rgba(249,115,22,0.06)", pointerEvents: "none" }} />

        <div style={{ maxWidth: 900, margin: "0 auto", position: "relative" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.3)",
            borderRadius: 100, padding: "6px 16px", marginBottom: 32,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F97316", display: "inline-block" }} />
            <span style={{ color: "#FED7AA", fontSize: 13, fontWeight: 500 }}>Virtual CIO & Arquitecto de Soluciones</span>
          </div>

          <h1 style={{
            fontSize: 56, fontWeight: 800, lineHeight: 1.1,
            color: "#fff", margin: "0 0 24px",
            letterSpacing: "-0.02em",
          }}>
            Tecnología gestionada<br />
            <span style={{ color: "#F97316" }}>para que su empresa</span><br />
            opere sin fricciones
          </h1>

          <p style={{
            fontSize: 20, color: "rgba(255,255,255,0.75)", maxWidth: 640,
            lineHeight: 1.7, margin: "0 0 48px",
          }}>
            Soporte técnico profesional, monitoreo 24/7 y desarrollo de soluciones a la medida — todo bajo su control, sin depender de terceros.
          </p>

          <div style={{ display: "flex", gap: 16 }}>
            <a href="#contacto" style={{
              background: "#F97316", color: "#fff", borderRadius: 10,
              padding: "16px 36px", fontSize: 16, fontWeight: 700, textDecoration: "none",
              boxShadow: "0 4px 20px rgba(249,115,22,0.4)",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}>
              Solicitar diagnóstico gratuito →
            </a>
            <a href="#servicios" style={{
              background: "rgba(255,255,255,0.1)", color: "#fff", borderRadius: 10,
              padding: "16px 36px", fontSize: 16, fontWeight: 600, textDecoration: "none",
              border: "1px solid rgba(255,255,255,0.2)",
            }}>
              Ver servicios
            </a>
          </div>

          {/* Trust strip */}
          <div style={{
            display: "flex", gap: 48, marginTop: 64,
            borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 32,
          }}>
            {TRUST_ITEMS.map(t => (
              <div key={t.label}>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#F97316" }}>{t.label}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{t.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="servicios" style={{ padding: "96px 48px", background: "#F8FAFF" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <span style={{ color: "#F97316", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Nuestros Servicios</span>
            <h2 style={{ fontSize: 40, fontWeight: 800, color: "#0D1C40", margin: "12px 0 16px", letterSpacing: "-0.02em" }}>
              Todo lo que necesita, en una sola mano
            </h2>
            <p style={{ color: "#64748b", fontSize: 18, maxWidth: 560, margin: "0 auto" }}>
              Servicios diseñados por beneficio empresarial, no por tecnología.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {SERVICES.map((s, i) => (
              <div key={i} style={{
                background: "#fff", borderRadius: 16,
                padding: "36px 32px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 12px rgba(13,28,64,0.05)",
                gridColumn: i === 4 ? "span 2" : undefined,
                display: i === 4 ? "flex" : "block", gap: i === 4 ? 40 : undefined,
                alignItems: i === 4 ? "flex-start" : undefined,
              }}>
                <div>
                  <div style={{
                    width: 56, height: 56, borderRadius: 14,
                    background: "#EFF6FF",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 28, marginBottom: 20,
                  }}>
                    {s.icon}
                  </div>
                  <h3 style={{ fontSize: 22, fontWeight: 700, color: "#0D1C40", margin: "0 0 6px" }}>{s.title}</h3>
                  <p style={{ fontSize: 14, color: "#F97316", fontWeight: 600, margin: "0 0 14px" }}>{s.subtitle}</p>
                </div>
                <div>
                  <p style={{ color: "#475569", fontSize: 15, lineHeight: 1.7, margin: "0 0 20px" }}>{s.desc}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {s.tags.map(tag => (
                      <span key={tag} style={{
                        background: "#EFF6FF", color: "#1E40AF",
                        fontSize: 12, fontWeight: 600, borderRadius: 100,
                        padding: "4px 12px",
                      }}>{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT / EXPERIENCE */}
      <section id="experiencia" style={{ padding: "96px 48px", background: "#fff" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", gap: 80, alignItems: "center" }}>
          {/* Left: visual */}
          <div style={{ flex: "0 0 420px" }}>
            <div style={{
              background: "linear-gradient(135deg, #0D1C40, #1E3A8A)",
              borderRadius: 24, padding: 48, position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: -30, right: -30, width: 180, height: 180, borderRadius: "50%", background: "rgba(249,115,22,0.1)" }} />
              <img
                src="/__mockup/images/tecnoservicio/isotipo.jpeg"
                alt="TecnoServicio"
                style={{ width: 80, height: 80, borderRadius: 16, marginBottom: 24, objectFit: "cover" }}
              />
              <div style={{ color: "#fff", fontSize: 48, fontWeight: 900, lineHeight: 1 }}>28</div>
              <div style={{ color: "#FED7AA", fontSize: 16, marginBottom: 32 }}>años de experiencia técnica</div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 24 }}>
                <div style={{ color: "#94A3B8", fontSize: 13, marginBottom: 8 }}>Últimos 11 años como</div>
                <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>Gerente de Tecnología y Proyectos — Onprotec</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 24 }}>
                {["Proxmox VE", "Docker", "WatchGuard", "Tailscale", "Odoo", "Coolify"].map(tech => (
                  <div key={tech} style={{
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: 8, padding: "8px 12px",
                    fontSize: 12, color: "#CBD5E1", fontWeight: 500,
                  }}>{tech}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: text */}
          <div style={{ flex: 1 }}>
            <span style={{ color: "#F97316", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Sobre el especialista</span>
            <h2 style={{ fontSize: 38, fontWeight: 800, color: "#0D1C40", margin: "12px 0 24px", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
              Un CIO a tiempo parcial para su empresa, sin costo de tiempo completo
            </h2>
            <p style={{ color: "#475569", fontSize: 16, lineHeight: 1.8, marginBottom: 20 }}>
              Con 28 años en el mundo tecnológico empresarial — los últimos 11 como gerente de tecnología y proyectos en Onprotec — ofrezco algo que pocas empresas pueden permitirse internamente: visión estratégica unida a ejecución técnica de alto nivel.
            </p>
            <p style={{ color: "#475569", fontSize: 16, lineHeight: 1.8, marginBottom: 32 }}>
              No soy un soporte genérico. Soy un arquitecto de soluciones que entiende sus procesos, diseña la infraestructura correcta y la implementa con autonomía total, prefiriendo siempre el control interno sobre dependencias de terceros.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                "Infraestructura 100% bajo el control de su empresa",
                "Soluciones escalables pensadas para crecer con el negocio",
                "Integración de IA y automatización en procesos cotidianos",
                "Redes corporativas, seguridad perimetral y acceso remoto seguro",
              ].map(item => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#DBEAFE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                    <span style={{ color: "#1E40AF", fontSize: 12, fontWeight: 700 }}>✓</span>
                  </div>
                  <span style={{ color: "#334155", fontSize: 15, lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* HOW I WORK */}
      <section id="proceso" style={{ padding: "96px 48px", background: "#F8FAFF" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <span style={{ color: "#F97316", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Cómo trabajo</span>
            <h2 style={{ fontSize: 40, fontWeight: 800, color: "#0D1C40", margin: "12px 0 16px", letterSpacing: "-0.02em" }}>
              Un proceso claro desde el primer día
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
            {STEPS.map((step, i) => (
              <div key={i} style={{
                background: "#fff", borderRadius: 16, padding: "36px 28px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 12px rgba(13,28,64,0.04)",
                position: "relative",
              }}>
                <div style={{
                  fontSize: 13, fontWeight: 800, color: "#F97316",
                  letterSpacing: "0.05em", marginBottom: 16,
                }}>PASO {step.num}</div>
                <div style={{
                  width: 48, height: 4, borderRadius: 2,
                  background: "linear-gradient(90deg, #F97316, #FB923C)",
                  marginBottom: 20,
                }} />
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#0D1C40", margin: "0 0 12px" }}>{step.title}</h3>
                <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.7, margin: 0 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section style={{ padding: "60px 48px", background: "#0D1C40" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 0, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
            {[
              { icon: "🏛️", label: "Empresas de todos los tamaños", sub: "Desde pymes hasta corporaciones con múltiples sedes" },
              { icon: "🔐", label: "Datos siempre bajo su control", sub: "Sin almacenamiento en nubes externas desconocidas" },
              { icon: "📞", label: "Atención directa con el experto", sub: "No call centers, no niveles de soporte intermedios" },
              { icon: "📊", label: "Reportes mensuales claros", sub: "Visibilidad total de incidencias, disponibilidad y uso" },
            ].map((item, i) => (
              <div key={i} style={{
                flex: 1, padding: "32px 28px",
                borderRight: i < 3 ? "1px solid rgba(255,255,255,0.08)" : undefined,
                textAlign: "center",
              }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{item.icon}</div>
                <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{item.label}</div>
                <div style={{ color: "#94A3B8", fontSize: 13, lineHeight: 1.5 }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA / CONTACT */}
      <section id="contacto" style={{
        padding: "96px 48px",
        background: "linear-gradient(135deg, #F8FAFF 0%, #EFF6FF 100%)",
      }}>
        <div style={{
          maxWidth: 800, margin: "0 auto",
          background: "linear-gradient(135deg, #0D1C40, #1E3A8A)",
          borderRadius: 24, padding: "72px 64px",
          position: "relative", overflow: "hidden", textAlign: "center",
        }}>
          <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "rgba(249,115,22,0.12)" }} />
          <div style={{ position: "absolute", bottom: -40, left: -40, width: 160, height: 160, borderRadius: "50%", background: "rgba(249,115,22,0.08)" }} />
          <div style={{ position: "relative" }}>
            <h2 style={{ fontSize: 38, fontWeight: 800, color: "#fff", margin: "0 0 16px", letterSpacing: "-0.02em" }}>
              ¿Listo para dejar de apagar incendios?
            </h2>
            <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 18, lineHeight: 1.7, margin: "0 0 40px", maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
              Solicite una evaluación gratuita de su infraestructura. Sin compromiso, sin tecnicismos — solo claridad sobre el estado real de su tecnología.
            </p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <a href="mailto:contacto@tutecnoservicio.com" style={{
                background: "#F97316", color: "#fff", borderRadius: 10,
                padding: "16px 36px", fontSize: 16, fontWeight: 700, textDecoration: "none",
                boxShadow: "0 4px 20px rgba(249,115,22,0.4)",
              }}>
                Solicitar evaluación gratuita
              </a>
              <a href="https://wa.me/58424xxxxxxx" style={{
                background: "rgba(255,255,255,0.12)", color: "#fff", borderRadius: 10,
                padding: "16px 36px", fontSize: 16, fontWeight: 600, textDecoration: "none",
                border: "1px solid rgba(255,255,255,0.2)",
              }}>
                Escribir por WhatsApp
              </a>
            </div>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 24 }}>
              contacto@tutecnoservicio.com · tutecnoservicio.com
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        background: "#060D1F", padding: "40px 48px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <img
            src="/__mockup/images/tecnoservicio/logo-horizontal.png"
            alt="TecnoServicio"
            style={{ height: 32, objectFit: "contain", opacity: 0.85 }}
          />
          <div style={{ color: "#475569", fontSize: 13 }}>
            © 2025 TecnoServicio · tutecnoservicio.com · Todos los derechos reservados
          </div>
        </div>
      </footer>
    </div>
  );
}
