import postgres from "postgres";

import { getServerEnv } from "./env";

const globalDatabase = globalThis as typeof globalThis & {
  tipsySql?: postgres.Sql;
};

export const sql = globalDatabase.tipsySql ?? postgres(getServerEnv().DATABASE_URL, {
  max: process.env.NODE_ENV === "production" ? 12 : 5,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: true,
});

if (process.env.NODE_ENV !== "production") globalDatabase.tipsySql = sql;

export type Database = postgres.Sql;
export type Transaction = postgres.TransactionSql;

export async function withTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  return sql.begin(work) as Promise<T>;
}
