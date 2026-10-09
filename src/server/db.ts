import postgres from "postgres";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getServerEnv } from "./env";

const globalDatabase = globalThis as typeof globalThis & {
  tipsySql?: postgres.Sql;
};

type HyperdriveEnvironment = {
  HYPERDRIVE?: {
    connectionString: string;
  };
};

function getDatabaseUrl() {
  try {
    const context = getCloudflareContext();
    const hyperdrive = (context.env as typeof context.env & HyperdriveEnvironment).HYPERDRIVE;
    if (hyperdrive?.connectionString) return hyperdrive.connectionString;
  } catch {
    // Local Next.js development and build-time execution do not have Worker bindings.
  }
  return getServerEnv().DATABASE_URL;
}

export const sql = globalDatabase.tipsySql ?? postgres(getDatabaseUrl(), {
  max: process.env.NODE_ENV === "production" ? 5 : 5,
  idle_timeout: 10,
  connect_timeout: 5,
  fetch_types: false,
  prepare: false,
});

if (process.env.NODE_ENV !== "production") globalDatabase.tipsySql = sql;

export type Database = postgres.Sql;
export type Transaction = postgres.TransactionSql;

export async function withTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  return sql.begin(work) as Promise<T>;
}
