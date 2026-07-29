/**
 * Migration runner — executes all pending Drizzle migrations against the
 * configured DATABASE_URL.  Called automatically on app startup so that
 * tables are guaranteed to exist before any route handler runs.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { join } from "path";
import { existsSync } from "fs";

export async function runMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn("[migrate] DATABASE_URL not set — skipping migrations");
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  // Resolve the migrations folder.  We try several candidate paths so this
  // works in all environments:
  //   • Development (tsx server/index.ts):  <cwd>/migrations
  //   • Production bundle (dist/index.cjs): <cwd>/dist/migrations  (copied by build)
  //   • Fallback:                           <cwd>/migrations
  const candidates = [
    join(process.cwd(), "migrations"),
    join(process.cwd(), "dist", "migrations"),
  ];
  const migrationsFolder = candidates.find(existsSync) ?? candidates[0];

  console.log("[migrate] Running database migrations…");
  try {
    await migrate(db, { migrationsFolder });
    console.log("[migrate] Migrations complete.");
  } catch (err) {
    console.error("[migrate] Migration failed:", err);
    throw err;
  } finally {
    await pool.end();
  }
}
