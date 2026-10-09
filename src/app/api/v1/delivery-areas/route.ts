import { sql } from "@/server/db";
import { apiErrorResponse, apiSuccess } from "@/server/http";

const fallbackAreas = [
  { slug: "karatina-university-kagochi", name: "Karatina University — Kagochi", secondary_name: "Kagochi, Nyeri", fee_minor: 250, estimated_min_minutes: 30, estimated_max_minutes: 55 },
  { slug: "karatina-town", name: "Karatina Town", secondary_name: "Karatina, Nyeri", fee_minor: 250, estimated_min_minutes: 25, estimated_max_minutes: 50 },
  { slug: "ihwagi", name: "Ihwagi", secondary_name: "Karatina, Nyeri", fee_minor: 300, estimated_min_minutes: 35, estimated_max_minutes: 65 },
  { slug: "kibirigwi", name: "Kibirigwi", secondary_name: "Kianyaga, Nyeri", fee_minor: 350, estimated_min_minutes: 45, estimated_max_minutes: 80 },
  { slug: "kinoo-ward", name: "Kinoo ward", secondary_name: "Kikuyu, Kiambu", fee_minor: 250, estimated_min_minutes: 30, estimated_max_minutes: 55 },
];

export async function GET() {
  try {
    const areas = await Promise.race([
      sql`
      SELECT slug, name, secondary_name, fee_minor,
             estimated_min_minutes, estimated_max_minutes
      FROM delivery_areas WHERE active = true ORDER BY sort_order, name
      `,
      new Promise<readonly typeof fallbackAreas[number][]>((resolve) =>
        setTimeout(() => resolve(fallbackAreas), 1500),
      ),
    ]);
    return apiSuccess(areas);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
