"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminFromSession } from "@/server/admin-auth";
import { ADMIN_SESSION_COOKIE } from "@/server/admin-session-cookie";
import { sql } from "@/server/db";
import { evaluateInventoryNotifications } from "@/server/admin-notifications";
import { hashPassword } from "@/server/admin-auth";
import { redirect } from "next/navigation";
import { sendTelegramMessage, TELEGRAM_EVENTS } from "@/server/notifications";

async function requireAdministrator() {
  const cookieStore = await cookies();
  const admin = await getAdminFromSession(
    cookieStore.get(ADMIN_SESSION_COOKIE)?.value,
  );
  if (!admin || !["ADMIN", "SUPPORT"].includes(admin.role))
    throw new Error("Operations access is required.");
  return admin;
}

const idSchema = z.string().uuid();

async function audit(
  actorId: string,
  action: string,
  entityType: string,
  entityId?: string,
  metadata: Record<string, unknown> = {},
) {
  await sql`INSERT INTO admin_activity_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES (${actorId}, ${action}, ${entityType}, ${entityId ?? null}, ${JSON.stringify(metadata)}::jsonb)`;
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function setProductActive(productId: string, active: boolean) {
  const admin = await requireAdministrator();
  await sql`UPDATE products SET active = ${active}, updated_at = now() WHERE id = ${idSchema.parse(productId)}`;
  await audit(
    admin.id,
    active ? "product.published" : "product.archived",
    "product",
    productId,
  );
  revalidatePath("/admin/products");
}

export async function setProductsActive(productIds: string[], active: boolean) {
  const admin = await requireAdministrator();
  const ids = z.array(z.string().uuid()).min(1).max(100).parse(productIds);
  await sql`UPDATE products SET active=${active}, updated_at=now() WHERE id = ANY(${ids})`;
  await audit(
    admin.id,
    active ? "products.published" : "products.archived",
    "product",
    undefined,
    { count: ids.length },
  );
  revalidatePath("/admin/products");
}

export async function duplicateProduct(productId: string) {
  const admin = await requireAdministrator();
  const id = idSchema.parse(productId);
  const [source] = await sql<
    {
      id: string;
      slug: string;
      name: string;
      description: string | null;
      category_id: string;
      brand_id: string | null;
      image_url: string | null;
    }[]
  >`SELECT id,slug,name,description,category_id,brand_id,image_url FROM products WHERE id=${id}`;
  if (!source) throw new Error("Product no longer exists.");
  const suffix = Date.now().toString(36).slice(-5);
  const cloneSlug = `${source.slug}-copy-${suffix}`;
  const cloneSku = `TT-PROD-${cloneSlug.toUpperCase()}`;
  const clone = await sql.begin(async (tx) => {
    const [created] = await tx<
      { id: string }[]
    >`INSERT INTO products (slug,sku,name,description,category_id,brand_id,image_url,active) VALUES (${cloneSlug},${cloneSku},${source.name + " (copy)"},${source.description},${source.category_id},${source.brand_id},${source.image_url},false) RETURNING id`;
    const variants = await tx<
      {
        sku: string;
        label: string;
        size_label: string | null;
        price_minor: number;
        cost_price_minor: number;
        active: boolean;
        is_default: boolean;
      }[]
    >`SELECT sku,label,size_label,price_minor,cost_price_minor,active,is_default FROM product_variants WHERE product_id=${id} ORDER BY created_at`;
    for (const [index, variant] of variants.entries())
      await tx`INSERT INTO product_variants (product_id,sku,label,size_label,price_minor,cost_price_minor,active,is_default) VALUES (${created.id},${(variant.sku + "-COPY-" + (index + 1)).slice(0, 80)},${variant.label},${variant.size_label},${variant.price_minor},${variant.cost_price_minor},${variant.active},${variant.is_default})`;
    return created;
  });
  await audit(admin.id, "product.duplicated", "product", clone.id, {
    sourceProductId: id,
  });
  revalidatePath("/admin/products");
}

export async function setPromotionActive(promotionId: string, active: boolean) {
  const admin = await requireAdministrator();
  await sql`UPDATE promotions SET active = ${active}, updated_at = now() WHERE id = ${idSchema.parse(promotionId)}`;
  await audit(
    admin.id,
    active ? "promotion.activated" : "promotion.paused",
    "promotion",
    promotionId,
  );
  revalidatePath("/admin/promotions");
}

export async function updatePromotion(promotionId: string, formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({
      name: z.string().min(2),
      code: z.string().min(2),
      percentage: z.coerce.number().min(1).max(100),
      minimum: z.coerce.number().int().min(0),
    })
    .parse({
      name: text(formData, "name"),
      code: text(formData, "code").toUpperCase(),
      percentage: formData.get("percentage"),
      minimum: formData.get("minimum"),
    });
  const id = idSchema.parse(promotionId);
  const [duplicate] =
    await sql`SELECT c.id FROM coupons c WHERE c.code = ${input.code} AND c.promotion_id <> ${id}`;
  if (duplicate) redirect("/admin/promotions?notice=duplicate");
  await sql.begin(async (tx) => {
    await tx`UPDATE promotions SET name = ${input.name}, percentage_basis_points = ${Math.round(input.percentage * 100)}, minimum_order_minor = ${input.minimum}, updated_at = now() WHERE id = ${id}`;
    await tx`UPDATE coupons SET code = ${input.code}, updated_at = now() WHERE promotion_id = ${id}`;
  });
  await audit(admin.id, "promotion.updated", "promotion", id, {
    code: input.code,
  });
  revalidatePath("/admin/promotions");
  redirect("/admin/promotions?notice=updated");
}

export async function setContentActive(contentId: string, active: boolean) {
  const admin = await requireAdministrator();
  await sql`UPDATE content_blocks SET active = ${active}, updated_at = now() WHERE id = ${idSchema.parse(contentId)}`;
  await audit(
    admin.id,
    active ? "content.published" : "content.hidden",
    "content_block",
    contentId,
  );
  revalidatePath("/admin/content");
}

export async function setCustomerStatus(
  userId: string,
  status: "ACTIVE" | "SUSPENDED",
) {
  const admin = await requireAdministrator();
  const next = z.enum(["ACTIVE", "SUSPENDED"]).parse(status);
  await sql`UPDATE users SET status = ${next}, updated_at = now() WHERE id = ${idSchema.parse(userId)} AND role = 'CUSTOMER'`;
  await audit(
    admin.id,
    next === "ACTIVE" ? "customer.reactivated" : "customer.suspended",
    "user",
    userId,
  );
  revalidatePath("/admin/customers");
}

export async function addInventoryStock(variantId: string, formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({ quantity: z.coerce.number().int().min(1).max(1_000_000) })
    .parse({ quantity: formData.get("quantity") });
  const id = idSchema.parse(variantId);
  await sql.begin(async (tx) => {
    const [row] = await tx<{ on_hand_quantity: number }[]>`
      UPDATE inventory SET on_hand_quantity = on_hand_quantity + ${input.quantity}, updated_at = now()
      WHERE variant_id = ${id}
      RETURNING on_hand_quantity
    `;
    if (!row) throw new Error("This variant is not in inventory yet.");
    const after = row.on_hand_quantity;
    const before = after - input.quantity;
    await tx`INSERT INTO inventory_movements(variant_id,actor_user_id,movement_type,quantity,on_hand_before,on_hand_after) VALUES(${id},${admin.id},'RESTOCK',${input.quantity},${before},${after})`;
    await tx`INSERT INTO admin_activity_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES(${admin.id},'inventory.stock_added','product_variant',${id},${tx.json({ quantity: input.quantity, onHandBefore: before, onHandAfter: after })})`;
  });
  await evaluateInventoryNotifications(sql);
  revalidatePath("/admin/inventory");
}

export async function setInventoryStorefrontEnabled(variantId: string, enabled: boolean) {
  const admin = await requireAdministrator();
  const id = idSchema.parse(variantId);
  const active = z.boolean().parse(enabled);
  const [row] = await sql`UPDATE inventory SET storefront_enabled=${active},updated_at=now() WHERE variant_id=${id} RETURNING variant_id`;
  if (!row) throw new Error("This variant is not in inventory.");
  await audit(admin.id, active ? "inventory.storefront_enabled" : "inventory.storefront_disabled", "product_variant", id, { enabled: active });
  revalidatePath("/admin/inventory");
  revalidatePath("/");
}

export async function addInventoryItem(formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({
      variantId: z.string().uuid(),
      onHand: z.coerce.number().int().min(0),
    })
    .parse({
      variantId: formData.get("variantId"),
      onHand: formData.get("onHand"),
    });
  await sql.begin(async (tx) => {
    const [row] = await tx<{ on_hand_quantity: number }[]>`INSERT INTO inventory (variant_id,on_hand_quantity,low_stock_threshold) VALUES (${input.variantId},${input.onHand},COALESCE((SELECT (value->>'quantity')::int FROM platform_settings WHERE key='inventory.low_stock_threshold'),3)) ON CONFLICT (variant_id) DO NOTHING RETURNING on_hand_quantity`;
    if (!row) throw new Error("This variant is already in inventory. Use Add stock to replenish it.");
    if (input.onHand > 0) await tx`INSERT INTO inventory_movements(variant_id,actor_user_id,movement_type,quantity,on_hand_before,on_hand_after) VALUES(${input.variantId},${admin.id},'INITIAL_STOCK',${input.onHand},0,${input.onHand})`;
    await tx`INSERT INTO admin_activity_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES(${admin.id},'inventory.item_added','product_variant',${input.variantId},${tx.json(input)})`;
  });
  await evaluateInventoryNotifications(sql);
  revalidatePath("/admin/inventory");
}

export async function saveOperationsSettings(formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({
      lowStockThreshold: z.coerce.number().int().min(0).max(100000),
      weekdayOpen: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      weekdayClose: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      weekendOpen: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      weekendClose: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      closingSoonMinutes: z.coerce.number().int().min(5).max(180),
    })
    .parse({
      lowStockThreshold: formData.get("lowStockThreshold"),
      weekdayOpen: text(formData, "weekdayOpen"),
      weekdayClose: text(formData, "weekdayClose"),
      weekendOpen: text(formData, "weekendOpen"),
      weekendClose: text(formData, "weekendClose"),
      closingSoonMinutes: formData.get("closingSoonMinutes"),
    });
  if (
    input.weekdayOpen >= input.weekdayClose ||
    input.weekendOpen >= input.weekendClose
  )
    throw new Error("Closing time must be after opening time.");
  await sql`INSERT INTO platform_settings (key,value,description,updated_by) VALUES ('inventory.low_stock_threshold',${sql.json({ quantity: input.lowStockThreshold })},'Global available-stock level that triggers a low-stock alert.',${admin.id}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`;
  await sql`INSERT INTO platform_settings (key,value,description,updated_by) VALUES ('store.operating_hours',${sql.json({ weekday: { open: input.weekdayOpen, close: input.weekdayClose }, weekend: { open: input.weekendOpen, close: input.weekendClose }, closingSoonMinutes: input.closingSoonMinutes })},'Store opening hours for weekdays and weekends in Africa/Nairobi.',${admin.id}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`;
  await sql`UPDATE inventory SET low_stock_threshold=${input.lowStockThreshold},updated_at=now()`;
  await evaluateInventoryNotifications(sql);
  await audit(
    admin.id,
    "settings.updated",
    "platform_settings",
    "store.operating_hours",
    input,
  );
  revalidatePath("/admin/settings");
  revalidatePath("/admin/inventory");
}

export async function saveTelegramNotificationSettings(formData: FormData) {
  const admin = await requireAdministrator();
  const chatId = text(formData, "chatId");
  if (!/^-?\d{5,20}$/.test(chatId)) throw new Error("Enter a valid Telegram group or chat ID.");
  const selected = new Set(formData.getAll("events").map(String));
  const events = Object.fromEntries(TELEGRAM_EVENTS.map((event) => [event, selected.has(event)]));
  await sql`INSERT INTO platform_settings(key,value,description,updated_by) VALUES('notifications.telegram',${sql.json({ chatId, events })},'Telegram operations-chat destination and selected alert types.',${admin.id}) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`;
  await audit(admin.id, "settings.telegram_notifications_updated", "platform_settings", "notifications.telegram", { enabledEvents: [...selected] });
  revalidatePath("/admin/settings");
}

export async function testTelegramConnection(chatId: string) {
  const admin = await requireAdministrator();
  const validChatId = z.string().regex(/^-?\d{5,20}$/).parse(chatId);
  await sendTelegramMessage(validChatId, "TipsyAdmin Telegram notifications are connected.");
  await audit(admin.id, "settings.telegram_connection_tested", "platform_settings", "notifications.telegram");
  return { ok: true };
}

export async function createProduct(formData: FormData) {
  const admin = await requireAdministrator();
  const rawVariants = text(formData, "variants");
  let parsedVariants: unknown;
  try {
    parsedVariants = rawVariants
      ? JSON.parse(rawVariants)
      : [
          {
            label: text(formData, "variantLabel"),
            price: formData.get("price"),
            costPrice: formData.get("costPrice"),
            sku: text(formData, "sku"),
          },
        ];
  } catch {
    throw new Error("Product variants could not be read. Please try again.");
  }
  const input = z
    .object({
      name: z.string().min(2),
      slug: z
        .string()
        .min(2)
        .regex(/^[a-z0-9-]+$/),
      description: z.string().max(2000),
      categoryId: z.string().uuid(),
      brandId: z.union([z.string().uuid(), z.literal("")]),
      imageUrl: z.string().max(1000),
      variants: z
        .array(
          z.object({
            label: z.string().min(1).max(80),
            price: z.coerce.number().nonnegative(),
            costPrice: z.coerce.number().nonnegative(),
            sku: z.string().min(2).max(80),
          }),
        )
        .min(1)
        .max(12),
    })
    .parse({
      name: text(formData, "name"),
      slug: text(formData, "slug").toLowerCase(),
      description: text(formData, "description"),
      categoryId: formData.get("categoryId"),
      brandId: text(formData, "brandId"),
      imageUrl: text(formData, "imageUrl"),
      variants: parsedVariants,
    });
  const [existing] = await sql<
    { id: string }[]
  >`SELECT id FROM products WHERE slug=${input.slug}`;
  if (existing) throw new Error("A product with this name already exists.");
  const productSku = `TT-PROD-${input.slug.replace(/[^a-z0-9]/gi, "-").toUpperCase()}`;
  const product = await sql.begin(async (tx) => {
    const [created] = await tx<
      { id: string }[]
    >`INSERT INTO products (slug, sku, name, description, category_id, brand_id, image_url, active) VALUES (${input.slug}, ${productSku}, ${input.name}, ${input.description || null}, ${input.categoryId}, ${input.brandId || null}, ${input.imageUrl || null}, true) RETURNING id`;
    for (const [index, variant] of input.variants.entries())
      await tx`INSERT INTO product_variants (product_id, sku, label, size_label, price_minor, cost_price_minor, active, is_default) VALUES (${created.id}, ${variant.sku.toUpperCase()}, ${variant.label}, ${variant.label}, ${Math.round(variant.price)}, ${Math.round(variant.costPrice)}, true, ${index === 0})`;
    return created;
  });
  await audit(admin.id, "product.created", "product", product.id, {
    variants: input.variants.length,
  });
  revalidatePath("/admin/products");
  revalidatePath("/admin/inventory");
}

export async function updateProduct(productId: string, formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({
      name: z.string().min(2),
      description: z.string().max(2000),
      categoryId: z.string().uuid(),
      brandId: z.union([z.string().uuid(), z.literal("")]),
      featured: z.boolean(),
    })
    .parse({
      name: text(formData, "name"),
      description: text(formData, "description"),
      categoryId: formData.get("categoryId"),
      brandId: text(formData, "brandId"),
      featured: formData.get("featured") === "on",
    });
  await sql`UPDATE products SET name=${input.name}, description=${input.description || null}, category_id=${input.categoryId}, brand_id=${input.brandId || null}, featured=${input.featured}, updated_at=now() WHERE id=${idSchema.parse(productId)}`;
  await audit(admin.id, "product.updated", "product", productId);
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
}

export async function updateProductImage(
  productId: string,
  imageUrl: string | null,
) {
  const admin = await requireAdministrator();
  const input = z
    .string()
    .max(1000)
    .refine(
      (value) =>
        value === "" ||
        value.startsWith("/uploads/products/") ||
        value.startsWith("/api/v1/product-images/products/") ||
        /^https?:\/\//i.test(value),
      "Invalid product image URL",
    )
    .parse(imageUrl ?? "");
  const id = idSchema.parse(productId);
  await sql`UPDATE products SET image_url=${input || null}, updated_at=now() WHERE id=${id}`;
  await audit(
    admin.id,
    input ? "product.image_updated" : "product.image_removed",
    "product",
    productId,
  );
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
}

export async function updateVariant(variantId: string, formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({
      label: z.string().min(1),
      sku: z.string().min(2),
      price: z.coerce.number().nonnegative(),
      costPrice: z.coerce.number().nonnegative(),
    })
    .parse({
      label: text(formData, "label"),
      sku: text(formData, "sku").toUpperCase(),
      price: formData.get("price"),
      costPrice: formData.get("costPrice"),
    });
  const [variant] = await sql<
    { product_id: string }[]
  >`UPDATE product_variants SET label=${input.label}, size_label=${input.label}, sku=${input.sku}, price_minor=${Math.round(input.price)}, cost_price_minor=${Math.round(input.costPrice)}, updated_at=now() WHERE id=${idSchema.parse(variantId)} RETURNING product_id`;
  if (!variant) throw new Error("Variant no longer exists.");
  await audit(
    admin.id,
    "product_variant.updated",
    "product_variant",
    variantId,
  );
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${variant.product_id}`);
  revalidatePath("/admin/inventory");
}

export async function setVariantActive(variantId: string, active: boolean) {
  const admin = await requireAdministrator();
  const id = idSchema.parse(variantId);
  const [variant] = await sql<
    { product_id: string }[]
  >`UPDATE product_variants SET active=${active}, updated_at=now() WHERE id=${id} RETURNING product_id`;
  if (!variant) throw new Error("Variant no longer exists.");
  await audit(
    admin.id,
    active ? "product_variant.published" : "product_variant.archived",
    "product_variant",
    id,
  );
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${variant.product_id}`);
  revalidatePath("/admin/inventory");
}

