import { apiSuccess } from "@/server/http";

const fallbackAreas = [
  { slug: "karatina-university-kagochi", name: "Karatina University — Kagochi", secondary_name: "Kagochi, Nyeri", fee_minor: 250, estimated_min_minutes: 30, estimated_max_minutes: 55 },
  { slug: "karatina-town", name: "Karatina Town", secondary_name: "Karatina, Nyeri", fee_minor: 250, estimated_min_minutes: 25, estimated_max_minutes: 50 },
  { slug: "ihwagi", name: "Ihwagi", secondary_name: "Karatina, Nyeri", fee_minor: 300, estimated_min_minutes: 35, estimated_max_minutes: 65 },
  { slug: "kibirigwi", name: "Kibirigwi", secondary_name: "Kianyaga, Nyeri", fee_minor: 350, estimated_min_minutes: 45, estimated_max_minutes: 80 },
  { slug: "kinoo-ward", name: "Kinoo ward", secondary_name: "Kikuyu, Kiambu", fee_minor: 250, estimated_min_minutes: 30, estimated_max_minutes: 55 },
  { slug: "test", name: "Test", secondary_name: "Test delivery area", fee_minor: 1, estimated_min_minutes: null, estimated_max_minutes: null },
];

export async function GET() {
  // Keep the storefront location picker available even while a cold Worker
  // isolate is establishing its database connection. Admin edits are persisted
  // in `delivery_areas`; these launch locations are the public defaults.
  return apiSuccess(fallbackAreas);
}
