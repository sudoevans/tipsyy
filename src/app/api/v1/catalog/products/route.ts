import { getCatalog } from "@/server/checkout";
import { apiErrorResponse, apiSuccess } from "@/server/http";
const imageBaseUrl = "https://pub-46248483ce91410896c8059df927180c.r2.dev/products";

const catalogSeed = [
  ["kc-pineapple", "KC Pineapple", "spirits", 849, 7, "kc-pineapple.jpg"],
  ["coca-cola-mixers", "Coca-Cola", "mixers", 119, 20, "coca-cola-1l.jpg"],
  ["extra-tumbler-s", "Extra Tumbler(s)", "mixers", 5, 125],
  ["kc-lemon-ginger", "KC Lemon & Ginger", "spirits", 849, 8, "kc-ginger.jpg"],
  ["vat-69", "VAT 69", "whisky", 1749, 3],
  ["kane-extra", "Kane Extra", "spirits", 699, 4, "kane-extra.jpg"],
  ["captain-morgan", "Captain Morgan", "whisky", 1199, 2, "captain-morgan-gold.jpg"],
  ["lemonade", "Lemonade", "mixers", 60, 10, "lemonade.jpg"],
  ["jw-red-label", "JW Red Label", "whisky", 2099, 2, "red-label.jpg"],
  ["viceroy", "Viceroy", "whisky", 1549, 4, "viceroy.jpg"],
  ["hunter-s-choice", "Hunter's Choice", "whisky", 1199, 1, "hunters-choice.jpg"],
  ["general-meakins", "General Meakins", "spirits", 799, 0],
  ["county", "County", "spirits", 819, 2, "county.jpg"],
  ["kc-smooth", "KC Smooth", "spirits", 849, 1],
  ["manyatta", "Manyatta", "beer", 350, 1, "manyatta.jpg"],
  ["black-white", "Black & White", "whisky", 1520, 0],
  ["shisha", "Shisha", "smokes", 1000, 987],
  ["smirnoff-ice-beer", "Smirnoff Ice", "beer", 300, 6],
  ["captain-muck-pit", "Captain Muck Pit", "whisky", 1299, 3, "captain-morgan-muck-pit.jpg"],
  ["jw-black-label", "JW Black Label", "whisky", 4999, 0],
  ["test-product", "Test Product", "whisky", 5, 1],
  ["smirnoff-ice-spirits", "Smirnoff Ice", "spirits", 300, 0],
  ["chrome-spirits", "Chrome", "spirits", 779, 0],
  ["john-barr-whisky", "Jōhn Barr", "whisky", 1899, 0],
  ["chrome-vodka", "Chrome", "vodka", 779, 1],
  ["four-cousins", "Four Cousins", "wine", 1199, 0, "four-cousins.jpg"],
  ["caprice", "Caprice", "wine", 1099, 0, "caprice.jpg"],
  ["4th-street", "4th Street", "wine", 1199, 0, "4th-street.jpg"],
  ["gilbey-s", "Gilbey's", "spirits", 1499, 3, "gilbeys-gin.jpg"],
  ["smirnoff", "Smirnoff", "vodka", 1549, 0],
  ["bond-7", "Bond 7", "whisky", 1499, 1],
  ["casa-buena", "Casa Buena", "wine", 899, 0],
  ["dasani", "Dasani", "mixers", 100, 23],
  ["rosso-nobile", "Rosso Nobile", "wine", 2249, 0],
  ["ti-white-house", "TI White House", "whisky", 1249, 0],
  ["faxe", "Faxe", "beer", 329, 0],
  ["grant-s", "Grant's", "whisky", 2499, 2],
] as const;

const fallbackCatalog = catalogSeed.map(([slug, name, category, price, stock, image]) => ({
  slug,
  name,
  description: null,
  image_url: image ? `${imageBaseUrl}/${image}` : null,
  alcohol_by_volume: null,
  featured: false,
  category_slug: category,
  category_name: category,
  brand_name: null,
  sku: `FALLBACK-${slug.toUpperCase()}`,
  label: "Standard",
  size_label: "Standard",
  price_minor: price,
  compare_at_price_minor: null,
  currency: "KES",
  available_quantity: stock,
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
