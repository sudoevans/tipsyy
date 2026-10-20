import { getServerEnv } from "./env";
import { sql, type Database, type Transaction } from "./db";
import { decryptPlatformSecret } from "./security";

interface NotificationRow { id: string; channel: string; event_type: string | null; destination: string; subject: string | null; body: string; attempts: number }

class TelegramDeliveryError extends Error {}

export const TELEGRAM_EVENTS = [
  "ORDER_PAID", "ORDER_CANCELLED", "ORDER_REFUNDED",
  "DRIVER_ASSIGNED", "DRIVER_PICKED_UP", "DRIVER_DROPPED", "DRIVER_CANCELLED",
  "INVENTORY_LOW_STOCK", "INVENTORY_OUT_OF_STOCK",
] as const;

export async function enqueueTelegramAlert(
  tx: Transaction | Database,
  input: { eventType: string; entityType: string; entityId: string; title: string; body: string },
) {
  if (!(TELEGRAM_EVENTS as readonly string[]).includes(input.eventType)) return;
  if (input.entityType === "order") {
    const [paid] = await tx`SELECT id FROM payments WHERE order_id=${input.entityId} AND status='SUCCEEDED' LIMIT 1`;
    if (!paid) return;
  }
  const [setting] = await tx<{ value: { chatId?: string; events?: Record<string, boolean> } }[]>`
    SELECT value FROM platform_settings WHERE key='notifications.telegram'
  `;
  const config = setting?.value;
  if (!config?.chatId || !config.events?.[input.eventType]) return;
  let body = input.body;
  const title = input.eventType === "ORDER_PAID" ? `✅ ${input.title}` : input.title;
  if (input.entityType === "order") {
    const [order] = await tx<{
      order_number: string; customer_name: string; customer_phone: string;
      delivery_address: { addressLine?: string; latitude?: number; longitude?: number }; delivery_instructions: string | null;
      total_minor: number; status: string; created_at: Date;
    }[]>`SELECT order_number,customer_name,customer_phone,delivery_address,delivery_instructions,total_minor,status::text,created_at FROM orders WHERE id=${input.entityId}`;
    if (order) {
      const items = await tx<{ product_name: string; size_label: string | null; quantity: number; line_total_minor: number }[]>`
        SELECT product_name,size_label,quantity,line_total_minor FROM order_items WHERE order_id=${input.entityId} ORDER BY created_at
      `;
      const amount = (value: number) => new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(value);
      const adminUrl = new URL(getServerEnv().APP_URL);
      const local = ["localhost", "127.0.0.1"].includes(adminUrl.hostname);
      if (!local && !adminUrl.hostname.startsWith("admin.")) adminUrl.hostname = `admin.${adminUrl.hostname}`;
      adminUrl.pathname = `${local ? "/admin" : ""}/orders/${encodeURIComponent(order.order_number)}`;
      adminUrl.search = "";
      adminUrl.hash = "";
      const latitude = order.delivery_address?.latitude;
      const longitude = order.delivery_address?.longitude;
      const hasCoordinates = typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
        && typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
      const location = hasCoordinates
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`
        : "N/A";
      body = [
        `📦 Order: ${order.order_number}`, `Customer: ${order.customer_name}`, `📞 Phone: ${order.customer_phone}`,
        `📍 Location: ${location}`,
        order.delivery_instructions ? `Delivery notes: ${order.delivery_instructions}` : null,
        "", "Items:", ...items.map((item) => `• ${item.product_name}${item.size_label ? ` (${item.size_label})` : ""} ×${item.quantity} — ${amount(item.line_total_minor)}`),
        "", `Total: ${amount(order.total_minor)}`, `Status: ${order.status.replaceAll("_", " ")}`,
        `Placed: ${new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" }).format(order.created_at)}`,
        "", `View in Admin: ${adminUrl.toString()}`, `WhatsApp customer: https://wa.me/${order.customer_phone.replace(/\D/g, "")}`,
      ].filter((line) => line !== null).join("\n");
    }
  }
  const dedupKey = `${input.eventType}:${input.entityType}:${input.entityId}`;
  await tx`
    INSERT INTO notifications(channel,event_type,destination,subject,body,dedup_key)
    VALUES('TELEGRAM',${input.eventType},${config.chatId},${title},${body},${dedupKey})
    ON CONFLICT(dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
  `;
}

