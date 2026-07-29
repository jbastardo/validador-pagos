import "./styles.css";

const SERVICES = [
  { icon: "🖥️", title: "Monitoreo 24/7", desc: "Supervisión continua de equipos, servidores y red. Alertas en tiempo real antes de que el problema le afecte." },
  { icon: "🔧", title: "Soporte Remoto", desc: "Asistencia técnica inmediata sin desplazamiento. Sistema de tickets con historial completo de atención." },
  { icon: "☁️", title: "Archivos Seguros", desc: "Plataforma privada para compartir y sincronizar documentos. Cifrado total, sin nubes externas." },
  { icon: "⚙️", title: "Apps a la Medida", desc: "Webapps, integraciones ERP, automatizaciones. Software que se adapta a su proceso, no al revés." },
  { icon: "🔒", title: "Seguridad & Red", desc: "Firewall, VPN corporativa, gestión de contraseñas. Trabaje desde cualquier lugar con confianza." },
];

export function LandingMobile() {
  return (
    <div style={{
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      width: 390, minHeight: "100vh",
      background: "#fff", color: "#1a1a2e",
      margin: "0 auto",
    }}>
      {/* NAV */}
      <nav style={{
        background: "#0D1C40", padding: "0 20px", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <img
          src="/__mockup/images/tecnoservicio/logo-horizontal.png"
          alt="TecnoServicio"
          style={{ height: 30, objectFit: "contain" }}
        />
        <a href="#contacto" style={{
          background: "#F97316", color: "#fff", borderRadius: 6,
          padding: "7px 14px", fontSize: 12, fontWeight: 700, textDecoration: "none",
        }}>Contáctenos</a>
      </nav>

      {/* HERO */}
      <section style={{
        background: "linear-gradient(160deg, #0D1C40 0%, #1E3A8A 100%)",
        padding: "48px 24px 40px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "rgba(249,115,22,0.1)" }} />

        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.3)",
          borderRadius: 100, padding: "5px 12px", marginBottom: 24,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#F97316", display: "inline-block" }} />
          <span style={{ color: "#FED7AA", fontSize: 11, fontWeight: 600 }}>Virtual CIO & Arquitecto de Soluciones</span>
        </div>

        <h1 style={{
          fontSize: 30, fontWeight: 800, color: "#fff",
          lineHeight: 1.2, margin: "0 0 16px",
          letterSpacing: "-0.02em",
        }}>
          Tecnología gestionada para que su empresa{" "}
          <span style={{ color: "#F97316" }}>opere sin fricciones</span>
        </h1>

        <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 15, lineHeight: 1.7, margin: "0 0 32px" }}>
          Soporte 24/7, monitoreo proactivo y soluciones a la medida — bajo su control total.
        </p>

        <a href="#contacto" style={{
          display: "block", background: "#F97316", color: "#fff",
          borderRadius: 10, padding: "16px 24px", fontSize: 15,
          fontWeight: 700, textDecoration: "none", textAlign: "center",
          boxShadow: "0 4px 16px rgba(249,115,22,0.4)",
        }}>
          Solicitar diagnóstico gratuito →
        </a>

        {/* Stats */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16,
          marginTop: 32, paddingTop: 28,
          borderTop: "1px solid rgba(255,255,255,0.12)",
        }}>
          {[
            { n: "28 años", l: "de experiencia" },
            { n: "11 años", l: "Gerente TI Onprotec" },
            { n: "100%", l: "bajo su control" },
            { n: "24/7", l: "monitoreo activo" },
          ].map(s => (
            <div key={s.n}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#F97316" }}>{s.n}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* SERVICES */}
      <section style={{ padding: "48px 20px", background: "#F8FAFF" }}>
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <span style={{ color: "#F97316", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Servicios</span>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: "#0D1C40", margin: "8px 0 8px", letterSpacing: "-0.02em" }}>
            Todo lo que necesita, en una sola mano
          </h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {SERVICES.map((s, i) => (
            <div key={i} style={{
              background: "#fff", borderRadius: 14, padding: "24px 20px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 2px 8px rgba(13,28,64,0.05)",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: "#EFF6FF", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 22, flexShrink: 0,
                }}>{s.icon}</div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0D1C40", margin: "0 0 6px" }}>{s.title}</h3>
                  <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ABOUT */}
      <section style={{ padding: "48px 20px", background: "#fff" }}>
        <span style={{ color: "#F97316", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Sobre el especialista</span>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: "#0D1C40", margin: "8px 0 16px", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          Un CIO a tiempo parcial, sin el costo de uno de planta
        </h2>
        <p style={{ color: "#475569", fontSize: 14, lineHeight: 1.8, marginBottom: 24 }}>
          28 años en tecnología empresarial — los últimos 11 como Gerente de Tecnología en Onprotec. Visión estratégica unida a ejecución técnica de alto nivel.
        </p>

        <div style={{
          background: "linear-gradient(135deg, #0D1C40, #1E3A8A)",
          borderRadius: 16, padding: "28px 24px",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {["Proxmox VE", "Docker", "WatchGuard", "Tailscale", "Odoo", "Coolify"].map(t => (
              <div key={t} style={{
                background: "rgba(255,255,255,0.1)",
                borderRadius: 8, padding: "8px 10px",
                fontSize: 11, color: "#CBD5E1", fontWeight: 600, textAlign: "center",
              }}>{t}</div>
            ))}
          </div>
          <div style={{ marginTop: 20, color: "rgba(255,255,255,0.6)", fontSize: 12, textAlign: "center" }}>
            Stack tecnológico de referencia
          </div>
        </div>
      </section>

      {/* PROCESS */}
      <section style={{ padding: "48px 20px", background: "#F8FAFF" }}>
        <span style={{ color: "#F97316", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Proceso</span>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: "#0D1C40", margin: "8px 0 24px", letterSpacing: "-0.02em" }}>
          Cómo trabajamos
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { n: "01", t: "Diagnóstico inicial", d: "Evaluamos su infraestructura sin compromiso." },
            { n: "02", t: "Propuesta a la medida", d: "Plan ajustado a su tamaño y presupuesto." },
            { n: "03", t: "Implementación", d: "Configuramos y activamos con mínima disrupción." },
            { n: "04", t: "Soporte continuo", d: "Monitoreo permanente y revisiones periódicas." },
          ].map((step, i) => (
            <div key={i} style={{
              background: "#fff", borderRadius: 12, padding: "20px",
              border: "1px solid #e2e8f0", display: "flex", gap: 16, alignItems: "flex-start",
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: "#F97316", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 800, flexShrink: 0,
              }}>{step.n}</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0D1C40", marginBottom: 4 }}>{step.t}</div>
                <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{step.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section id="contacto" style={{
        padding: "48px 20px",
        background: "linear-gradient(135deg, #0D1C40, #1E3A8A)",
      }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: "0 0 12px", letterSpacing: "-0.02em" }}>
          ¿Listo para operar sin fricciones?
        </h2>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 1.7, marginBottom: 28 }}>
          Evaluación gratuita de su infraestructura. Sin compromiso, sin tecnicismos.
        </p>
        <a href="mailto:contacto@tutecnoservicio.com" style={{
          display: "block", background: "#F97316", color: "#fff",
          borderRadius: 10, padding: "16px 24px", fontSize: 15,
          fontWeight: 700, textDecoration: "none", textAlign: "center",
          marginBottom: 12, boxShadow: "0 4px 16px rgba(249,115,22,0.4)",
        }}>
          Solicitar evaluación gratuita
        </a>
        <a href="https://wa.me/58424xxxxxxx" style={{
          display: "block", background: "rgba(255,255,255,0.12)", color: "#fff",
          borderRadius: 10, padding: "16px 24px", fontSize: 15,
          fontWeight: 600, textDecoration: "none", textAlign: "center",
          border: "1px solid rgba(255,255,255,0.2)",
        }}>
          WhatsApp
        </a>
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 20, textAlign: "center" }}>
          contacto@tutecnoservicio.com
        </p>
      </section>

      {/* FOOTER */}
      <footer style={{ background: "#060D1F", padding: "24px 20px", textAlign: "center" }}>
        <img
          src="/__mockup/images/tecnoservicio/logo-horizontal.png"
          alt="TecnoServicio"
          style={{ height: 28, objectFit: "contain", opacity: 0.8, marginBottom: 12, display: "block", margin: "0 auto 12px" }}
        />
        <div style={{ color: "#475569", fontSize: 11 }}>
          © 2025 TecnoServicio · tutecnoservicio.com
        </div>
      </footer>
    </div>
  );
}
