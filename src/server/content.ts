import { sql } from "./db";

export async function getHomeContent() {
  const banners = await sql`
    SELECT key, title, body, image_url, link_url, metadata
    FROM content_blocks
    WHERE active = true AND kind = 'HERO_BANNER'
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at IS NULL OR ends_at > now())
    ORDER BY sort_order, created_at
  `;
  const featuredProducts = await sql`
    SELECT p.slug, p.name, p.image_url FROM products p
    WHERE p.active = true AND p.featured = true ORDER BY p.updated_at DESC LIMIT 10
  `;
  return { banners, featuredProducts };
}

