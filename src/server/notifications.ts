import { getServerEnv } from "./env";
import { sql } from "./db";

interface NotificationRow { id: string; channel: string; destination: string; subject: string | null; body: string; attempts: number }

async function deliver(notification: NotificationRow) {
  if (notification.channel === "IN_APP") return { providerMessageId: null };
  const env = getServerEnv();
  if (notification.channel === "SMS" && env.OTP_PROVIDER_URL && env.OTP_PROVIDER_TOKEN) {
    const response = await fetch(env.OTP_PROVIDER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OTP_PROVIDER_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: notification.destination, senderId: env.OTP_SENDER_ID, message: notification.body }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`SMS provider returned ${response.status}.`);
    const payload = await response.json().catch(() => ({})) as { id?: string; messageId?: string };
    return { providerMessageId: payload.messageId ?? payload.id ?? null };
  }
  throw new Error(`No delivery adapter is configured for ${notification.channel}.`);
}

export async function dispatchPendingNotifications(limit = 50) {
  const pending = await sql<NotificationRow[]>`
    WITH candidates AS (
      SELECT id FROM notifications
      WHERE ((status = 'PENDING' AND scheduled_at <= now()) OR (status = 'PROCESSING' AND locked_at < now() - interval '5 minutes'))
        AND attempts < 5
      ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT ${limit}
    )
    UPDATE notifications n SET status = 'PROCESSING', locked_at = now()
    FROM candidates c WHERE n.id = c.id
    RETURNING n.id, n.channel, n.destination, n.subject, n.body, n.attempts
  `;
  let sent = 0;
  let failed = 0;
  for (const notification of pending) {
    try {
      const result = await deliver(notification);
      await sql`UPDATE notifications SET status = 'SENT', provider_message_id = ${result.providerMessageId}, attempts = attempts + 1, sent_at = now(), locked_at = NULL, last_error = NULL WHERE id = ${notification.id}`;
      sent += 1;
    } catch (error) {
      const attempts = notification.attempts + 1;
      await sql`
        UPDATE notifications SET status = ${attempts >= 5 ? "FAILED" : "PENDING"}, attempts = attempts + 1,
          scheduled_at = now() + make_interval(mins => LEAST(60, ${2 ** attempts})),
          locked_at = NULL, last_error = ${error instanceof Error ? error.message : String(error)} WHERE id = ${notification.id}
      `;
      failed += 1;
    }
  }
  return { processed: pending.length, sent, failed };
}