export async function sendTelegramMessage(chatId: string, text: string, buttons: { text: string; url: string }[][] = []) {
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
    body: JSON.stringify({ chat_id: chatId, text: text.length > 4000 ? `${text.slice(0, 3999)}…` : text, disable_web_page_preview: true, ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}) }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json().catch(() => null) as { ok?: boolean; description?: string; result?: { message_id?: number } } | null;
  if (!response.ok || !result?.ok) {
    const description = result?.description ?? "";
    const message = /chat not found/i.test(description)
      ? "Telegram chat not found. Start the bot or add it to your group, then check the chat ID in Settings."
      : /blocked|kicked|not a member|not enough rights/i.test(description)
        ? "Telegram bot cannot send to this chat. Check bot membership and permissions."
        : response.status === 401
          ? "Telegram bot token is invalid. Replace it in Settings."
          : `Telegram delivery failed (HTTP ${response.status}).`;
    throw new TelegramDeliveryError(message);
  }
  return result.result?.message_id ?? null;
}

async function deliver(notification: NotificationRow) {
  if (notification.channel === "IN_APP") return { providerMessageId: null };
  if (notification.channel === "TELEGRAM") {
    const buttons: { text: string; url: string }[][] = [];
    const body = notification.body.split("\n").filter((line) => {
      const match = line.match(/^(View in Admin|WhatsApp customer): (https?:\/\/\S+)$/);
      if (!match) return true;
      try {
        const url = new URL(match[2]);
        if (match[1] === "WhatsApp customer" && (url.protocol !== "https:" || url.hostname !== "wa.me")) return true;
        if (match[1] === "View in Admin") {
          const app = new URL(getServerEnv().APP_URL);
          const host = ["localhost", "127.0.0.1"].includes(app.hostname) || app.hostname.startsWith("admin.") ? app.hostname : `admin.${app.hostname}`;
          if (url.hostname !== host || !["http:", "https:"].includes(url.protocol)) return true;
        }
        buttons.push([{ text: match[1] === "View in Admin" ? "View order in Admin" : "WhatsApp customer", url: url.toString() }]);
        return false;
      } catch { return true; }
    }).join("\n").trim();
    const providerMessageId = await sendTelegramMessage(notification.destination, [notification.subject, body].filter(Boolean).join("\n\n"), buttons);
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
  const batchSize = Math.max(1, Math.min(8, Math.trunc(limit) || 1));
  // Old pending-order alerts must not leak out after the paid-only rollout.
  await sql`UPDATE notifications SET status='FAILED',locked_at=NULL,last_error='Suppressed: unpaid-order alerts are disabled.' WHERE channel='TELEGRAM' AND event_type='ORDER_CREATED' AND status IN ('PENDING','PROCESSING')`;
  const pending = await sql<NotificationRow[]>`
    WITH candidates AS (
      SELECT id FROM notifications
      WHERE ((status = 'PENDING' AND scheduled_at <= now()) OR (status = 'PROCESSING' AND locked_at < now() - interval '5 minutes'))
        AND attempts < 5
      ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT ${batchSize}
    )
    UPDATE notifications n SET status = 'PROCESSING', locked_at = now()
    FROM candidates c WHERE n.id = c.id
    RETURNING n.id, n.channel, n.event_type, n.destination, n.subject, n.body, n.attempts
  `;
  let sent = 0;
  let failed = 0;
  await Promise.all(pending.map(async (notification) => {
    try {
      const result = await deliver(notification);
      await sql`UPDATE notifications SET status = 'SENT', provider_message_id = ${result.providerMessageId}, attempts = attempts + 1, sent_at = now(), locked_at = NULL, last_error = NULL WHERE id = ${notification.id}`;
      sent += 1;
    } catch (error) {
      const attempts = notification.attempts + 1;
      const safeFailure = notification.channel === "TELEGRAM"
        ? error instanceof TelegramDeliveryError ? error.message : "Telegram delivery failed. Check bot configuration and credential encryption."
        : error instanceof Error ? error.message.slice(0, 500) : "Notification delivery failed.";
      if (notification.channel === "TELEGRAM") console.error(JSON.stringify({ level: "error", event: "telegram.delivery_failed", notificationId: notification.id, attempt: attempts, reason: safeFailure }));
      await sql`
        UPDATE notifications SET status = ${attempts >= 5 ? "FAILED" : "PENDING"}::notification_status, attempts = attempts + 1,
          scheduled_at = now() + make_interval(mins => LEAST(60, ${2 ** attempts})),
          locked_at = NULL, last_error = ${safeFailure} WHERE id = ${notification.id}
      `;
      failed += 1;
    }
  }));
  return { processed: pending.length, sent, failed };
}
