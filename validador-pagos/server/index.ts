import express, { type Request, Response, NextFunction } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// ─── Headers de seguridad ───
app.use((_req, res, next) => {
  // Prevenir clickjacking
  res.setHeader("X-Frame-Options", "DENY");
  // Prevenir MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Política de Referrer
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Permissions Policy
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // HSTS (1 año)
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // Ocultar headers del servidor
  res.removeHeader("X-Powered-By");
  res.removeHeader("X-Generator");
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Evitar que el CDN de Railway cachée las rutas API
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

async function runStartupMigrations() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS solicitud_mensajes (
        id              SERIAL PRIMARY KEY,
        solicitud_id    INTEGER NOT NULL,
        autor           TEXT NOT NULL,
        autor_nombre    TEXT,
        mensaje         TEXT,
        adjunto_url     TEXT,
        adjunto_nombre  TEXT,
        adjunto_tipo    TEXT,
        source          TEXT DEFAULT 'web',
        creado_en       TIMESTAMP DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS telegram_notificaciones (
        id                    SERIAL PRIMARY KEY,
        telegram_message_id   TEXT NOT NULL,
        solicitud_id          INTEGER NOT NULL,
        destinatario_email    TEXT,
        creado_en             TIMESTAMP DEFAULT NOW()
      );
    `);

    // ─── RBAC: permisos por rol ───────────────────────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS permisos_roles (
        rol       TEXT NOT NULL,
        pagina    TEXT NOT NULL,
        permitido TEXT NOT NULL DEFAULT 'false',
        PRIMARY KEY (rol, pagina)
      );
    `);

    // Poblar defaults (ON CONFLICT DO NOTHING para no sobreescribir cambios del admin)
    await db.execute(sql`
      INSERT INTO permisos_roles (rol, pagina, permitido) VALUES
        ('admin',          'registrar',             'true'),
        ('admin',          'registrar-divisas',     'true'),
        ('admin',          'upload-cashea',         'true'),
        ('admin',          'conciliacion',          'true'),
        ('admin',          'solicitudes',           'true'),
        ('admin',          'dashboard-solicitudes', 'true'),
        ('admin',          'usuarios',              'true'),
        ('vendedor',       'registrar',             'true'),
        ('vendedor',       'registrar-divisas',     'true'),
        ('vendedor',       'upload-cashea',         'true'),
        ('vendedor',       'conciliacion',          'true'),
        ('vendedor',       'solicitudes',           'false'),
        ('vendedor',       'dashboard-solicitudes', 'false'),
        ('vendedor',       'usuarios',              'false'),
        ('contabilidad',   'registrar',             'false'),
        ('contabilidad',   'registrar-divisas',     'false'),
        ('contabilidad',   'upload-cashea',         'true'),
        ('contabilidad',   'conciliacion',          'true'),
        ('contabilidad',   'solicitudes',           'false'),
        ('contabilidad',   'dashboard-solicitudes', 'false'),
        ('contabilidad',   'usuarios',              'false'),
        ('cajero',         'registrar',             'false'),
        ('cajero',         'registrar-divisas',     'false'),
        ('cajero',         'upload-cashea',         'false'),
        ('cajero',         'conciliacion',          'true'),
        ('cajero',         'solicitudes',           'false'),
        ('cajero',         'dashboard-solicitudes', 'false'),
        ('cajero',         'usuarios',              'false'),
        ('compras',        'registrar',             'false'),
        ('compras',        'registrar-divisas',     'false'),
        ('compras',        'upload-cashea',         'false'),
        ('compras',        'conciliacion',          'false'),
        ('compras',        'solicitudes',           'true'),
        ('compras',        'dashboard-solicitudes', 'true'),
        ('compras',        'usuarios',              'false'),
        ('supervisor_caja','registrar',             'true'),
        ('supervisor_caja','registrar-divisas',     'true'),
        ('supervisor_caja','upload-cashea',         'true'),
        ('supervisor_caja','conciliacion',          'true'),
        ('supervisor_caja','solicitudes',           'false'),
        ('supervisor_caja','dashboard-solicitudes', 'false'),
        ('supervisor_caja','usuarios',              'false')
      ON CONFLICT (rol, pagina) DO NOTHING;
    `);

    console.log("[startup] Migrations OK");
  } catch (e: any) {
    console.error("[startup] Migration error:", e.message);
  }
}

(async () => {
  await runStartupMigrations();
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
