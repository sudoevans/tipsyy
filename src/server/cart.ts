import { z } from "zod";

import { getUserFromSession } from "./auth";
import { type Transaction, withTransaction } from "./db";
import { ApiError } from "./http";
import { createOpaqueToken, hashSecret } from "./security";

export const cartSnapshotSchema = z.object({
  items: z.array(z.object({
    productSlug: z.string().min(1).max(120),
    quantity: z.number().int().min(1).max(100),
  })).max(100),
  deliveryArea: z.string().trim().max(160).optional(),
  couponCode: z.string().trim().max(40).optional(),
});

type CartIdentity = { userId: string | null; guestToken: string | null; isNewGuest: boolean };

export async function resolveCartIdentity(sessionToken?: string, guestToken?: string): Promise<CartIdentity> {
  const user = await getUserFromSession(sessionToken);
  if (user) return { userId: user.id, guestToken: guestToken ?? null, isNewGuest: false };
  if (guestToken) return { userId: null, guestToken, isNewGuest: false };
  return { userId: null, guestToken: createOpaqueToken(), isNewGuest: true };
}

async function findOrCreateCart(tx: Transaction, identity: CartIdentity) {
  if (identity.userId) {
    const [cart] = await tx<{ id: string }[]>`
      SELECT id FROM carts WHERE user_id = ${identity.userId} AND status = 'ACTIVE'
      ORDER BY updated_at DESC LIMIT 1 FOR UPDATE
    `;
    if (cart) return cart.id;
    const [created] = await tx<{ id: string }[]>`
      INSERT INTO carts (user_id, expires_at) VALUES (${identity.userId}, now() + interval '30 days') RETURNING id
    `;
    return created.id;
  }

  const guestHash = hashSecret(identity.guestToken!);
  // A completed guest cart keeps its token for order history. Serialize creation
  // of the next active cart for that same browser so concurrent cart requests
  // cannot create two active carts.
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${guestHash}, 0))`;
  const [cart] = await tx<{ id: string }[]>`
    SELECT id FROM carts WHERE guest_token_hash = ${guestHash} AND status = 'ACTIVE' FOR UPDATE
  `;
  if (cart) return cart.id;
  const [created] = await tx<{ id: string }[]>`
    INSERT INTO carts (guest_token_hash, expires_at) VALUES (${guestHash}, now() + interval '30 days') RETURNING id
  `;
  return created.id;
}

async function cartResponse(tx: Transaction, cartId: string) {
  const [cart] = await tx<{
    id: string; coupon_code: string | null; delivery_area_slug: string | null;
    delivery_area_name: string | null; delivery_fee_minor: number | null;
  }[]>`
    SELECT c.id, c.coupon_code, da.slug AS delivery_area_slug, da.name AS delivery_area_name,
           da.fee_minor AS delivery_fee_minor
    FROM carts c LEFT JOIN delivery_areas da ON da.id = c.delivery_area_id
    WHERE c.id = ${cartId}
  `;
  const items = await tx<{
    id: string; product_slug: string; name: string; image_url: string | null; size_label: string | null;
    quantity: number; price_minor: number; unit_price_snapshot_minor: number | null; available_quantity: number; active: boolean;
  }[]>`
    SELECT ci.id, p.slug AS product_slug, p.name, p.image_url, pv.size_label, ci.quantity,
           pv.price_minor, ci.unit_price_snapshot_minor, GREATEST(0, i.on_hand_quantity - i.reserved_quantity)::int AS available_quantity,
           (p.active AND pv.active) AS active
    FROM cart_items ci
    JOIN product_variants pv ON pv.id = ci.variant_id
    JOIN products p ON p.id = pv.product_id
    JOIN inventory i ON i.variant_id = pv.id
    WHERE ci.cart_id = ${cartId}
    ORDER BY ci.created_at
  `;
  const subtotal = items.reduce((sum, item) => sum + item.price_minor * Math.min(item.quantity, item.available_quantity), 0);
  return {
    id: cart.id,
    items: items.map((item) => ({
      id: item.id,
      productSlug: item.product_slug,
      name: item.name,
      imageUrl: item.image_url,
      size: item.size_label,
      quantity: item.quantity,
      unitPrice: item.price_minor,
      lineTotal: item.price_minor * item.quantity,
      availableQuantity: item.available_quantity,
      available: item.active && item.available_quantity > 0,
      priceChanged: item.unit_price_snapshot_minor !== null && item.unit_price_snapshot_minor !== item.price_minor,
      previousUnitPrice: item.unit_price_snapshot_minor,
    })),
    deliveryArea: cart.delivery_area_slug ? { slug: cart.delivery_area_slug, name: cart.delivery_area_name } : null,
    couponCode: cart.coupon_code,
    totals: { subtotal, discount: 0, deliveryFee: cart.delivery_fee_minor ?? 0, total: subtotal + (cart.delivery_fee_minor ?? 0), currency: "KES" },
  };
}

export async function getCart(identity: CartIdentity) {
  return withTransaction(async (tx) => cartResponse(tx, await findOrCreateCart(tx, identity)));
}

export async function replaceCart(identity: CartIdentity, input: z.infer<typeof cartSnapshotSchema>) {
  return withTransaction(async (tx) => {
    const cartId = await findOrCreateCart(tx, identity);
    const merged = new Map<string, number>();
    for (const item of input.items) merged.set(item.productSlug, (merged.get(item.productSlug) ?? 0) + item.quantity);
    const slugs = [...merged.keys()];
    const variants = slugs.length === 0 ? [] : await tx<{
      id: string; slug: string; available_quantity: number; active: boolean;
    }[]>`
      SELECT pv.id, p.slug, GREATEST(0, i.on_hand_quantity - i.reserved_quantity)::int AS available_quantity,
             (p.active AND pv.active) AS active
      FROM products p JOIN product_variants pv ON pv.product_id = p.id AND pv.is_default = true
      JOIN inventory i ON i.variant_id = pv.id
      WHERE p.slug IN (SELECT jsonb_array_elements_text(${JSON.stringify(slugs)}::text::jsonb))
      FOR UPDATE OF i
    `;
    const bySlug = new Map(variants.map((row) => [row.slug, row]));
    const unavailable = slugs.filter((slug) => !bySlug.get(slug)?.active);
    if (unavailable.length) throw new ApiError(409, "CART_ITEM_UNAVAILABLE", "One or more items are no longer available.", { unavailable });
    for (const [slug, quantity] of merged) {
      const variant = bySlug.get(slug)!;
      if (quantity > variant.available_quantity) {
        throw new ApiError(409, "INSUFFICIENT_STOCK", `${slug} has only ${variant.available_quantity} available.`, { productSlug: slug, available: variant.available_quantity });
      }
    }

    let deliveryAreaId: string | null = null;
    if (input.deliveryArea) {
      const [area] = await tx<{ id: string }[]>`
        SELECT id FROM delivery_areas WHERE active = true AND (slug = ${input.deliveryArea} OR lower(name) = lower(${input.deliveryArea})) LIMIT 1
      `;
      if (!area) throw new ApiError(422, "UNSERVICEABLE_LOCATION", "Choose a supported delivery area.");
      deliveryAreaId = area.id;
    }
    await tx`DELETE FROM cart_items WHERE cart_id = ${cartId}`;
    for (const [slug, quantity] of merged) {
      await tx`
        INSERT INTO cart_items (cart_id, variant_id, quantity, unit_price_snapshot_minor)
        SELECT ${cartId}, pv.id, ${quantity}, pv.price_minor FROM product_variants pv WHERE pv.id = ${bySlug.get(slug)!.id}
      `;
    }
    await tx`
      UPDATE carts SET delivery_area_id = ${deliveryAreaId}, coupon_code = ${input.couponCode?.toUpperCase() || null},
        expires_at = now() + interval '30 days', updated_at = now()
      WHERE id = ${cartId}
    `;
    return cartResponse(tx, cartId);
  });
}

export async function mergeGuestCartToUser(rawGuestToken: string | undefined, userId: string) {
  if (!rawGuestToken) return;
  await withTransaction(async (tx) => {
    const [guestCart] = await tx<{ id: string }[]>`
      SELECT id FROM carts WHERE guest_token_hash = ${hashSecret(rawGuestToken)} AND status = 'ACTIVE' FOR UPDATE
    `;
    if (!guestCart) return;
    const userCartId = await findOrCreateCart(tx, { userId, guestToken: null, isNewGuest: false });
    await tx`
      INSERT INTO cart_items (cart_id, variant_id, quantity, unit_price_snapshot_minor)
      SELECT ${userCartId}, variant_id, quantity, unit_price_snapshot_minor FROM cart_items WHERE cart_id = ${guestCart.id}
      ON CONFLICT (cart_id, variant_id) DO UPDATE SET
        quantity = LEAST(100, cart_items.quantity + EXCLUDED.quantity), updated_at = now()
    `;
    await tx`
      UPDATE carts target SET delivery_area_id = COALESCE(target.delivery_area_id, source.delivery_area_id),
        coupon_code = COALESCE(target.coupon_code, source.coupon_code), updated_at = now()
      FROM carts source WHERE target.id = ${userCartId} AND source.id = ${guestCart.id}
    `;
    await tx`UPDATE carts SET status = 'CONVERTED', updated_at = now() WHERE id = ${guestCart.id}`;
  });
}