export async function createVariant(productId: string, formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({
      label: z.string().min(1),
      price: z.coerce.number().int().nonnegative(),
      costPrice: z.coerce.number().int().nonnegative(),
    })
    .parse({
      label: text(formData, "label"),
      price: formData.get("price"),
      costPrice: formData.get("costPrice"),
    });
  const id = idSchema.parse(productId);
  const [product] = await sql<
    { slug: string }[]
  >`SELECT slug FROM products WHERE id=${id}`;
  if (!product) throw new Error("Product no longer exists.");
  const variantKey =
    input.label
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 10)
      .toUpperCase() || "STANDARD";
  const sku = `TT-${product.slug
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 18)
    .toUpperCase()}-${variantKey}-${Date.now().toString().slice(-5)}`;
  const [variant] = await sql<
    { id: string }[]
  >`INSERT INTO product_variants(product_id,sku,label,size_label,price_minor,cost_price_minor,active,is_default) VALUES(${id},${sku},${input.label},${input.label},${input.price},${input.costPrice},true,false) RETURNING id`;
  await audit(
    admin.id,
    "product_variant.created",
    "product_variant",
    variant.id,
    { productId },
  );
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/inventory");
}

export async function createRider(formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({
      name: z.string().min(2),
      phone: z.string().min(9),
      vehicleType: z.string().min(2),
      registration: z.string().max(40),
    })
    .parse({
      name: text(formData, "name"),
      phone: text(formData, "phone"),
      vehicleType: text(formData, "vehicleType"),
      registration: text(formData, "registration"),
    });
  const [user] = await sql<
    { id: string }[]
  >`INSERT INTO users (phone, display_name, role, status) VALUES (${input.phone}, ${input.name}, 'RIDER', 'ACTIVE') ON CONFLICT (phone) DO UPDATE SET display_name=EXCLUDED.display_name, role='RIDER', status='ACTIVE', updated_at=now() RETURNING id`;
  const [rider] = await sql<
    { id: string }[]
  >`INSERT INTO riders (user_id, availability, vehicle_type, vehicle_registration) VALUES (${user.id}, 'OFFLINE', ${input.vehicleType}, ${input.registration || null}) ON CONFLICT (user_id) DO UPDATE SET vehicle_type=EXCLUDED.vehicle_type, vehicle_registration=EXCLUDED.vehicle_registration, updated_at=now() RETURNING id`;
  await audit(admin.id, "rider.onboarded", "rider", rider.id);
  revalidatePath("/admin/riders");
  revalidatePath("/admin/delivery");
}

