import { getCatalog } from "@/server/checkout";
import { apiErrorResponse, apiSuccess } from "@/server/http";
import { products as storefrontProducts } from "@/components/storefront/data";

const fallbackCatalog = storefrontProducts.map((product) => ({
  slug: product.id,
  name: product.name ?? product.id,
  description: null,
  image_url: product.imageUrl ?? null,
  alcohol_by_volume: null,
  featured: product.badge === "staffPick",
  category_slug: product.category,
  category_name: product.category,
  brand_name: null,
  sku: `FALLBACK-${product.id.toUpperCase()}`,
  label: product.size,
  size_label: product.size,
  price_minor: product.price,
  compare_at_price_minor: null,
  currency: "KES",
  available_quantity: 10,
}));

export async function GET() {
  try {
    const catalog = await Promise.race([
      getCatalog(),
      new Promise<typeof fallbackCatalog>((resolve) =>
        setTimeout(() => resolve(fallbackCatalog), 1200),
      ),
    ]);
    return apiSuccess(catalog);
  } catch (error) {
    return apiSuccess(fallbackCatalog);
  }
}
