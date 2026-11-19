import type { Database } from "./db";

export async function dispatchPaymentUpdates(
  database: Database,
  namespace: CloudflareEnv["ORDER_PAYMENT_UPDATES"],
  limit = 20,
) {
  // Atomic leases let callbacks and cron drain concurrently without losing work.
  const events = await database<{ id: string; order_number: string }[]>`
    WITH pending AS (
      SELECT id FROM payment_update_outbox
      WHERE delivered_at IS NULL AND available_at <= now()
      ORDER BY created_at LIMIT ${limit} FOR UPDATE SKIP LOCKED
    ), claimed AS (
      UPDATE payment_update_outbox e SET attempts=attempts+1,
        available_at=now()+interval '30 seconds'
      FROM pending WHERE e.id=pending.id RETURNING e.id,e.order_id
    )
    SELECT c.id,o.order_number FROM claimed c JOIN orders o ON o.id=c.order_id
  `;
  await Promise.all(events.map(async (event) => {
    try {
      await namespace.getByName(event.order_number).notify(event.id);
      await database`UPDATE payment_update_outbox SET delivered_at=now(),last_error=NULL WHERE id=${event.id}`;
      console.info(JSON.stringify({ event: "payment.push_delivered", eventId: event.id }));
    } catch (error) {
      await database`UPDATE payment_update_outbox SET last_error='PUSH_UNAVAILABLE',
        available_at=now()+interval '10 seconds' WHERE id=${event.id} AND delivered_at IS NULL`;
      console.error(JSON.stringify({ event: "payment.push_delayed", eventId: event.id,
        errorName: error instanceof Error ? error.name : "Unknown" }));
    }
  }));
  return { attempted: events.length };
}