export async function setRiderStatus(riderId: string, enabled: boolean) {
  const admin = await requireAdministrator();
  const [rider] = await sql<
    { user_id: string }[]
  >`UPDATE riders SET availability='OFFLINE', updated_at=now() WHERE id=${idSchema.parse(riderId)} RETURNING user_id`;
  if (rider)
    await sql`UPDATE users SET status=${enabled ? "ACTIVE" : "DISABLED"}::user_status, updated_at=now() WHERE id=${rider.user_id}`;
  await audit(
    admin.id,
    enabled ? "rider.reactivated" : "rider.offboarded",
    "rider",
    riderId,
  );
  revalidatePath("/admin/riders");
  revalidatePath("/admin/delivery");
}

export async function recordDriverPayout(formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({
      riderId: z.string().uuid(),
      periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reference: z.string().max(80),
    })
    .parse({
      riderId: formData.get("riderId"),
      periodStart: text(formData, "periodStart"),
      periodEnd: text(formData, "periodEnd"),
      reference: text(formData, "reference"),
    });
  const periodStart = new Date(`${input.periodStart}T00:00:00.000Z`);
  const periodEnd = new Date(`${input.periodEnd}T00:00:00.000Z`);
  const currentWeekStart = new Date();
  currentWeekStart.setUTCHours(0, 0, 0, 0);
  currentWeekStart.setUTCDate(
    currentWeekStart.getUTCDate() - ((currentWeekStart.getUTCDay() + 6) % 7),
  );
  const durationDays = Math.round(
    (periodEnd.getTime() - periodStart.getTime()) / 86_400_000,
  );
  if (
    Number.isNaN(periodStart.getTime()) ||
    Number.isNaN(periodEnd.getTime()) ||
    periodStart.getUTCDay() !== 1 ||
    durationDays !== 6
  ) {
    throw new Error("A driver payout must cover one Monday–Sunday week.");
  }
  if (periodEnd >= currentWeekStart) {
    throw new Error(
      "A weekly payout can be recorded after its week has closed.",
    );
  }

  const result = await sql.begin(async (tx) => {
    const assignments = await tx<{ id: string; payout_minor: number }[]>`
      SELECT id,payout_minor
      FROM delivery_assignments
      WHERE rider_id = ${input.riderId}
        AND status = 'DELIVERED'
        AND payout_status = 'UNPAID'
        AND delivered_at >= ${input.periodStart}::date
        AND delivered_at < (${input.periodEnd}::date + INTERVAL '1 day')
      FOR UPDATE
    `;
    if (!assignments.length) {
      throw new Error(
        "This payment has already been settled. Refresh the payment queue and try again.",
      );
    }
    const amount = assignments.reduce(
      (total, assignment) => total + assignment.payout_minor,
      0,
    );
    const reference =
      input.reference ||
      `DRV-${input.periodStart.replaceAll("-", "")}-${Date.now().toString().slice(-6)}`;
    const [payout] = await tx<{ id: string }[]>`
      INSERT INTO driver_payouts (
        rider_id,period_start,period_end,amount_minor,status,reference,paid_at,created_by
      ) VALUES (
        ${input.riderId},${input.periodStart}::date,${input.periodEnd}::date,
        ${amount},'PAID',${reference},now(),${admin.id}
      )
      RETURNING id
    `;
    for (const assignment of assignments) {
      await tx`
        INSERT INTO driver_payout_items (payout_id,assignment_id,amount_minor)
        VALUES (${payout.id},${assignment.id},${assignment.payout_minor})
      `;
    }
    await tx`
      UPDATE delivery_assignments
      SET payout_status = 'PAID', payout_paid_at = now()
      WHERE id = ANY(${assignments.map((assignment) => assignment.id)})
    `;
    return {
      amount,
      count: assignments.length,
      payoutId: payout.id,
      reference,
    };
  });
  await audit(
    admin.id,
    "driver_payout.recorded",
    "driver_payout",
    result.payoutId,
    {
      riderId: input.riderId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      amount: result.amount,
      deliveries: result.count,
      reference: result.reference,
    },
  );
  revalidatePath("/admin/riders");
  revalidatePath("/admin/delivery");
  revalidatePath("/admin/finance");
  return {
    amount: result.amount,
    count: result.count,
    reference: result.reference,
  };
}

