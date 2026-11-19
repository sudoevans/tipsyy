import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../../src/server/db";
import { dispatchPaymentUpdates } from "../../src/server/payment-update-outbox";

// Real, isolated PostgreSQL in WASM: no application/customer DB is contacted.
const db = new PGlite();
const database = (async (parts: TemplateStringsArray, ...values: unknown[]) => {
  const query = parts.reduce((sql, part, index) => sql + (index ? `$${index}` : "") + part, "");
  return (await db.query(query, values)).rows;
}) as unknown as Database;
const orderId = "00000000-0000-4000-8000-000000000001";
const paymentId = "00000000-0000-4000-8000-000000000002";

beforeAll(async () => {
  await db.exec(`CREATE TABLE orders (id uuid PRIMARY KEY, order_number text);
    CREATE TABLE payments (id uuid PRIMARY KEY, order_id uuid REFERENCES orders(id), status text);`);
  await db.exec(await readFile("db/migrations/025_payment_live_outbox.sql", "utf8"));
}, 30_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`TRUNCATE payment_update_outbox,payments,orders;
    INSERT INTO orders VALUES ('${orderId}','TT-TEST');
    INSERT INTO payments VALUES ('${paymentId}','${orderId}','PENDING');`);
});

describe("payment callback delivery trail", () => {
  it.each(["CANCELLED", "SUCCEEDED", "FAILED", "TIMED_OUT"])("publishes a committed %s result", async (status) => {
    await db.query("UPDATE payments SET status=$1 WHERE id=$2", [status, paymentId]);
    const notify = vi.fn(async () => {});
    const getByName = vi.fn(() => ({ notify }));
    const namespace = { getByName } as unknown as CloudflareEnv["ORDER_PAYMENT_UPDATES"];
    expect(await dispatchPaymentUpdates(database, namespace)).toEqual({ attempted: 1 });
    expect(getByName).toHaveBeenCalledWith("TT-TEST");
    expect(notify).toHaveBeenCalledOnce();
    const rows = (await db.query<{ delivered_at: Date | null; attempts: number }>("SELECT * FROM payment_update_outbox")).rows;
    expect(rows[0].delivered_at).not.toBeNull();
    expect(rows[0].attempts).toBe(1);
    expect(await dispatchPaymentUpdates(database, namespace)).toEqual({ attempted: 0 });
  });

  it("retains failed publications for retry and recovers without losing the event", async () => {
    await db.exec("UPDATE payments SET status='CANCELLED'");
    const notify = vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue(undefined);
    const namespace = { getByName: () => ({ notify }) } as unknown as CloudflareEnv["ORDER_PAYMENT_UPDATES"];
    await dispatchPaymentUpdates(database, namespace);
    const row = (await db.query<{ id: string; delivered_at: Date | null; last_error: string }>("SELECT * FROM payment_update_outbox")).rows[0];
    expect(row.delivered_at).toBeNull(); expect(row.last_error).toBe("PUSH_UNAVAILABLE");
    // Advance retry eligibility without waiting or touching any production data.
    await db.exec("UPDATE payment_update_outbox SET available_at=now()");
    await dispatchPaymentUpdates(database, namespace);
    expect(notify.mock.calls).toEqual([[row.id], [row.id]]);
    expect((await db.query<{ attempts: number; delivered_at: Date | null }>("SELECT * FROM payment_update_outbox")).rows[0])
      .toMatchObject({ attempts: 2, delivered_at: expect.any(Date) });
  });

  it("rolls back the push event with the payment and ignores duplicate status writes", async () => {
    await expect(db.transaction(async (tx) => {
      await tx.exec("UPDATE payments SET status='CANCELLED'");
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    await db.exec("UPDATE payments SET status='PENDING'");
    expect((await db.query("SELECT * FROM payment_update_outbox")).rows).toHaveLength(0);
    await db.exec("UPDATE payments SET status='SUCCEEDED'; UPDATE payments SET status='SUCCEEDED';");
    expect((await db.query("SELECT * FROM payment_update_outbox")).rows).toHaveLength(1);
  });

  it("leases events once when two dispatchers run together", async () => {
    await db.exec("UPDATE payments SET status='FAILED'");
    const notify = vi.fn(async () => {});
    const namespace = { getByName: () => ({ notify }) } as unknown as CloudflareEnv["ORDER_PAYMENT_UPDATES"];
    const batches = await Promise.all([dispatchPaymentUpdates(database, namespace), dispatchPaymentUpdates(database, namespace)]);
    expect(batches.reduce((total, batch) => total + batch.attempted, 0)).toBe(1);
    expect(notify).toHaveBeenCalledOnce();
  });
});
