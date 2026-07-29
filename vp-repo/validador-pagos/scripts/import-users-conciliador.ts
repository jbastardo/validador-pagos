import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { usuarios } from "@shared/schema";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

function parseCSV(content: string) {
  const lines = content.split("\n").filter(line => line.trim());
  const headers = lines[0].split(",").map(h => h.trim());

  return lines.slice(1).map(line => {
    const values = line.split(",").map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || "";
    });
    return row;
  });
}

async function importUsers() {
  const csvPath = path.join(__dirname, "..", "..", "Validador de Pagos - Onprotec - UsuariosConciliador.csv");

  if (!fs.existsSync(csvPath)) {
    console.error("CSV file not found at:", csvPath);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSV(content);

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const nombre = row["nombre"];
    const email = row["email"];
    const password = row["password"];
    const rol = row["rol"];
    const activo = row["activo"];

    if (!email || !nombre) {
      skipped++;
      continue;
    }

    try {
      await db.insert(usuarios).values({
        nombre,
        email,
        password,
        rol: rol || "vendedor",
        activo: activo === "true" ? "true" : "false",
        creadoEn: new Date(),
      }).onConflictDoNothing();

      imported++;
      console.log(`Imported: ${nombre} (${email}) - ${rol}`);
    } catch (err) {
      console.error(`Error importing ${email}:`, err);
    }
  }

  console.log(`\nDone! Imported: ${imported}, Skipped: ${skipped}`);
  await pool.end();
}

importUsers().catch(console.error);