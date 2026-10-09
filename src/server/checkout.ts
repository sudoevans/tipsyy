import { z } from "zod";

import { evaluateInventoryNotifications } from "./admin-notifications";
import { sql, type Transaction, withTransaction } from "./db";
import { ApiError } from "./http";
import {
  createOpaqueToken,
  hashSecret,
  normalizeKenyanPhone,
} from "./security";

const checkoutItemSchema = z.object({
  productSlug: z.string().min(1).max(120),
  quantity: z.number().int().min(1).max(100),
});

export const createOrderSchema = z.object({
  items: z.array(checkoutItemSchema).min(1).max(100),
  customer: z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().min(9).max(25),
  }),
  delivery: z.object({
    area: z.string().trim().min(2).max(160),
    addressLine: z.string().trim().min(2).max(240),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    instructions: z.string().trim().max(500).optional(),
  }),
  couponCode: z.string().trim().max(40).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const cartQuoteSchema = z.object({
  items: z.array(checkoutItemSchema).min(1).max(100),
  deliveryArea: z.string().trim().max(160).optional(),
  couponCode: z.string().trim().max(40).optional(),
});

interface ProductRow {
  variant_id: string;
  product_id: string;
  product_slug: string;
  product_name: string;
  image_url: string | null;
  category_id: string;
  sku: string;
  size_label: string | null;
  price_minor: number;
  on_hand_quantity: number;
  reserved_quantity: number;
}

interface DeliveryAreaRow {
  id: string;
  slug: string;
  name: string;
  secondary_name: string | null;
  fee_minor: number;
  estimated_min_minutes: number | null;
  estimated_max_minutes: number | null;
}

interface CouponRow {
  coupon_id: string;
  promotion_id: string;
  kind: "PERCENTAGE" | "FIXED_AMOUNT";
  percentage_basis_points: number | null;
  amount_minor: number | null;
  usage_limit: number | null;
  usage_count: number;
  customer_usage_limit: number | null;
  minimum_order_minor: number;
}

const RESERVATION_MINUTES = 10;

/**
 * Guest checkout begins a customer record early, so incomplete payments are
 * still visible to operations without granting the customer an active account.
 */
export async function ensureCheckoutCustomerAccount(
  tx: Transaction,
  name: string,
  phone: string,
) {
  const [customer] = await tx<{ id: string; role: string }[]>`
    INSERT INTO users (phone, display_name, role, status)
    VALUES (${phone}, ${name}, 'CUSTOMER', 'PENDING')
    ON CONFLICT (phone) DO UPDATE
      SET display_name = COALESCE(NULLIF(users.display_name, ''), EXCLUDED.display_name),
          updated_at = now()
      WHERE users.role = 'CUSTOMER'
    RETURNING id, role::text AS role
  `;
  if (!customer || customer.role !== "CUSTOMER") return null;

  await tx`
    INSERT INTO customer_profiles (user_id, legal_name)
    VALUES (${customer.id}, ${name})
    ON CONFLICT (user_id) DO UPDATE
      SET legal_name = COALESCE(NULLIF(customer_profiles.legal_name, ''), EXCLUDED.legal_name),
          updated_at = now()
  `;
  return customer.id;
}

export async function releaseCouponForOrder(tx: Transaction, orderId: string) {
  const redemptions = await tx<{ promotion_id: string }[]>`
    DELETE FROM coupon_redemptions cr
    USING coupons c
    WHERE cr.order_id = ${orderId} AND c.id = cr.coupon_id
    RETURNING c.promotion_id
  `;
  for (const redemption of redemptions) {
    await tx`UPDATE promotions SET usage_count = GREATEST(0, usage_count - 1), updated_at = now() WHERE id = ${redemption.promotion_id}`;
  }
}

export async function releaseOrderReservations(
  tx: Transaction,
  orderId: string,
  status: "RELEASED" | "EXPIRED" = "RELEASED",
) {
  const reservations = await tx<
    { id: string; variant_id: string; quantity: number }[]
  >`
    SELECT r.id, r.variant_id, r.quantity
    FROM inventory_reservations r
    JOIN inventory i ON i.variant_id = r.variant_id
    WHERE r.order_id = ${orderId} AND r.status = 'ACTIVE'
    FOR UPDATE OF r, i
  `;
  for (const reservation of reservations) {
    await tx`
      UPDATE inventory SET reserved_quantity = GREATEST(0, reserved_quantity - ${reservation.quantity}), updated_at = now()
      WHERE variant_id = ${reservation.variant_id}
    `;
    await tx`
      UPDATE inventory_reservations
      SET status = ${status}, released_at = now()
      WHERE id = ${reservation.id}
    `;
  }
  await releaseCouponForOrder(tx, orderId);
  await evaluateInventoryNotifications(tx);
}