export async function saveDeliveryArea(formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({
      name: z.string().min(2),
      slug: z
        .string()
        .min(2)
        .regex(/^[a-z0-9-]+$/),
      secondaryName: z.string(),
      feeMode: z.enum(["STATIC", "PER_KM"]),
      fee: z.coerce.number().nonnegative(),
      perKm: z.coerce.number().nonnegative(),
      minimumFee: z.coerce.number().nonnegative(),
    })
    .parse({
      name: text(formData, "name"),
      slug: text(formData, "slug").toLowerCase(),
      secondaryName: text(formData, "secondaryName"),
      feeMode: formData.get("feeMode"),
      fee: formData.get("fee"),
      perKm: formData.get("perKm"),
      minimumFee: formData.get("minimumFee"),
    });
  const [area] = await sql<
    { id: string }[]
  >`INSERT INTO delivery_areas (slug,name,secondary_name,fee_mode,fee_minor,per_km_minor,minimum_fee_minor,active) VALUES (${input.slug},${input.name},${input.secondaryName || null},${input.feeMode},${Math.round(input.fee)},${Math.round(input.perKm)},${Math.round(input.minimumFee)},true) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name,secondary_name=EXCLUDED.secondary_name,fee_mode=EXCLUDED.fee_mode,fee_minor=EXCLUDED.fee_minor,per_km_minor=EXCLUDED.per_km_minor,minimum_fee_minor=EXCLUDED.minimum_fee_minor,active=true,updated_at=now() RETURNING id`;
  await audit(admin.id, "delivery_area.saved", "delivery_area", area.id);
  revalidatePath("/admin/delivery");
}

