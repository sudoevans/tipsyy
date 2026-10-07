import { sql } from "@/server/db";
import { apiErrorResponse, apiSuccess } from "@/server/http";

export async function GET() {
  try {
    const areas = await sql`
      SELECT slug, name, secondary_name, fee_minor, currency, latitude, longitude,
             service_radius_km, estimated_min_minutes, estimated_max_minutes
      FROM delivery_areas WHERE active = true ORDER BY sort_order, name
    `;
    return apiSuccess(areas);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