export async function convertOrderReservations(
  tx: Transaction,
  orderId: string,
) {
  const reservations = await tx<
    { id: string; variant_id: string; quantity: number }[]
  >`
    SELECT r.id, r.variant_id, r.quantity
    FROM inventory_reservations r
    JOIN inventory i ON i.variant_id = r.variant_id
    WHERE r.order_id = ${orderId} AND r.status = 'ACTIVE'
    FOR UPDATE OF r, i
  `;
  if (reservations.length === 0)
    throw new ApiError(
      409,
      "RESERVATION_NOT_ACTIVE",
      "The stock reservation is no longer active.",
    );
  for (const reservation of reservations) {
    await tx`
      UPDATE inventory
      SET on_hand_quantity = on_hand_quantity - ${reservation.quantity},
          reserved_quantity = reserved_quantity - ${reservation.quantity},
          sold_quantity = sold_quantity + ${reservation.quantity},
          updated_at = now()
      WHERE variant_id = ${reservation.variant_id}
    `;
    await tx`
      UPDATE inventory_reservations
      SET status = 'CONVERTED', converted_at = now()
      WHERE id = ${reservation.id}
    `;
  }
  await evaluateInventoryNotifications(tx);
}

export async function releaseExpiredReservations(tx: Transaction) {
  const expired = await tx<
    { id: string; order_id: string; variant_id: string; quantity: number }[]
  >`
    SELECT r.id, r.order_id, r.variant_id, r.quantity
    FROM inventory_reservations r
    JOIN inventory i ON i.variant_id = r.variant_id
    WHERE r.status = 'ACTIVE' AND r.expires_at <= now()
    FOR UPDATE OF r, i SKIP LOCKED
  `;

  const orderIds = new Set<string>();
  for (const reservation of expired) {
    await tx`
      UPDATE inventory
      SET reserved_quantity = GREATEST(0, reserved_quantity - ${reservation.quantity}), updated_at = now()
      WHERE variant_id = ${reservation.variant_id}
    `;
    await tx`
      UPDATE inventory_reservations
      SET status = 'EXPIRED', released_at = now()
      WHERE id = ${reservation.id}
    `;
    orderIds.add(reservation.order_id);
  }

  for (const orderId of orderIds) {
    const [order] = await tx<{ status: string }[]>`
      UPDATE orders
      SET status = 'PAYMENT_CANCELLED', cancelled_at = now(), updated_at = now()
      WHERE id = ${orderId} AND status = 'PENDING_PAYMENT'
      RETURNING status
    `;
    if (!order) continue;
    await tx`UPDATE payments SET status = 'TIMED_OUT', updated_at = now() WHERE order_id = ${orderId} AND status = 'PENDING'`;
    await tx`
      UPDATE payment_attempts pa SET status = 'TIMED_OUT', completed_at = now()
      FROM payments p WHERE pa.payment_id = p.id AND p.order_id = ${orderId} AND pa.status = 'PENDING'
    `;
    await releaseCouponForOrder(tx, orderId);
    await tx`
      INSERT INTO order_events (order_id, from_status, to_status, source, note)
      VALUES (${orderId}, 'PENDING_PAYMENT', 'PAYMENT_CANCELLED', 'reservation-expiry', 'Stock reservation expired before payment completed.')
    `;
  }
  if (orderIds.size) await evaluateInventoryNotifications(tx);
}