export async function saveDeliveryPricePerKm(formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({ amount: z.coerce.number().finite().nonnegative().max(100000) })
    .parse({ amount: formData.get("amount") });
  const amountMinor = Math.round(input.amount * 100);
  await sql`
    INSERT INTO platform_settings (key,value,description,updated_by)
    VALUES ('delivery.price_per_km',${JSON.stringify({ amount_minor: amountMinor })}::jsonb,'Delivery charge in KSh per started kilometre from the nearest active store.',${admin.id})
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,description=EXCLUDED.description,updated_by=EXCLUDED.updated_by,updated_at=now()
  `;
  await audit(
    admin.id,
    "delivery.price_per_km.updated",
    "platform_setting",
    "delivery.price_per_km",
    { amountMinor },
  );
  revalidatePath("/admin/delivery");
}

export async function saveStoreLocation(formData: FormData) {
  const admin = await requireAdministrator();
  const storeId = text(formData, "storeId");
  const input = z
    .object({
      name: z.string().trim().min(2).max(120),
      address: z.string().trim().min(2).max(240),
      latitude: z.coerce.number().finite().min(-90).max(90),
      longitude: z.coerce.number().finite().min(-180).max(180),
    })
    .parse({
      name: formData.get("name"),
      address: formData.get("address"),
      latitude: formData.get("latitude"),
      longitude: formData.get("longitude"),
    });

  if (storeId) {
    const id = idSchema.parse(storeId);
    const [store] = await sql<{ id: string }[]>`
      UPDATE store_locations SET name=${input.name},address=${input.address},latitude=${input.latitude},longitude=${input.longitude},updated_at=now()
      WHERE id=${id} RETURNING id
    `;
    if (!store) throw new Error("This store location no longer exists.");
    await audit(
      admin.id,
      "store_location.updated",
      "store_location",
      store.id,
      input,
    );
  } else {
    const [store] = await sql<{ id: string }[]>`
      INSERT INTO store_locations (name,address,latitude,longitude) VALUES (${input.name},${input.address},${input.latitude},${input.longitude}) RETURNING id
    `;
    await audit(
      admin.id,
      "store_location.created",
      "store_location",
      store.id,
      input,
    );
  }
  revalidatePath("/admin/delivery");
}

