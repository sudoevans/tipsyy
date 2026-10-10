import { getServerEnv } from "./env";
import { sql, type Database, type Transaction } from "./db";
import { decryptPlatformSecret } from "./security";

interface NotificationRow { id: string; channel: string; destination: string; subject: string | null; body: string; attempts: number }

export const TELEGRAM_EVENTS = [
  "ORDER_CREATED", "ORDER_PAID", "ORDER_CANCELLED", "ORDER_REFUNDED",
  "DRIVER_ASSIGNED", "DRIVER_PICKED_UP", "DRIVER_DROPPED", "DRIVER_CANCELLED",
  "INVENTORY_LOW_STOCK", "INVENTORY_OUT_OF_STOCK",
] as const;

export async function enqueueTelegramAlert(
  tx: Transaction | Database,
  input: { eventType: string; entityType: string; entityId: string; title: string; body: string },
) {
  if (!(TELEGRAM_EVENTS as readonly string[]).includes(input.eventType)) return;
  const [setting] = await tx<{ value: { chatId?: string; events?: Record<string, boolean> } }[]>`
    SELECT value FROM platform_settings WHERE key='notifications.telegram'
  `;
  const config = setting?.value;
  if (!config?.chatId || !config.events?.[input.eventType]) return;
  const dedupKey = `${input.eventType}:${input.entityType}:${input.entityId}`;
  await tx`
    INSERT INTO notifications(channel,event_type,destination,subject,body,dedup_key)
    VALUES('TELEGRAM',${input.eventType},${config.chatId},${input.title},${input.body},${dedupKey})
    ON CONFLICT(dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
  `;
}

export async function sendTelegramMessage(chatId: string, text: string) {
  const [setting] = await sql<{ value: { botTokenEncrypted?: string } }[]>`
    SELECT value FROM platform_settings WHERE key='notifications.telegram'
  `;
  const encryptedToken = setting?.value?.botTokenEncrypted;
  const token = encryptedToken
    ? decryptPlatformSecret(encryptedToken)
    : getServerEnv().TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram is not configured. Add the bot token in Admin Settings.");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json().catch(() => null) as { ok?: boolean; description?: string; result?: { message_id?: number } } | null;
  if (!response.ok || !result?.ok) throw new Error(result?.description ?? `Telegram returned ${response.status}.`);
  return result.result?.message_id ?? null;
}

async function deliver(notification: NotificationRow) {
  if (notification.channel === "IN_APP") return { providerMessageId: null };
  if (notification.channel === "TELEGRAM") {
    const providerMessageId = await sendTelegramMessage(notification.destination, [notification.subject, notification.body].filter(Boolean).join("\n"));
    return { providerMessageId: providerMessageId === null ? null : String(providerMessageId) };
  }
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
      const safeFailure = notification.channel === "TELEGRAM"
        ? "Telegram delivery failed. Check Workers logs and bot configuration."
        : error instanceof Error ? error.message.slice(0, 500) : "Notification delivery failed.";
      await sql`
        UPDATE notifications SET status = ${attempts >= 5 ? "FAILED" : "PENDING"}::notification_status, attempts = attempts + 1,
          scheduled_at = now() + make_interval(mins => LEAST(60, ${2 ** attempts})),
          locked_at = NULL, last_error = ${safeFailure} WHERE id = ${notification.id}
      `;
      failed += 1;
    }
  }
  return { processed: pending.length, sent, failed };
}
