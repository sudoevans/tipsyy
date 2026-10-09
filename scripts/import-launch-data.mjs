import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";

const launchDataPath = process.env.LAUNCH_DATA_FILE
  ?? path.join(process.cwd(), "db", "launch-data.local.json");

const categoryDefinitions = {
  WHISKY: { slug: "whisky", name: "Whisky", ageRestricted: true },
  SPIRITS: { slug: "spirits", name: "Spirits", ageRestricted: true },
  CHASERS: { slug: "mixers", name: "Chasers", ageRestricted: false },
  BEERS: { slug: "beer", name: "Beers", ageRestricted: true },
  SMOKES: { slug: "smokes", name: "Smokes", ageRestricted: true },
  VODKA: { slug: "vodka", name: "Vodka", ageRestricted: true },
  WINES: { slug: "wine", name: "Wines", ageRestricted: true },
};

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizePhone(value) {
  const matched = String(value ?? "").match(/(?:254|0)[17]\d{8}/);
  if (!matched) return null;
  const digits = matched[0];
  return digits.startsWith("0") ? `254${digits.slice(1)}` : digits;
}

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => value.trim() !== "")) rows.push(row);

  const [headers, ...records] = rows;
  return records.map((record) => Object.fromEntries(headers.map((header, index) => [
    header.replace(/^\uFEFF/, "").trim(),
    record[index] ?? "",
  ])));
}

function positiveInteger(value) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

const launchData = JSON.parse(await readFile(launchDataPath, "utf8"));
const customerCsvPath = process.env.CUSTOMERS_CSV ?? launchData.customersCsv;
if (!customerCsvPath) throw new Error("Set CUSTOMERS_CSV or customersCsv in the launch data file.");

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DIRECT_URL or DATABASE_URL is required for the launch-data import.");

const customerSource = parseCsv(await readFile(customerCsvPath, "utf8"));
const imageBaseUrl = String(launchData.publicImageBaseUrl ?? "").replace(/\/$/, "");
const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });

const productNameOccurrences = new Map();
for (const item of launchData.inventory) {
  const name = slugify(item.name);
  productNameOccurrences.set(name, (productNameOccurrences.get(name) ?? 0) + 1);
}

const groupedProducts = new Map();
for (const item of launchData.inventory) {
  const category = categoryDefinitions[item.category];
  if (!category) throw new Error(`Unsupported category: ${item.category}`);
  const duplicateName = productNameOccurrences.get(slugify(item.name)) > 1;
  const slug = `${slugify(item.name)}${duplicateName ? `-${category.slug}` : ""}`;
  const existing = groupedProducts.get(slug) ?? {
    slug,
    name: item.name,
    category: item.category,
    brand: item.brand ?? null,
    imageKey: item.imageKey ?? null,
    variants: [],
  };
  existing.variants.push({ price: positiveInteger(item.price), stock: positiveInteger(item.stock) });
  groupedProducts.set(slug, existing);
}

const drivers = launchData.drivers.map((driver) => ({
  ...driver,
  phone: normalizePhone(driver.phone),
  earnings: positiveInteger(driver.earnings),
}));
if (drivers.some((driver) => !driver.phone)) throw new Error("Every driver requires a valid Kenyan mobile number.");

const driverPhones = new Set(drivers.map((driver) => driver.phone));
const customerCandidates = customerSource
  .map((row, index) => ({
    email: String(row.Email ?? "").replace(/\s+/g, "").trim().toLowerCase() || null,
    name: String(row.Name ?? "").replace(/\s+/g, " ").trim() || "Customer",
    phone: normalizePhone(row.Phone),
    sourceIndex: index,
    status: String(row.Status ?? "").trim().toUpperCase() === "ACTIVE" ? "ACTIVE" : "DISABLED",
    score: positiveInteger(row.Orders) * 1_000_000_000 + positiveInteger(row["Total Spent"]),
  }))
  .filter((customer) => customer.phone);

const customersByPhone = new Map();
for (const customer of customerCandidates) {
  const current = customersByPhone.get(customer.phone);
  if (!current || customer.score > current.score || (customer.score === current.score && customer.sourceIndex < current.sourceIndex)) {
    customersByPhone.set(customer.phone, customer);
  }
}

