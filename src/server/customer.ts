import { z } from "zod";

import { sql, withTransaction } from "./db";
import { ApiError } from "./http";
import { normalizeKenyanPhone } from "./security";

export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  marketingOptIn: z.boolean().optional(),
});

export const addressSchema = z.object({
  deliveryArea: z.string().trim().min(1).max(160),
  label: z.string().trim().max(60).optional(),
  recipientName: z.string().trim().max(100).optional(),
  phone: z.string().max(25).optional(),
  addressLine: z.string().trim().min(2).max(240),
  landmark: z.string().trim().max(160).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isDefault: z.boolean().default(false),
});

export async function getCustomerProfile(userId: string) {
  const [profile] = await sql`
    SELECT u.id, u.phone, u.email, u.display_name, u.phone_verified_at, u.created_at,
           COALESCE(cp.marketing_opt_in, false) AS marketing_opt_in
    FROM users u LEFT JOIN customer_profiles cp ON cp.user_id = u.id
    WHERE u.id = ${userId}
  `;
  return profile;
}

export async function getCustomerLoyalty(userId: string) {
  const [[account], entries] = await Promise.all([
    sql<{ points_balance: number }[]>`SELECT COALESCE(points_balance,0)::bigint AS points_balance FROM loyalty_accounts WHERE user_id=${userId}`,
    sql<{ entry_type: string; points_delta: number; eligible_spend_minor: number | null; note: string | null; created_at: Date; order_number: string | null }[]>`
      SELECT l.entry_type,l.points_delta,l.eligible_spend_minor,l.note,l.created_at,o.order_number
      FROM loyalty_ledger l LEFT JOIN orders o ON o.id=l.order_id
      WHERE l.user_id=${userId} ORDER BY l.created_at DESC LIMIT 50
    `,
  ]);
  return { pointsBalance: account?.points_balance ?? 0, entries };
}

export async function updateCustomerProfile(userId: string, input: z.infer<typeof profileSchema>) {
  return withTransaction(async (tx) => {
    await tx`UPDATE users SET display_name = ${input.displayName}, updated_at = now() WHERE id = ${userId}`;
    await tx`
      INSERT INTO customer_profiles (user_id, marketing_opt_in) VALUES (${userId}, ${input.marketingOptIn ?? false})
      ON CONFLICT (user_id) DO UPDATE SET marketing_opt_in = EXCLUDED.marketing_opt_in, updated_at = now()
    `;
    const [profile] = await tx`
      SELECT u.id, u.phone, u.email, u.display_name, u.phone_verified_at, u.created_at,
             COALESCE(cp.marketing_opt_in, false) AS marketing_opt_in
      FROM users u LEFT JOIN customer_profiles cp ON cp.user_id = u.id
      WHERE u.id = ${userId}
    `;
    return profile;
  });
}

export async function listAddresses(userId: string) {
  return sql`
    SELECT a.id, a.label, a.recipient_name, a.phone, a.address_line, a.landmark,
           a.latitude, a.longitude, a.is_default, a.created_at,
           da.slug AS delivery_area_slug, da.name AS delivery_area_name, da.secondary_name, da.fee_minor
    FROM addresses a LEFT JOIN delivery_areas da ON da.id = a.delivery_area_id
    WHERE a.user_id = ${userId} ORDER BY a.is_default DESC, a.created_at DESC
  `;
}

export async function saveAddress(userId: string, input: z.infer<typeof addressSchema>, addressId?: string) {
  return withTransaction(async (tx) => {
    const [area] = await tx<{ id: string }[]>`
      SELECT id FROM delivery_areas WHERE active = true AND (slug = ${input.deliveryArea} OR lower(name) = lower(${input.deliveryArea})) LIMIT 1
    `;
    if (!area) throw new ApiError(422, "UNSERVICEABLE_LOCATION", "Choose a supported delivery area.");
    if (input.isDefault) await tx`UPDATE addresses SET is_default = false, updated_at = now() WHERE user_id = ${userId} AND is_default = true`;
    const phone = input.phone ? normalizeKenyanPhone(input.phone) : null;
    if (addressId) {
      const [address] = await tx`
        UPDATE addresses SET delivery_area_id = ${area.id}, label = ${input.label ?? null},
          recipient_name = ${input.recipientName ?? null}, phone = ${phone}, address_line = ${input.addressLine},
          landmark = ${input.landmark ?? null}, latitude = ${input.latitude ?? null}, longitude = ${input.longitude ?? null},
          is_default = ${input.isDefault}, updated_at = now()
        WHERE id = ${addressId} AND user_id = ${userId} RETURNING *
      `;
      if (!address) throw new ApiError(404, "ADDRESS_NOT_FOUND", "Address not found.");
      return address;
    }
    const [address] = await tx`
      INSERT INTO addresses (user_id, delivery_area_id, label, recipient_name, phone, address_line, landmark, latitude, longitude, is_default)
      VALUES (${userId}, ${area.id}, ${input.label ?? null}, ${input.recipientName ?? null}, ${phone}, ${input.addressLine},
        ${input.landmark ?? null}, ${input.latitude ?? null}, ${input.longitude ?? null}, ${input.isDefault}) RETURNING *
    `;
    return address;
  });
}

