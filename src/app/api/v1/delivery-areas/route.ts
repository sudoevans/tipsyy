import { sql } from "@/server/db";
import { apiErrorResponse, apiSuccess } from "@/server/http";

export async function GET() {
  try {
    const [setting] = await sql<{ amount_minor: number }[]>`
      SELECT COALESCE((value->>'amount_minor')::integer,5000) AS amount_minor
      FROM platform_settings WHERE key='delivery.price_per_km'
    `;
    return apiSuccess({
      pricingMode: "PER_KM",
      ratePerKm: setting?.amount_minor ?? 5000,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