const customers = [...customersByPhone.values()].filter((customer) => !driverPhones.has(customer.phone));

const result = await sql.begin(async (tx) => {
  const deliveryAreas = [
    ["karatina-university-kagochi", "Karatina University — Kagochi", "Kagochi, Nyeri", 250, -0.482236, 37.126167, 6, 30, 55, 10],
    ["karatina-town", "Karatina Town", "Karatina, Nyeri", 250, -0.484006, 37.127897, 7, 25, 50, 20],
    ["ihwagi", "Ihwagi", "Karatina, Nyeri", 300, -0.4518, 37.1159, 8, 35, 65, 30],
    ["kibirigwi", "Kibirigwi", "Kianyaga, Nyeri", 350, -0.4099, 37.2097, 12, 45, 80, 40],
    ["kinoo-ward", "Kinoo ward", "Kikuyu, Kiambu", 250, -1.25591, 36.70018, 8, 30, 55, 50],
  ];
  for (const [slug, name, secondaryName, fee, latitude, longitude, radius, minMinutes, maxMinutes, sortOrder] of deliveryAreas) {
    await tx`
      INSERT INTO delivery_areas (slug, name, secondary_name, fee_minor, latitude, longitude, service_radius_km, estimated_min_minutes, estimated_max_minutes, active, sort_order)
      VALUES (${slug}, ${name}, ${secondaryName}, ${fee}, ${latitude}, ${longitude}, ${radius}, ${minMinutes}, ${maxMinutes}, true, ${sortOrder})
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name, secondary_name = EXCLUDED.secondary_name, fee_minor = EXCLUDED.fee_minor,
        latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, service_radius_km = EXCLUDED.service_radius_km,
        estimated_min_minutes = EXCLUDED.estimated_min_minutes, estimated_max_minutes = EXCLUDED.estimated_max_minutes,
        active = true, sort_order = EXCLUDED.sort_order, updated_at = now()
    `;
  }

  for (const [key, category] of Object.entries(categoryDefinitions)) {
    await tx`
      INSERT INTO categories (slug, name, active, sort_order)
      VALUES (${category.slug}, ${category.name}, true, ${Object.keys(categoryDefinitions).indexOf(key) + 10})
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, active = true, updated_at = now()
    `;
  }

  const brandIds = new Map();
  for (const brandName of new Set([...groupedProducts.values()].map((product) => product.brand).filter(Boolean))) {
    const slug = slugify(brandName);
    const [brand] = await tx`
      INSERT INTO brands (slug, name, active)
      VALUES (${slug}, ${brandName}, true)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, active = true, updated_at = now()
      RETURNING id
    `;
    brandIds.set(brandName, brand.id);
  }

  const categoryIds = new Map();
  for (const [key, category] of Object.entries(categoryDefinitions)) {
    const [row] = await tx`SELECT id FROM categories WHERE slug = ${category.slug}`;
    categoryIds.set(key, row.id);
  }

  let variants = 0;
  for (const product of groupedProducts.values()) {
    const category = categoryDefinitions[product.category];
    const productSku = `TT-PROD-${product.slug.toUpperCase()}`;
    const imageUrl = product.imageKey && imageBaseUrl
      ? `${imageBaseUrl}/products/${encodeURIComponent(product.imageKey)}`
      : null;
    const [savedProduct] = await tx`
      INSERT INTO products (slug, sku, name, category_id, brand_id, image_url, age_restricted, active)
      VALUES (${product.slug}, ${productSku}, ${product.name}, ${categoryIds.get(product.category)}, ${product.brand ? brandIds.get(product.brand) : null}, ${imageUrl}, ${category.ageRestricted}, true)
      ON CONFLICT (sku) DO UPDATE SET
        slug = EXCLUDED.slug,
        name = EXCLUDED.name,
        category_id = EXCLUDED.category_id,
        brand_id = EXCLUDED.brand_id,
        image_url = COALESCE(EXCLUDED.image_url, products.image_url),
        age_restricted = EXCLUDED.age_restricted,
        active = true,
        updated_at = now()
      RETURNING id
    `;

    for (const [index, variant] of product.variants.entries()) {
      const isDefault = index === 0;
      const variantSku = `${productSku}-${index + 1}`;
      if (isDefault) {
        await tx`UPDATE product_variants SET is_default = false WHERE product_id = ${savedProduct.id} AND sku <> ${variantSku}`;
      }
      const label = product.variants.length === 1 ? "Standard" : `Option ${index + 1}`;
      const [savedVariant] = await tx`
        INSERT INTO product_variants (product_id, sku, label, size_label, price_minor, cost_price_minor, active, is_default)
        VALUES (${savedProduct.id}, ${variantSku}, ${label}, ${label}, ${variant.price}, 0, true, ${isDefault})
        ON CONFLICT (sku) DO UPDATE SET
          label = EXCLUDED.label,
          size_label = EXCLUDED.size_label,
          price_minor = EXCLUDED.price_minor,
          active = true,
          is_default = EXCLUDED.is_default,
          updated_at = now()
        RETURNING id
      `;
      await tx`
        INSERT INTO inventory (variant_id, on_hand_quantity, reserved_quantity, low_stock_threshold)
        VALUES (${savedVariant.id}, ${variant.stock}, 0, 3)
        ON CONFLICT (variant_id) DO UPDATE SET
          on_hand_quantity = GREATEST(EXCLUDED.on_hand_quantity, inventory.reserved_quantity),
          low_stock_threshold = EXCLUDED.low_stock_threshold,
          updated_at = now()
      `;
      variants += 1;
    }
  }

  for (const driver of drivers) {
    const [user] = await tx`
      INSERT INTO users (phone, display_name, role, status, phone_verified_at)
      VALUES (${driver.phone}, ${driver.name}, 'RIDER', 'ACTIVE', now())
      ON CONFLICT (phone) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        role = 'RIDER',
        status = 'ACTIVE',
        phone_verified_at = COALESCE(users.phone_verified_at, now()),
        updated_at = now()
      RETURNING id
    `;
    await tx`
      INSERT INTO riders (user_id, availability, earnings_minor)
      VALUES (${user.id}, 'OFFLINE', ${driver.earnings})
      ON CONFLICT (user_id) DO UPDATE SET earnings_minor = EXCLUDED.earnings_minor, updated_at = now()
    `;
  }

  const savedCustomers = await tx`
    INSERT INTO users ${tx(customers.map((customer) => ({
      phone: customer.phone,
      email: customer.email,
      display_name: customer.name,
      role: "CUSTOMER",
      status: customer.status,
    })), "phone", "email", "display_name", "role", "status")}
    ON CONFLICT (phone) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, users.email),
      display_name = CASE WHEN users.role = 'CUSTOMER' THEN EXCLUDED.display_name ELSE users.display_name END,
      status = CASE WHEN users.role = 'CUSTOMER' THEN EXCLUDED.status ELSE users.status END,
      updated_at = now()
    RETURNING id, phone, role::text AS role
  `;
  const customerNames = new Map(customers.map((customer) => [customer.phone, customer.name]));
  const customerProfiles = savedCustomers
    .filter((user) => user.role === "CUSTOMER")
    .map((user) => ({
      user_id: user.id,
      legal_name: customerNames.get(user.phone),
      marketing_opt_in: false,
    }));
  if (customerProfiles.length) {
    await tx`
      INSERT INTO customer_profiles ${tx(customerProfiles, "user_id", "legal_name", "marketing_opt_in")}
      ON CONFLICT (user_id) DO UPDATE SET legal_name = EXCLUDED.legal_name, updated_at = now()
    `;
  }

  return {
    customers: customerProfiles.length,
    customerSourceRows: customerSource.length,
    customerDuplicatePhones: customerCandidates.length - customersByPhone.size,
    customerStaffPhoneCollisions: customerCandidates.filter((customer) => driverPhones.has(customer.phone)).length,
    products: groupedProducts.size,
    variants,
    drivers: drivers.length,
  };
});

await sql.end({ timeout: 5 });
process.stdout.write(`Launch data imported: ${JSON.stringify(result)}\n`);
