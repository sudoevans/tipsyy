import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://tipsy:tipsy_local_password@localhost:5432/tipsy";
const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
const migrationsDir = path.join(process.cwd(), "db", "migrations");

await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
const applied = new Set((await sql`SELECT name FROM schema_migrations`).map((row) => row.name));
const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

for (const file of files) {
  if (applied.has(file)) continue;
  const source = await readFile(path.join(migrationsDir, file), "utf8");
  await sql.begin(async (transaction) => {
    await transaction.unsafe(source);
    await transaction`INSERT INTO schema_migrations (name) VALUES (${file})`;
  });
  process.stdout.write(`Applied ${file}\n`);
}

await sql.end();