export async function expireReservations() {
  return withTransaction(async (tx) => {
    await releaseExpiredReservations(tx);
    await evaluateInventoryNotifications(tx);
    const [{ count }] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count FROM inventory_reservations WHERE status = 'EXPIRED' AND released_at > now() - interval '5 minutes'
    `;
    return count;
  });
}

async function calculateCoupon(
  tx: Transaction,
  code: string | undefined,
  phone: string,
  items: Array<ProductRow & { quantity: number }>,
  subtotal: number,
) {
  if (!code) return { discount: 0, coupon: null as CouponRow | null };
  const [coupon] = await tx<CouponRow[]>`
    SELECT c.id AS coupon_id, p.id AS promotion_id, p.kind, p.percentage_basis_points,
           p.amount_minor, p.usage_limit, p.usage_count, c.customer_usage_limit, p.minimum_order_minor
    FROM coupons c
    JOIN promotions p ON p.id = c.promotion_id
    WHERE c.code = ${code} AND c.active = true AND p.active = true
      AND (p.starts_at IS NULL OR p.starts_at <= now())
      AND (p.ends_at IS NULL OR p.ends_at > now())
    FOR UPDATE OF c, p
  `;
  if (!coupon)
    throw new ApiError(
      422,
      "INVALID_COUPON",
      "This coupon is invalid or has expired.",
    );
  if (subtotal < coupon.minimum_order_minor) {
    throw new ApiError(
      422,
      "COUPON_MINIMUM_NOT_MET",
      `This coupon requires a minimum order of KSh ${coupon.minimum_order_minor.toLocaleString("en-KE")}.`,
    );
  }
  if (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit) {
    throw new ApiError(
      422,
      "COUPON_LIMIT_REACHED",
      "This coupon has reached its usage limit.",
    );
  }
  if (coupon.customer_usage_limit !== null) {
    const [{ count }] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count FROM coupon_redemptions
      WHERE coupon_id = ${coupon.coupon_id} AND customer_phone = ${phone}
    `;
    if (count >= coupon.customer_usage_limit) {
      throw new ApiError(
        422,
        "COUPON_CUSTOMER_LIMIT_REACHED",
        "You have already used this coupon the maximum number of times.",
      );
    }
  }

  const productRestrictions = await tx<{ product_id: string }[]>`
    SELECT product_id FROM promotion_products WHERE promotion_id = ${coupon.promotion_id}
  `;
  const categoryRestrictions = await tx<{ category_id: string }[]>`
    SELECT category_id FROM promotion_categories WHERE promotion_id = ${coupon.promotion_id}
  `;
  const productIds = new Set(productRestrictions.map((row) => row.product_id));
  const categoryIds = new Set(
    categoryRestrictions.map((row) => row.category_id),
  );
  const restricted = productIds.size > 0 || categoryIds.size > 0;
  const eligibleSubtotal = items.reduce((sum, item) => {
    const eligible =
      !restricted ||
      productIds.has(item.product_id) ||
      categoryIds.has(item.category_id);
    return eligible ? sum + item.price_minor * item.quantity : sum;
  }, 0);
  if (eligibleSubtotal === 0)
    throw new ApiError(
      422,
      "COUPON_NOT_APPLICABLE",
      "This coupon does not apply to the items in your cart.",
    );

  const calculated =
    coupon.kind === "PERCENTAGE"
      ? Math.floor(
          (eligibleSubtotal * (coupon.percentage_basis_points ?? 0)) / 10_000,
        )
      : Math.min(eligibleSubtotal, coupon.amount_minor ?? 0);
  return { discount: Math.min(subtotal, calculated), coupon };
}

export async function createCheckoutOrder(
  input: CreateOrderInput,
  cartId?: string,
) {
  const phone = normalizeKenyanPhone(input.customer.phone);
  const accessToken = createOpaqueToken();
  const accessTokenHash = hashSecret(accessToken);
  const quantities = new Map<string, number>();
  for (const item of input.items)
    quantities.set(
      item.productSlug,
      (quantities.get(item.productSlug) ?? 0) + item.quantity,
    );

  return withTransaction(async (tx) => {
    const [deliveryArea] = await tx<DeliveryAreaRow[]>`
      SELECT id, slug, name, secondary_name, fee_minor, estimated_min_minutes, estimated_max_minutes
      FROM delivery_areas
      WHERE active = true AND (slug = ${input.delivery.area} OR lower(name) = lower(${input.delivery.area}))
      LIMIT 1
    `;
    if (!deliveryArea) {
      throw new ApiError(
        422,
        "UNSERVICEABLE_LOCATION",
        "We do not currently deliver to that location. Choose a supported delivery area.",
      );
    }

    const slugs = [...quantities.keys()];
    const rows = await tx<ProductRow[]>`
      SELECT pv.id AS variant_id, p.id AS product_id, p.slug AS product_slug, p.name AS product_name,
             p.image_url, p.category_id, pv.sku, pv.size_label, pv.price_minor,
             i.on_hand_quantity, i.reserved_quantity
      FROM products p
      JOIN product_variants pv ON pv.product_id = p.id AND pv.is_default = true AND pv.active = true
      JOIN inventory i ON i.variant_id = pv.id
      WHERE p.active = true AND p.slug IN (SELECT jsonb_array_elements_text(${JSON.stringify(slugs)}::text::jsonb))
      FOR UPDATE OF i
    `;
    if (rows.length !== slugs.length) {
      const found = new Set(rows.map((row) => row.product_slug));
      throw new ApiError(
        409,
        "CART_ITEM_UNAVAILABLE",
        "One or more cart items are no longer available.",
        {
          unavailable: slugs.filter((slug) => !found.has(slug)),
        },
      );
    }

    const items = rows.map((row) => ({
      ...row,
      quantity: quantities.get(row.product_slug)!,
    }));
    for (const item of items) {
      const available = item.on_hand_quantity - item.reserved_quantity;
      if (item.quantity > available) {
        throw new ApiError(
          409,
          "INSUFFICIENT_STOCK",
          `${item.product_name} has only ${available} available.`,
          {
            productSlug: item.product_slug,
            available,
          },
        );
      }
    }

    const subtotal = items.reduce(
      (sum, item) => sum + item.price_minor * item.quantity,
      0,
    );
    const { coupon, discount } = await calculateCoupon(
      tx,
      input.couponCode,
      phone,
      items,
      subtotal,
    );
    const total = subtotal - discount + deliveryArea.fee_minor;
    const reservationExpiresAt = new Date(
      Date.now() + RESERVATION_MINUTES * 60_000,
    );
    const customerUserId = await ensureCheckoutCustomerAccount(
      tx,
      input.customer.name.trim(),
      phone,
    );
    const address = {
      areaSlug: deliveryArea.slug,
      areaName: deliveryArea.name,
      secondaryName: deliveryArea.secondary_name,
      addressLine: input.delivery.addressLine,
      latitude: input.delivery.latitude,
      longitude: input.delivery.longitude,
    };

    const [order] = await tx<
      { id: string; order_number: string; created_at: Date }[]
    >`
      INSERT INTO orders (
        access_token_hash, user_id, cart_id, delivery_area_id, customer_name, customer_phone, delivery_address,
        delivery_instructions, subtotal_minor, discount_minor, delivery_fee_minor, total_minor,
        coupon_code, reservation_expires_at
      ) VALUES (
        ${accessTokenHash}, ${customerUserId}, ${cartId ?? null}, ${deliveryArea.id}, ${input.customer.name.trim()}, ${phone}, ${tx.json(address)},
        ${input.delivery.instructions ?? null}, ${subtotal}, ${discount}, ${deliveryArea.fee_minor}, ${total},
        ${input.couponCode?.toUpperCase() ?? null}, ${reservationExpiresAt}
      )
      RETURNING id, order_number, created_at
    `;

    for (const item of items) {
      await tx`
        INSERT INTO order_items (
          order_id, product_id, variant_id, product_name, sku, size_label, image_url,
          quantity, unit_price_minor, line_total_minor
        ) VALUES (
          ${order.id}, ${item.product_id}, ${item.variant_id}, ${item.product_name}, ${item.sku},
          ${item.size_label}, ${item.image_url}, ${item.quantity}, ${item.price_minor}, ${item.price_minor * item.quantity}
        )
      `;
      await tx`
        UPDATE inventory SET reserved_quantity = reserved_quantity + ${item.quantity}, updated_at = now()
        WHERE variant_id = ${item.variant_id}
      `;
      await tx`
        INSERT INTO inventory_reservations (order_id, variant_id, quantity, expires_at)
        VALUES (${order.id}, ${item.variant_id}, ${item.quantity}, ${reservationExpiresAt})
      `;
    }
    await evaluateInventoryNotifications(tx);

    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (order_id, amount_minor, payer_phone)
      VALUES (${order.id}, ${total}, ${phone})
      RETURNING id
    `;
    await tx`
      INSERT INTO order_events (order_id, to_status, source, note, metadata)
      VALUES (${order.id}, 'PENDING_PAYMENT', 'checkout', 'Order created and stock reserved.', ${tx.json({ reservationExpiresAt })})
    `;
    if (coupon) {
      await tx`
        UPDATE promotions SET usage_count = usage_count + 1, updated_at = now()
        WHERE id = ${coupon.promotion_id}
      `;
      await tx`
        INSERT INTO coupon_redemptions (coupon_id, customer_phone, order_id, discount_minor)
        VALUES (${coupon.coupon_id}, ${phone}, ${order.id}, ${discount})
      `;
    }
    if (cartId)
      await tx`UPDATE carts SET status = 'CONVERTED', updated_at = now() WHERE id = ${cartId} AND status = 'ACTIVE'`;

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      paymentId: payment.id,
      accessToken,
      status: "PENDING_PAYMENT" as const,
      currency: "KES",
      subtotal,
      discount,
      deliveryFee: deliveryArea.fee_minor,
      total,
      reservationExpiresAt: reservationExpiresAt.toISOString(),
      delivery: {
        area: deliveryArea.name,
        addressLine: input.delivery.addressLine,
        estimatedMinMinutes: deliveryArea.estimated_min_minutes,
        estimatedMaxMinutes: deliveryArea.estimated_max_minutes,
      },
      items: items.map((item) => ({
        productSlug: item.product_slug,
        name: item.product_name,
        imageUrl: item.image_url,
        size: item.size_label,
        quantity: item.quantity,
        unitPrice: item.price_minor,
        lineTotal: item.price_minor * item.quantity,
        availableAfterReservation:
          item.on_hand_quantity - item.reserved_quantity - item.quantity,
      })),
    };
  });
}

export async function getCatalog() {
  return sql`
    SELECT p.slug, p.name, p.description, p.image_url, p.alcohol_by_volume, p.featured,
           c.slug AS category_slug, c.name AS category_name, b.name AS brand_name,
           pv.sku, pv.label, pv.size_label, pv.price_minor, pv.compare_at_price_minor, pv.currency,
           GREATEST(0, i.on_hand_quantity - i.reserved_quantity) AS available_quantity
    FROM products p
    JOIN categories c ON c.id = p.category_id AND c.active = true
    LEFT JOIN brands b ON b.id = p.brand_id
    JOIN product_variants pv ON pv.product_id = p.id AND pv.is_default = true AND pv.active = true
    JOIN inventory i ON i.variant_id = pv.id
    WHERE p.active = true
    ORDER BY p.featured DESC, p.name
  `;
}

export async function quoteCart(input: z.infer<typeof cartQuoteSchema>) {
  const quantities = new Map<string, number>();
  for (const item of input.items)
    quantities.set(
      item.productSlug,
      (quantities.get(item.productSlug) ?? 0) + item.quantity,
    );
  return withTransaction(async (tx) => {
    const slugs = [...quantities.keys()];
    const rows = await tx<ProductRow[]>`
      SELECT pv.id AS variant_id, p.id AS product_id, p.slug AS product_slug, p.name AS product_name,
             p.image_url, p.category_id, pv.sku, pv.size_label, pv.price_minor,
             i.on_hand_quantity, i.reserved_quantity
      FROM products p JOIN product_variants pv ON pv.product_id = p.id AND pv.is_default = true AND pv.active = true
      JOIN inventory i ON i.variant_id = pv.id
      WHERE p.active = true AND p.slug IN (SELECT jsonb_array_elements_text(${JSON.stringify(slugs)}::text::jsonb))
    `;
    if (rows.length !== slugs.length)
      throw new ApiError(
        409,
        "CART_ITEM_UNAVAILABLE",
        "One or more cart items are no longer available.",
      );
    const items = rows.map((row) => ({
      ...row,
      quantity: quantities.get(row.product_slug)!,
    }));
    for (const item of items) {
      const available = item.on_hand_quantity - item.reserved_quantity;
      if (item.quantity > available)
        throw new ApiError(
          409,
          "INSUFFICIENT_STOCK",
          `${item.product_name} has only ${available} available.`,
          { productSlug: item.product_slug, available },
        );
    }
    const subtotal = items.reduce(
      (sum, item) => sum + item.price_minor * item.quantity,
      0,
    );
    const { discount } = await calculateCoupon(
      tx,
      input.couponCode,
      "guest",
      items,
      subtotal,
    );
    let deliveryFee = 0;
    if (input.deliveryArea) {
      const [area] = await tx<{ fee_minor: number }[]>`
        SELECT fee_minor FROM delivery_areas WHERE active = true AND (slug = ${input.deliveryArea} OR lower(name) = lower(${input.deliveryArea})) LIMIT 1
      `;
      if (!area)
        throw new ApiError(
          422,
          "UNSERVICEABLE_LOCATION",
          "Choose a supported delivery area.",
        );
      deliveryFee = area.fee_minor;
    }
    return {
      currency: "KES",
      subtotal,
      discount,
      deliveryFee,
      total: subtotal - discount + deliveryFee,
    };
  });
}
