import { sql, type Database, type Transaction } from "./db";

type NotificationSeverity = "INFO" | "WARNING" | "CRITICAL";

type PublishInput = {
  eventType: string;
  entityType: string;
  entityId: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  href?: string | null;
};

export async function publishAdminNotification(
  tx: Transaction | Database,
  input: PublishInput,
) {
  const [notification] = await tx<{ id: string }[]>`
    INSERT INTO admin_notifications (event_type, entity_type, entity_id, severity, title, body, href)
    VALUES (${input.eventType}, ${input.entityType}, ${input.entityId}, ${input.severity}, ${input.title}, ${input.body}, ${input.href ?? null})
    ON CONFLICT (event_type, entity_type, entity_id) WHERE resolved_at IS NULL
    DO UPDATE SET severity = EXCLUDED.severity, title = EXCLUDED.title, body = EXCLUDED.body, href = EXCLUDED.href
    RETURNING id
  `;
  const staff = await tx<{ id: string }[]>`
    SELECT id FROM users WHERE role IN ('ADMIN', 'SUPPORT') AND status = 'ACTIVE'
  `;
  for (const user of staff) {
    await tx`
      INSERT INTO admin_notification_recipients (notification_id, user_id)
      VALUES (${notification.id}, ${user.id})
      ON CONFLICT (notification_id, user_id) DO NOTHING
    `;
  }
  return notification.id;
}

export async function resolveAdminNotification(
  tx: Transaction | Database,
  eventType: string,
  entityType: string,
  entityId: string,
) {
  await tx`
    UPDATE admin_notifications SET resolved_at = now()
    WHERE event_type = ${eventType} AND entity_type = ${entityType}
      AND entity_id = ${entityId} AND resolved_at IS NULL
  `;
}

export async function evaluateInventoryNotifications(tx: Transaction | Database) {
  const current = await tx<
    { variant_id: string; product_name: string; size_label: string | null; available: number; threshold: number }[]
  >`
    SELECT i.variant_id, p.name AS product_name, pv.size_label,
           (i.on_hand_quantity - i.reserved_quantity)::int AS available,
           i.low_stock_threshold::int AS threshold
    FROM inventory i
    JOIN product_variants pv ON pv.id = i.variant_id
    JOIN products p ON p.id = pv.product_id
    WHERE i.on_hand_quantity - i.reserved_quantity <= i.low_stock_threshold
  `;

  const active = new Set<string>();
  for (const item of current) {
    const isOut = item.available <= 0;
    const eventType = isOut ? "INVENTORY_OUT_OF_STOCK" : "INVENTORY_LOW_STOCK";
    active.add(`${eventType}:${item.variant_id}`);
    await publishAdminNotification(tx, {
      eventType,
      entityType: "inventory_variant",
      entityId: item.variant_id,
      severity: isOut ? "CRITICAL" : "WARNING",
      title: isOut ? "Product is out of stock" : "Low stock alert",
      body: `${item.product_name}${item.size_label ? ` — ${item.size_label}` : ""} has ${item.available} unit${item.available === 1 ? "" : "s"} available.`,
      href: "/admin/inventory",
    });
    await resolveAdminNotification(
      tx,
      isOut ? "INVENTORY_LOW_STOCK" : "INVENTORY_OUT_OF_STOCK",
      "inventory_variant",
      item.variant_id,
    );
  }

  const open = await tx<{ id: string; event_type: string; entity_id: string }[]>`
    SELECT id, event_type, entity_id FROM admin_notifications
    WHERE entity_type = 'inventory_variant'
      AND event_type IN ('INVENTORY_LOW_STOCK', 'INVENTORY_OUT_OF_STOCK')
      AND resolved_at IS NULL
  `;
  for (const notification of open) {
    if (!active.has(`${notification.event_type}:${notification.entity_id}`)) {
      await tx`UPDATE admin_notifications SET resolved_at = now() WHERE id = ${notification.id}`;
    }
  }
}

export async function getAdminNotificationSummary(userId: string) {
  const [[counts], [inventory], [investigations]] = await Promise.all([
    sql<{ unread: number; new_orders: number }[]>`
      SELECT COUNT(*) FILTER (WHERE r.read_at IS NULL)::int AS unread,
             COUNT(*) FILTER (WHERE r.read_at IS NULL AND n.event_type = 'ORDER_READY')::int AS new_orders
      FROM admin_notification_recipients r
      JOIN admin_notifications n ON n.id = r.notification_id
      WHERE r.user_id = ${userId}
    `,
    sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM inventory
      WHERE on_hand_quantity - reserved_quantity <= low_stock_threshold
    `,
    sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM payment_investigations
      WHERE status IN ('OPEN', 'RECONCILING', 'MATCHED')
    `,
  ]);
  return {
    unread: counts?.unread ?? 0,
    newOrders: counts?.new_orders ?? 0,
    lowStock: inventory?.count ?? 0,
    openInvestigations: investigations?.count ?? 0,
  };
}

export async function listAdminNotifications(userId: string, page = 1, pageSize = 6) {
  const safePage = Math.max(1, Math.min(page, 1000));
  const safeSize = Math.max(1, Math.min(pageSize, 25));
  const offset = (safePage - 1) * safeSize;
  const [items, [count]] = await Promise.all([
    sql<{
      id: string;
      event_type: string;
      severity: NotificationSeverity;
      title: string;
      body: string;
      href: string | null;
      created_at: Date;
      resolved_at: Date | null;
      read_at: Date | null;
    }[]>`
      SELECT n.id, n.event_type, n.severity::text AS severity, n.title, n.body, n.href,
             n.created_at, n.resolved_at, r.read_at
      FROM admin_notification_recipients r
      JOIN admin_notifications n ON n.id = r.notification_id
      WHERE r.user_id = ${userId}
      ORDER BY n.created_at DESC
      LIMIT ${safeSize} OFFSET ${offset}
    `,
    sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM admin_notification_recipients
      WHERE user_id = ${userId}
    `,
  ]);
  return { items, page: safePage, pageSize: safeSize, total: count?.count ?? 0 };
}

export async function markAdminNotificationRead(userId: string, notificationId: string) {
  const updated = await sql`
    UPDATE admin_notification_recipients SET read_at = COALESCE(read_at, now())
    WHERE user_id = ${userId} AND notification_id = ${notificationId}
    RETURNING notification_id
  `;
  return updated.length > 0;
}

export async function markAllAdminNotificationsRead(userId: string) {
  await sql`
    UPDATE admin_notification_recipients SET read_at = now()
    WHERE user_id = ${userId} AND read_at IS NULL
  `;
}