export async function setStoreLocationActive(storeId: string, active: boolean) {
  const admin = await requireAdministrator();
  const id = idSchema.parse(storeId);
  if (!active) {
    const [{ count }] = await sql<
      { count: number }[]
    >`SELECT COUNT(*)::int AS count FROM store_locations WHERE active=true`;
    if (count <= 1)
      throw new Error("At least one store location must remain active.");
  }
  const [store] = await sql<{ id: string; name: string }[]>`
    UPDATE store_locations SET active=${active},updated_at=now() WHERE id=${id} RETURNING id,name
  `;
  if (!store) throw new Error("This store location no longer exists.");
  await audit(
    admin.id,
    active ? "store_location.activated" : "store_location.deactivated",
    "store_location",
    store.id,
    { name: store.name },
  );
  revalidatePath("/admin/delivery");
}

export async function setDeliveryAreaActive(areaId: string, active: boolean) {
  const admin = await requireAdministrator();
  const id = idSchema.parse(areaId);
  const [area] = await sql<{ id: string; name: string }[]>`
    UPDATE delivery_areas
    SET active = ${active}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, name
  `;
  if (!area) throw new Error("This delivery zone no longer exists.");
  await audit(
    admin.id,
    active ? "delivery_area.activated" : "delivery_area.deactivated",
    "delivery_area",
    area.id,
    { name: area.name },
  );
  revalidatePath("/admin/delivery");
}

export async function createVendor(formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({
      name: z.string().min(2),
      contact: z.string(),
      phone: z.string(),
      email: z.union([z.string().email(), z.literal("")]),
      terms: z.string(),
    })
    .parse({
      name: text(formData, "name"),
      contact: text(formData, "contact"),
      phone: text(formData, "phone"),
      email: text(formData, "email"),
      terms: text(formData, "terms"),
    });
  const [vendor] = await sql<
    { id: string }[]
  >`INSERT INTO vendors (name,contact_name,phone,email,payment_terms) VALUES (${input.name},${input.contact || null},${input.phone || null},${input.email || null},${input.terms || null}) ON CONFLICT (name) DO UPDATE SET contact_name=EXCLUDED.contact_name,phone=EXCLUDED.phone,email=EXCLUDED.email,payment_terms=EXCLUDED.payment_terms,updated_at=now() RETURNING id`;
  await audit(admin.id, "vendor.saved", "vendor", vendor.id);
  revalidatePath("/admin/vendors");
}

