"use client";

import { useEffect, useState } from "react";

import type { CategoryId, ProductId, StoreProduct } from "./data";

interface CatalogRow {
  slug: string;
  name: string;
  image_url: string | null;
  featured: boolean;
  category_slug: string;
  size_label: string | null;
  price_minor: number;
  available_quantity: number;
}

export default function useCatalogProducts() {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/catalog/products", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { data?: CatalogRow[]; error?: { message?: string } };
        if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "The catalog could not be loaded.");
        setProducts(payload.data.map((row) => ({
          id: row.slug as ProductId,
          name: row.name,
          category: row.category_slug as CategoryId,
          price: row.price_minor,
          rating: "New",
          size: row.size_label ?? "",
          imageUrl: row.image_url ?? undefined,
          available: row.available_quantity > 0,
          availableQuantity: row.available_quantity,
          badge: row.featured ? "staffPick" : undefined,
        })));
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "The catalog could not be loaded.");
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, []);

  return { error, isLoading, products };
}
