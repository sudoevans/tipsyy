import InventoryCatalog from "@/components/admin/InventoryCatalog";
import { expireReservations } from "@/server/checkout";
import { sql } from "@/server/db";

export const dynamic = "force-dynamic";

const pageSize = 10;

type InventoryItem = {
  variant_id: string;
  product_id: string;
  name: string;
  label: string;
  sku: string;
  on_hand_quantity: number;
  reserved_quantity: number;
  available: number;
  low_stock_threshold: number;
  storefront_enabled: boolean;
};

type CatalogueProduct = {
  id: string;
  name: string;
  variants: {
    id: string;
    label: string;
    sku: string;
    inInventory: boolean;
  }[];
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; health?: string; page?: string; sort?: string; direction?: string }>;
}) {
  const input = await searchParams;
  await expireReservations();
  const q = (input.q ?? "").trim();
  const health = ["all", "healthy", "low", "out"].includes(input.health ?? "")
    ? (input.health ?? "all")
    : "all";
  const sort = ["product", "variant", "sku", "reserved", "inStock", "available", "health"].includes(input.sort ?? "")
    ? input.sort!
    : "available";
  const direction = input.direction === "desc" ? "desc" : "asc";
  const requestedPage = Math.max(
    1,
    Number.parseInt(input.page ?? "1", 10) || 1,
  );
  const loadInventoryPage = (targetPage: number) => sql<InventoryItem[]>`
    SELECT v.id AS variant_id,p.id AS product_id,p.name,v.label,v.sku,i.on_hand_quantity,i.reserved_quantity,
           (i.on_hand_quantity - i.reserved_quantity)::int AS available,i.low_stock_threshold,i.storefront_enabled
    FROM inventory i
    JOIN product_variants v ON v.id = i.variant_id
    JOIN products p ON p.id = v.product_id
    WHERE (${q} = '' OR p.name ILIKE ${`%${q}%`} OR v.sku ILIKE ${`%${q}%`} OR v.label ILIKE ${`%${q}%`})
      AND (${health} = 'all'
        OR (${health} = 'out' AND i.on_hand_quantity - i.reserved_quantity <= 0)
        OR (${health} = 'low' AND i.on_hand_quantity - i.reserved_quantity > 0 AND i.on_hand_quantity - i.reserved_quantity <= i.low_stock_threshold)
        OR (${health} = 'healthy' AND i.on_hand_quantity - i.reserved_quantity > i.low_stock_threshold))
    ORDER BY
      CASE WHEN ${sort}='product' AND ${direction}='asc' THEN lower(p.name) END ASC,
      CASE WHEN ${sort}='product' AND ${direction}='desc' THEN lower(p.name) END DESC,
      CASE WHEN ${sort}='variant' AND ${direction}='asc' THEN lower(v.label) END ASC,
      CASE WHEN ${sort}='variant' AND ${direction}='desc' THEN lower(v.label) END DESC,
      CASE WHEN ${sort}='sku' AND ${direction}='asc' THEN lower(v.sku) END ASC,
      CASE WHEN ${sort}='sku' AND ${direction}='desc' THEN lower(v.sku) END DESC,
      CASE WHEN ${sort}='reserved' AND ${direction}='asc' THEN i.reserved_quantity END ASC,
      CASE WHEN ${sort}='reserved' AND ${direction}='desc' THEN i.reserved_quantity END DESC,
      CASE WHEN ${sort}='inStock' AND ${direction}='asc' THEN i.on_hand_quantity END ASC,
      CASE WHEN ${sort}='inStock' AND ${direction}='desc' THEN i.on_hand_quantity END DESC,
      CASE WHEN ${sort}='available' AND ${direction}='asc' THEN i.on_hand_quantity-i.reserved_quantity END ASC,
      CASE WHEN ${sort}='available' AND ${direction}='desc' THEN i.on_hand_quantity-i.reserved_quantity END DESC,
      CASE WHEN ${sort}='health' AND ${direction}='asc' THEN CASE WHEN i.on_hand_quantity-i.reserved_quantity<=0 THEN 0 WHEN i.on_hand_quantity-i.reserved_quantity<=i.low_stock_threshold THEN 1 ELSE 2 END END ASC,
      CASE WHEN ${sort}='health' AND ${direction}='desc' THEN CASE WHEN i.on_hand_quantity-i.reserved_quantity<=0 THEN 0 WHEN i.on_hand_quantity-i.reserved_quantity<=i.low_stock_threshold THEN 1 ELSE 2 END END DESC,
      lower(p.name),lower(v.label)
    LIMIT ${pageSize} OFFSET ${(targetPage - 1) * pageSize}
  `;
  const [countRows, catalogueRows, requestedItems] = await Promise.all([
    sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM inventory i
      JOIN product_variants v ON v.id = i.variant_id
      JOIN products p ON p.id = v.product_id
      WHERE (${q} = '' OR p.name ILIKE ${`%${q}%`} OR v.sku ILIKE ${`%${q}%`} OR v.label ILIKE ${`%${q}%`})
        AND (${health} = 'all'
          OR (${health} = 'out' AND i.on_hand_quantity - i.reserved_quantity <= 0)
          OR (${health} = 'low' AND i.on_hand_quantity - i.reserved_quantity > 0 AND i.on_hand_quantity - i.reserved_quantity <= i.low_stock_threshold)
          OR (${health} = 'healthy' AND i.on_hand_quantity - i.reserved_quantity > i.low_stock_threshold))
    `,
    sql<
      {
        product_id: string;
        name: string;
        variant_id: string;
        label: string;
        sku: string;
        in_inventory: boolean;
      }[]
    >`
      SELECT p.id AS product_id,p.name,v.id AS variant_id,v.label,v.sku,(i.variant_id IS NOT NULL) AS in_inventory
      FROM products p
      JOIN product_variants v ON v.product_id = p.id
      LEFT JOIN inventory i ON i.variant_id = v.id
      WHERE p.active AND v.active
      ORDER BY p.name,v.label
    `,
  ]);
  const total = countRows[0]?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const items = await sql<InventoryItem[]>`
    SELECT v.id AS variant_id,p.id AS product_id,p.name,v.label,v.sku,i.on_hand_quantity,i.reserved_quantity,
           (i.on_hand_quantity - i.reserved_quantity)::int AS available,i.low_stock_threshold,i.storefront_enabled
    FROM inventory i
    JOIN product_variants v ON v.id = i.variant_id
    JOIN products p ON p.id = v.product_id
    WHERE (${q} = '' OR p.name ILIKE ${`%${q}%`} OR v.sku ILIKE ${`%${q}%`} OR v.label ILIKE ${`%${q}%`})
      AND (${health} = 'all'
        OR (${health} = 'out' AND i.on_hand_quantity - i.reserved_quantity <= 0)
        OR (${health} = 'low' AND i.on_hand_quantity - i.reserved_quantity > 0 AND i.on_hand_quantity - i.reserved_quantity <= i.low_stock_threshold)
        OR (${health} = 'healthy' AND i.on_hand_quantity - i.reserved_quantity > i.low_stock_threshold))
    ORDER BY
      CASE WHEN ${sort}='product' AND ${direction}='asc' THEN lower(p.name) END ASC,
      CASE WHEN ${sort}='product' AND ${direction}='desc' THEN lower(p.name) END DESC,
      CASE WHEN ${sort}='variant' AND ${direction}='asc' THEN lower(v.label) END ASC,
      CASE WHEN ${sort}='variant' AND ${direction}='desc' THEN lower(v.label) END DESC,
      CASE WHEN ${sort}='sku' AND ${direction}='asc' THEN lower(v.sku) END ASC,
      CASE WHEN ${sort}='sku' AND ${direction}='desc' THEN lower(v.sku) END DESC,
      CASE WHEN ${sort}='reserved' AND ${direction}='asc' THEN i.reserved_quantity END ASC,
      CASE WHEN ${sort}='reserved' AND ${direction}='desc' THEN i.reserved_quantity END DESC,
      CASE WHEN ${sort}='inStock' AND ${direction}='asc' THEN i.on_hand_quantity END ASC,
      CASE WHEN ${sort}='inStock' AND ${direction}='desc' THEN i.on_hand_quantity END DESC,
      CASE WHEN ${sort}='available' AND ${direction}='asc' THEN i.on_hand_quantity-i.reserved_quantity END ASC,
      CASE WHEN ${sort}='available' AND ${direction}='desc' THEN i.on_hand_quantity-i.reserved_quantity END DESC,
      CASE WHEN ${sort}='health' AND ${direction}='asc' THEN CASE WHEN i.on_hand_quantity-i.reserved_quantity<=0 THEN 0 WHEN i.on_hand_quantity-i.reserved_quantity<=i.low_stock_threshold THEN 1 ELSE 2 END END ASC,
      CASE WHEN ${sort}='health' AND ${direction}='desc' THEN CASE WHEN i.on_hand_quantity-i.reserved_quantity<=0 THEN 0 WHEN i.on_hand_quantity-i.reserved_quantity<=i.low_stock_threshold THEN 1 ELSE 2 END END DESC,
      lower(p.name),lower(v.label)
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `;
  const catalogue = Array.from(
    catalogueRows
      .reduce((products, row) => {
        const product = products.get(row.product_id) ?? {
          id: row.product_id,
          name: row.name,
          variants: [],
        };
        product.variants.push({
          id: row.variant_id,
          label: row.label,
          sku: row.sku,
          inInventory: row.in_inventory,
        });
        products.set(row.product_id, product);
        return products;
      }, new Map<string, CatalogueProduct>())
      .values(),
  );

  return (
    <InventoryCatalog
      items={items.map((item) => ({
        variantId: item.variant_id,
        productId: item.product_id,
        name: item.name,
        label: item.label,
        sku: item.sku,
        inStock: item.on_hand_quantity,
        reserved: item.reserved_quantity,
        available: item.available,
        lowStockThreshold: item.low_stock_threshold,
        storefrontEnabled: item.storefront_enabled,
      }))}
      catalogue={catalogue}
      health={health}
      sort={sort}
      direction={direction}
      page={page}
      pageCount={pageCount}
      total={total}
      pageSize={pageSize}
    />
  );
}