export async function createPurchaseOrder(formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({
      vendorId: z.string().uuid(),
      variantId: z.string().uuid(),
      quantity: z.coerce.number().int().positive(),
      unitCost: z.coerce.number().int().nonnegative(),
      expectedAt: z.union([z.coerce.date(), z.literal("")]),
    })
    .parse({
      vendorId: formData.get("vendorId"),
      variantId: formData.get("variantId"),
      quantity: formData.get("quantity"),
      unitCost: formData.get("unitCost"),
      expectedAt: text(formData, "expectedAt"),
    });
  const poNumber = `PO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const [order] = await sql<
    { id: string }[]
  >`INSERT INTO purchase_orders(po_number,vendor_id,status,total_minor,ordered_at,expected_at) VALUES(${poNumber},${input.vendorId},'ORDERED',${input.quantity * input.unitCost},now(),${input.expectedAt || null}) RETURNING id`;
  await sql`INSERT INTO purchase_order_items(purchase_order_id,variant_id,quantity,unit_cost_minor) VALUES(${order.id},${input.variantId},${input.quantity},${input.unitCost})`;
  await sql`INSERT INTO vendor_products(vendor_id,variant_id,last_cost_minor,preferred) VALUES(${input.vendorId},${input.variantId},${input.unitCost},true) ON CONFLICT(vendor_id,variant_id) DO UPDATE SET last_cost_minor=EXCLUDED.last_cost_minor`;
  await audit(admin.id, "purchase_order.created", "purchase_order", order.id, {
    poNumber,
  });
  revalidatePath("/admin/vendors");
}

export async function recordVendorPayment(formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({
      vendorId: z.string().uuid(),
      amount: z.coerce.number().int().positive(),
      reference: z.string().min(2),
    })
    .parse({
      vendorId: formData.get("vendorId"),
      amount: formData.get("amount"),
      reference: text(formData, "reference"),
    });
  const [payment] = await sql<
    { id: string }[]
  >`INSERT INTO vendor_payments(vendor_id,amount_minor,reference,status,paid_at) VALUES(${input.vendorId},${input.amount},${input.reference},'PAID',now()) RETURNING id`;
  await sql`UPDATE vendors SET balance_minor=GREATEST(0,balance_minor-${input.amount}),updated_at=now() WHERE id=${input.vendorId}`;
  await audit(
    admin.id,
    "vendor_payment.recorded",
    "vendor_payment",
    payment.id,
    { amount: input.amount },
  );
  revalidatePath("/admin/vendors");
  revalidatePath("/admin/finance");
}

export async function receivePurchaseOrder(purchaseOrderId: string) {
  const admin = await requireAdministrator();
  const id = idSchema.parse(purchaseOrderId);
  await sql.begin(async (tx) => {
    const items = await tx<
      { variant_id: string; quantity: number; unit_cost_minor: number }[]
    >`SELECT variant_id,quantity,unit_cost_minor FROM purchase_order_items WHERE purchase_order_id=${id}`;
    for (const item of items) {
      await tx`INSERT INTO inventory(variant_id,on_hand_quantity) VALUES(${item.variant_id},${item.quantity}) ON CONFLICT(variant_id) DO UPDATE SET on_hand_quantity=inventory.on_hand_quantity+${item.quantity},updated_at=now()`;
      await tx`UPDATE product_variants SET cost_price_minor=${item.unit_cost_minor},updated_at=now() WHERE id=${item.variant_id}`;
      await tx`UPDATE purchase_order_items SET received_quantity=quantity WHERE purchase_order_id=${id} AND variant_id=${item.variant_id}`;
    }
    await tx`UPDATE purchase_orders SET status='RECEIVED',received_at=now(),updated_at=now() WHERE id=${id}`;
  });
  await audit(admin.id, "purchase_order.received", "purchase_order", id);
  revalidatePath("/admin/vendors");
  revalidatePath("/admin/inventory");
}

export async function createPromotion(formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({
      name: z.string().min(2),
      code: z.string().min(2),
      percentage: z.coerce.number().min(1).max(100),
      minimum: z.coerce.number().int().min(0),
    })
    .parse({
      name: text(formData, "name"),
      code: text(formData, "code").toUpperCase(),
      percentage: formData.get("percentage"),
      minimum: formData.get("minimum"),
    });
  const [existing] = await sql`SELECT id FROM coupons WHERE code=${input.code}`;
  if (existing) redirect("/admin/promotions?notice=duplicate");
  await sql.begin(async (tx) => {
    const [promotion] = await tx<
      { id: string }[]
    >`INSERT INTO promotions(name,kind,percentage_basis_points,active,minimum_order_minor) VALUES(${input.name},'PERCENTAGE',${Math.round(input.percentage * 100)},true,${input.minimum}) RETURNING id`;
    await tx`INSERT INTO coupons(promotion_id,code,active) VALUES(${promotion.id},${input.code},true)`;
    await audit(admin.id, "promotion.created", "promotion", promotion.id, {
      code: input.code,
    });
  });
  revalidatePath("/admin/promotions");
  redirect("/admin/promotions?notice=created");
}

export async function createContentBlock(formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({
      key: z
        .string()
        .min(2)
        .regex(/^[a-z0-9-]+$/),
      title: z.string().min(2),
      body: z.string(),
      imageUrl: z.string(),
      linkUrl: z.string(),
      kind: z.enum(["HERO_BANNER", "FEATURED_SECTION"]),
    })
    .parse({
      key: text(formData, "key"),
      title: text(formData, "title"),
      body: text(formData, "body"),
      imageUrl: text(formData, "imageUrl"),
      linkUrl: text(formData, "linkUrl"),
      kind: formData.get("kind"),
    });
  const [block] = await sql<
    { id: string }[]
  >`INSERT INTO content_blocks(key,kind,title,body,image_url,link_url,active) VALUES(${input.key},${input.kind},${input.title},${input.body || null},${input.imageUrl || null},${input.linkUrl || null},true) ON CONFLICT(key) DO UPDATE SET kind=EXCLUDED.kind,title=EXCLUDED.title,body=EXCLUDED.body,image_url=EXCLUDED.image_url,link_url=EXCLUDED.link_url,active=true,updated_at=now() RETURNING id`;
  await audit(admin.id, "content.saved", "content_block", block.id);
  revalidatePath("/admin/content");
}

export async function createFleetVehicle(formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({
      registration: z.string().min(2),
      vehicleType: z.string().min(2),
      makeModel: z.string(),
      insuranceExpires: z.union([z.coerce.date(), z.literal("")]),
      serviceDue: z.union([z.coerce.date(), z.literal("")]),
    })
    .parse({
      registration: text(formData, "registration").toUpperCase(),
      vehicleType: text(formData, "vehicleType"),
      makeModel: text(formData, "makeModel"),
      insuranceExpires: text(formData, "insuranceExpires"),
      serviceDue: text(formData, "serviceDue"),
    });
  const [vehicle] = await sql<
    { id: string }[]
  >`INSERT INTO fleet_vehicles (registration,vehicle_type,make_model,insurance_expires_at,service_due_at) VALUES (${input.registration},${input.vehicleType},${input.makeModel || null},${input.insuranceExpires || null},${input.serviceDue || null}) ON CONFLICT(registration) DO UPDATE SET vehicle_type=EXCLUDED.vehicle_type,make_model=EXCLUDED.make_model,insurance_expires_at=EXCLUDED.insurance_expires_at,service_due_at=EXCLUDED.service_due_at,updated_at=now() RETURNING id`;
  await audit(admin.id, "fleet_vehicle.saved", "fleet_vehicle", vehicle.id);
  revalidatePath("/admin/delivery");
}

export async function addExpense(formData: FormData) {
  const admin = await requireAdministrator();
  const input = z
    .object({
      category: z.string().min(2),
      description: z.string().min(2),
      amount: z.coerce.number().positive(),
      expenseDate: z.coerce.date(),
    })
    .parse({
      category: text(formData, "category"),
      description: text(formData, "description"),
      amount: formData.get("amount"),
      expenseDate: formData.get("expenseDate"),
    });
  const [expense] = await sql<
    { id: string }[]
  >`INSERT INTO expenses (category,description,amount_minor,expense_date,created_by) VALUES (${input.category},${input.description},${Math.round(input.amount)},${input.expenseDate},${admin.id}) RETURNING id`;
  await audit(admin.id, "expense.created", "expense", expense.id);
  revalidatePath("/admin/finance");
}

export async function createStaffUser(formData: FormData) {
  const admin = await requireAdministrator();
  if (admin.role !== "ADMIN")
    throw new Error("Only an administrator can create staff accounts.");
  const input = z
    .object({
      username: z
        .string()
        .min(3)
        .regex(/^[a-z0-9._-]+$/),
      displayName: z.string().min(2),
      password: z.string().min(8),
      role: z.enum(["ADMIN", "SUPPORT"]),
    })
    .parse({
      username: text(formData, "username").toLowerCase(),
      displayName: text(formData, "displayName"),
      password: text(formData, "password"),
      role: formData.get("role"),
    });
  const passwordHash = await hashPassword(input.password);
  const [user] = await sql<
    { id: string }[]
  >`INSERT INTO users (username,display_name,role,status) VALUES (${input.username},${input.displayName},${input.role}::user_role,'ACTIVE') RETURNING id`;
  await sql`INSERT INTO admin_credentials (user_id,password_hash,permissions) VALUES (${user.id},${passwordHash},${sql.json(input.role === "ADMIN" ? { all: true } : { orders: true, products: true, inventory: true, customers: true, riders: true, delivery: true, finance: true, vendors: true, promotions: true, content: true, reports: true })})`;
  await audit(admin.id, "staff.created", "user", user.id, { role: input.role });
  revalidatePath("/admin/staff");
}

export async function setStaffStatus(userId: string, enabled: boolean) {
  const admin = await requireAdministrator();
  if (admin.role !== "ADMIN")
    throw new Error("Only an administrator can manage staff access.");
  if (admin.id === userId && !enabled)
    throw new Error("You cannot disable your own account.");
  await sql`UPDATE users SET status=${enabled ? "ACTIVE" : "DISABLED"}::user_status,updated_at=now() WHERE id=${idSchema.parse(userId)} AND role IN('ADMIN','SUPPORT')`;
  await audit(
    admin.id,
    enabled ? "staff.reactivated" : "staff.disabled",
    "user",
    userId,
  );
  revalidatePath("/admin/staff");
}
