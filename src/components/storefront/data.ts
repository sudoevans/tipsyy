export type CategoryId = "whisky" | "beer" | "wine" | "vodka" | "mixers" | "gin" | "rum" | "spirits" | "smokes";
export type ProductId =
  | "glenmorangie" | "jack-daniels" | "red-label" | "chalawan" | "woodford" | "glenlivet"
  | "kc-pineapple" | "kc-ginger" | "kc-smooth" | "vat-69" | "kane-extra" | "captain-morgan-gold"
  | "captain-morgan-muck-pit" | "black-and-white" | "viceroy" | "general-meakins" | "hunters-choice"
  | "county" | "gilbeys" | "four-cousins" | "caprice" | "4th-street" | "pineapple-punch"
  | "manyatta" | "smirnoff-ice" | "lemonade" | "coca-cola-1l" | "shisha";

export interface StoreCategory {
  id: CategoryId;
  imageUrl: string;
}

export interface StoreProduct {
  id: ProductId;
  name?: string;
  category: CategoryId;
  price: number;
  rating: string;
  size: string;
  imageUrl?: string;
  available?: boolean;
  availableQuantity?: number;
  badge?: "staffPick" | "deal" | "available";
  variants?: Array<{ id: string; label: string; price: number; size: string }>;
}

export const categories: StoreCategory[] = [
  { id: "whisky", imageUrl: "https://images.unsplash.com/photo-1527281400683-1aae777175f8?auto=format&fit=crop&w=600&q=85" },
  { id: "spirits", imageUrl: "https://images.unsplash.com/photo-1547595628-c61a29f496f0?auto=format&fit=crop&w=600&q=85" },
  { id: "rum", imageUrl: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f?auto=format&fit=crop&w=600&q=85" },
  { id: "beer", imageUrl: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=85" },
  { id: "wine", imageUrl: "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=600&q=85" },
  { id: "vodka", imageUrl: "https://images.unsplash.com/photo-1547595628-c61a29f496f0?auto=format&fit=crop&w=600&q=85" },
  { id: "mixers", imageUrl: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=85" },
  { id: "gin", imageUrl: "https://images.unsplash.com/photo-1574096079513-d8259312b785?auto=format&fit=crop&w=600&q=85" },
  { id: "smokes", imageUrl: "https://images.unsplash.com/photo-1527281400683-1aae777175f8?auto=format&fit=crop&w=600&q=85" },
];

const pending = { available: false, price: 0, rating: "New", size: "Details coming soon" } as const;

export const products: StoreProduct[] = [
  { id: "glenmorangie", category: "whisky", price: 6500, rating: "4.8", size: "700 ml", imageUrl: "https://images.unsplash.com/photo-1569529465841-dfecdab7503b?auto=format&fit=crop&w=900&q=85", badge: "staffPick", variants: [{ id: "700ml", label: "700 ml", price: 6500, size: "700 ml" }, { id: "1l", label: "1 litre", price: 8900, size: "1 litre" }] },
  { id: "jack-daniels", category: "whisky", price: 5200, rating: "4.7", size: "750 ml", imageUrl: "https://images.unsplash.com/photo-1527281400683-1aae777175f8?auto=format&fit=crop&w=900&q=85", badge: "deal", variants: [{ id: "750ml", label: "750 ml", price: 5200, size: "750 ml" }, { id: "1l", label: "1 litre", price: 6900, size: "1 litre" }] },
  { id: "red-label", category: "whisky", price: 3200, rating: "4.6", size: "700 ml", imageUrl: "/images/products/red-label.jpg", badge: "available" },
  { id: "chalawan", category: "beer", price: 450, rating: "4.5", size: "330 ml", imageUrl: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=900&q=85" },
  { id: "woodford", category: "whisky", price: 7600, rating: "4.6", size: "700 ml", imageUrl: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f?auto=format&fit=crop&w=900&q=85", badge: "staffPick", variants: [{ id: "700ml", label: "700 ml", price: 7600, size: "700 ml" }, { id: "1l", label: "1 litre", price: 9800, size: "1 litre" }] },
  { id: "glenlivet", category: "whisky", price: 8800, rating: "4.5", size: "700 ml", imageUrl: "https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=900&q=85" },
  { id: "kc-pineapple", category: "spirits", imageUrl: "/images/products/kc-pineapple.jpg", ...pending },
  { id: "kc-ginger", category: "spirits", imageUrl: "/images/products/kc-ginger.jpg", ...pending },
  { id: "kc-smooth", category: "spirits", ...pending },
  { id: "vat-69", category: "whisky", ...pending },
  { id: "kane-extra", category: "spirits", imageUrl: "/images/products/kane-extra.jpg", ...pending },
  { id: "captain-morgan-gold", category: "rum", imageUrl: "/images/products/captain-morgan-gold.jpg", ...pending },
  { id: "captain-morgan-muck-pit", category: "rum", imageUrl: "/images/products/captain-morgan-muck-pit.jpg", ...pending },
  { id: "black-and-white", category: "whisky", ...pending },
  { id: "viceroy", category: "spirits", imageUrl: "/images/products/viceroy.jpg", ...pending },
  { id: "general-meakins", category: "spirits", ...pending },
  { id: "hunters-choice", category: "whisky", imageUrl: "/images/products/hunters-choice.jpg", ...pending },
  { id: "county", category: "spirits", imageUrl: "/images/products/county.jpg", ...pending },
  { id: "gilbeys", category: "gin", imageUrl: "/images/products/gilbeys-gin.jpg", ...pending },
  { id: "four-cousins", category: "wine", imageUrl: "/images/products/four-cousins.jpg", ...pending },
  { id: "caprice", category: "wine", imageUrl: "/images/products/caprice.jpg", ...pending },
  { id: "4th-street", category: "wine", imageUrl: "/images/products/4th-street.jpg", ...pending },
  { id: "pineapple-punch", category: "mixers", imageUrl: "/images/products/pineapple-punch.jpg", ...pending },
  { id: "manyatta", category: "wine", imageUrl: "/images/products/manyatta.jpg", ...pending },
  { id: "smirnoff-ice", category: "beer", ...pending },
  { id: "lemonade", category: "mixers", imageUrl: "/images/products/lemonade.jpg", ...pending },
  { id: "coca-cola-1l", category: "mixers", imageUrl: "/images/products/coca-cola-1l.jpg", ...pending },
  { id: "shisha", category: "mixers", ...pending },
];
