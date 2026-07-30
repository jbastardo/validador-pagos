import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try public URL first, then fallback to DATABASE_URL
const dbUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString: dbUrl });

function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',').map(h => h.trim());

  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || '';
    });
    return row;
  });
}

async function importUsers() {
  const csvPath = path.join(__dirname, '..', '..', 'Validador de Pagos - Onprotec - Usuarios.csv');

  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found at:', csvPath);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(content);

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = parseInt(row['ID']);
    const nombre = row['Nombre'];
    const email = row['Email'];
    const password = row['Password'];
    const rol = row['Rol'];
    const activo = row['Activo'];
    const solicitudes = row['solicitudes'];
    const telegramChatId = row['bot telegram'];

    if (!email || activo === 'ELIMINADO' || !nombre) {
      skipped++;
      continue;
    }

    try {
      await pool.query(`
        INSERT INTO usuarios (id, nombre, email, password, rol, activo, solicitudes, telegram_chat_id, creado_en)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (email) DO NOTHING
      `, [
        id,
        nombre,
        email,
        password,
        rol || 'vendedor',
        activo === 'true' ? 'true' : 'false',
        solicitudes === 'true' ? 'true' : 'false',
        telegramChatId || null
      ]);

      imported++;
      console.log(`Imported: ${nombre} (${email})`);
    } catch (err) {
      console.error(`Error importing ${email}:`, err.message);
    }
  }

  console.log(`\nDone! Imported: ${imported}, Skipped: ${skipped}`);
  await pool.end();
}

importUsers().catch(console.error);
