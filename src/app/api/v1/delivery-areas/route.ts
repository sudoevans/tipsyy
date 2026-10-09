import { sql } from "@/server/db";
import { apiErrorResponse, apiSuccess } from "@/server/http";

export async function GET() {
  try {
    const [setting] = await sql<{ rate_per_km: number }[]>`
      SELECT COALESCE((value->>'amount_ksh_per_km')::integer,50) AS rate_per_km
      FROM platform_settings WHERE key='delivery.price_per_km'
    `;
    return apiSuccess({
      pricingMode: "PER_KM",
      ratePerKm: setting?.rate_per_km ?? 50,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
