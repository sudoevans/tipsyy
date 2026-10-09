import ProductDetails from "@/components/storefront/ProductDetails";
import type { CategoryId, ProductId, StoreProduct } from "@/components/storefront/data";
import { sql } from "@/server/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProductDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await sql<{
    slug: string;
    name: string;
    category_slug: string;
    image_url: string | null;
    price_minor: number;
    size_label: string | null;
    available_quantity: number;
  }[]>`
    SELECT p.slug, p.name, c.slug AS category_slug, p.image_url, pv.price_minor, pv.size_label,
           GREATEST(0, i.on_hand_quantity - i.reserved_quantity) AS available_quantity
    FROM products p
    JOIN categories c ON c.id = p.category_id
    JOIN product_variants pv ON pv.product_id = p.id AND pv.is_default = true AND pv.active = true
    JOIN inventory i ON i.variant_id = pv.id
    WHERE p.slug = ${id} AND p.active = true
  `;

  if (!row) notFound();
  const product: StoreProduct = {
    id: row.slug as ProductId,
    name: row.name,
    category: row.category_slug as CategoryId,
    price: row.price_minor,
    size: row.size_label && !["standard", "option 1"].includes(row.size_label.trim().toLocaleLowerCase()) ? row.size_label : "",
    imageUrl: row.image_url ?? undefined,
    rating: "",
    available: row.available_quantity > 0,
    availableQuantity: row.available_quantity,
  };

  return <ProductDetails product={product} />;
}
