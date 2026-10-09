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
  const workerConnection = (globalThis as typeof globalThis & {
    tipsyHyperdriveConnectionString?: string;
  }).tipsyHyperdriveConnectionString;
  if (workerConnection) return workerConnection;
  try {
    const context = getCloudflareContext();
    const hyperdrive = (context.env as typeof context.env & HyperdriveEnvironment).HYPERDRIVE;
    if (hyperdrive?.connectionString) return hyperdrive.connectionString;
  } catch {
    // Local Next.js development and build-time execution do not have Worker bindings.
  }
  return getServerEnv().DATABASE_URL;
}

let databaseClient: postgres.Sql | undefined;

function getDatabaseClient() {
  if (databaseClient) return databaseClient;
  databaseClient = globalDatabase.tipsySql ?? postgres(getDatabaseUrl(), {
    max: 5,
    idle_timeout: 10,
    connect_timeout: 5,
    fetch_types: false,
    prepare: true,
  });
  if (process.env.NODE_ENV !== "production") globalDatabase.tipsySql = databaseClient;
  return databaseClient;
}

const sqlProxy = function sqlProxy(this: unknown, ...args: unknown[]) {
  return Reflect.apply(getDatabaseClient() as unknown as (...input: unknown[]) => unknown, this, args);
};

export const sql = new Proxy(sqlProxy, {
  apply(_target, thisArg, args) {
    return Reflect.apply(getDatabaseClient() as unknown as (...input: unknown[]) => unknown, thisArg, args);
  },
  get(_target, property) {
    const value = Reflect.get(getDatabaseClient(), property);
    return typeof value === "function" ? value.bind(getDatabaseClient()) : value;
  },
}) as unknown as postgres.Sql;

/*
 * The proxy is intentional: Worker bindings are request-scoped and are not
 * available while the bundled module is being evaluated on a fresh isolate.
 * Creating postgres at module scope would make that isolate permanently fall
 * back to the local DATABASE_URL.
 */
export type Database = postgres.Sql;
export type Transaction = postgres.TransactionSql;

export async function withTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  return sql.begin(work) as Promise<T>;
}