export async function deleteAddress(userId: string, addressId: string) {
  const deleted = await sql`DELETE FROM addresses WHERE id = ${addressId} AND user_id = ${userId} RETURNING id`;
  if (!deleted.length) throw new ApiError(404, "ADDRESS_NOT_FOUND", "Address not found.");
}

export async function listCustomerOrders(userId: string) {
  return sql`
    SELECT o.order_number, o.status, o.currency, o.total_minor, o.delivery_address, o.created_at,
           o.paid_at, o.delivered_at, count(oi.id)::int AS item_count,
           COALESCE(jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity, 'imageUrl', oi.image_url)
             ORDER BY oi.created_at) FILTER (WHERE oi.id IS NOT NULL), '[]'::jsonb) AS items
    FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.user_id = ${userId}
    GROUP BY o.id ORDER BY o.created_at DESC
  `;
}

export async function getCustomerOrder(userId: string, orderNumber: string) {
  const [order] = await sql<Record<string, unknown>[]>`
    SELECT o.id, o.order_number, o.status, o.currency, o.subtotal_minor, o.discount_minor,
           o.delivery_fee_minor, o.total_minor, o.delivery_address, o.delivery_instructions,
           o.created_at, o.paid_at, o.confirmed_at, o.delivered_at,
           p.status AS payment_status, p.provider_receipt, p.paid_at AS payment_paid_at,
           da.estimated_min_minutes, da.estimated_max_minutes
    FROM orders o LEFT JOIN payments p ON p.order_id = o.id
    LEFT JOIN delivery_areas da ON da.id = o.delivery_area_id
    WHERE o.user_id = ${userId} AND o.order_number = ${orderNumber}
  `;
  if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
  const [items, events] = await Promise.all([
    sql`SELECT product_name, size_label, image_url, quantity, unit_price_minor, line_total_minor FROM order_items WHERE order_id = ${String(order.id)} ORDER BY created_at`,
    sql`SELECT from_status, to_status, note, created_at FROM order_events WHERE order_id = ${String(order.id)} ORDER BY created_at`,
  ]);
  return { ...order, items, events };
}

export async function listFavourites(userId: string) {
  return sql`
    SELECT p.slug, p.name, p.image_url, pv.price_minor, pv.size_label,
           GREATEST(0, i.on_hand_quantity - i.reserved_quantity)::int AS available_quantity
    FROM favourites f JOIN products p ON p.id = f.product_id
    JOIN product_variants pv ON pv.product_id = p.id AND pv.is_default = true
    JOIN inventory i ON i.variant_id = pv.id AND i.storefront_enabled = true
    WHERE f.user_id = ${userId} ORDER BY f.created_at DESC
  `;
}

export async function setFavourite(userId: string, productSlug: string, favourite: boolean) {
  const [product] = await sql<{ id: string }[]>`SELECT id FROM products WHERE slug = ${productSlug} AND active = true`;
  if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  if (favourite) await sql`INSERT INTO favourites (user_id, product_id) VALUES (${userId}, ${product.id}) ON CONFLICT DO NOTHING`;
  else await sql`DELETE FROM favourites WHERE user_id = ${userId} AND product_id = ${product.id}`;
  return { productSlug, favourite };
}

export async function listNotifications(userId: string) {
  return sql`
    SELECT id, event_type, subject, body, status, created_at, sent_at
    FROM notifications WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 100
  `;
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const updated = await sql`
    UPDATE notifications SET status = 'READ' WHERE id = ${notificationId} AND user_id = ${userId} RETURNING id
  `;
  if (!updated.length) throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "Notification not found.");
}
