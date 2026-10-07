import { sql } from "./db";
import { ApiError } from "./http";
import { hashSecret } from "./security";

export async function getGuestOrder(orderNumber: string, accessToken: string) {
  const [order] = await sql<{
    id: string;
    order_number: string;
    status: string;
    customer_name: string;
    customer_phone: string;
    delivery_address: Record<string, unknown>;
    delivery_instructions: string | null;
    currency: string;
    subtotal_minor: number;
    discount_minor: number;
    delivery_fee_minor: number;
    total_minor: number;
    reservation_expires_at: Date | null;
    paid_at: Date | null;
    confirmed_at: Date | null;
    created_at: Date;
    estimated_min_minutes: number | null;
    estimated_max_minutes: number | null;
    payment_status: string;
    provider_receipt: string | null;
    payment_paid_at: Date | null;
  }[]>`
    SELECT o.id, o.order_number, o.status, o.customer_name, o.customer_phone, o.delivery_address,
           o.delivery_instructions, o.currency, o.subtotal_minor, o.discount_minor,
           o.delivery_fee_minor, o.total_minor, o.reservation_expires_at, o.paid_at,
           o.confirmed_at, o.created_at, da.estimated_min_minutes, da.estimated_max_minutes,
           p.status AS payment_status, p.provider_receipt, p.paid_at AS payment_paid_at
    FROM orders o
    LEFT JOIN delivery_areas da ON da.id = o.delivery_area_id
    LEFT JOIN LATERAL (
      SELECT status, provider_receipt, paid_at FROM payments WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1
    ) p ON true
    WHERE o.order_number = ${orderNumber} AND o.access_token_hash = ${hashSecret(accessToken)}
  `;
  if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");

  const [items, events] = await Promise.all([
    sql`
      SELECT product_name, sku, size_label, image_url, quantity, unit_price_minor, line_total_minor
      FROM order_items WHERE order_id = ${order.id} ORDER BY created_at
    `,
    sql`
      SELECT from_status, to_status, source, note, metadata, created_at
      FROM order_events WHERE order_id = ${order.id} ORDER BY created_at
    `,
  ]);
  return {
    orderNumber: order.order_number,
    status: order.status,
    customer: { name: order.customer_name, phone: order.customer_phone },
    delivery: {
      address: order.delivery_address,
      instructions: order.delivery_instructions,
      estimatedMinMinutes: order.estimated_min_minutes,
      estimatedMaxMinutes: order.estimated_max_minutes,
    },
    totals: {
      currency: order.currency,
      subtotal: order.subtotal_minor,
      discount: order.discount_minor,
      deliveryFee: order.delivery_fee_minor,
      total: order.total_minor,
    },
    payment: {
      status: order.payment_status,
      receipt: order.provider_receipt,
      paidAt: order.payment_paid_at,
    },
    reservationExpiresAt: order.reservation_expires_at,
    createdAt: order.created_at,
    confirmedAt: order.confirmed_at,
    items,
    events,
  };
}
