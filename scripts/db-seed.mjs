import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://tipsy:tipsy_local_password@localhost:5432/tipsy";
const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
const source = await readFile(path.join(process.cwd(), "db", "seed.sql"), "utf8");
await sql.unsafe(source);
await sql.end();
process.stdout.write("Seed data applied\n");

