import { z } from "zod";

import { sql } from "@/server/db";
import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";

const schema = z.union([
  z.object({ name: z.string().trim().min(2).max(160) }),
  z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
]);

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const areas = "name" in input
      ? await sql`
          SELECT slug, name, secondary_name, fee_minor, estimated_min_minutes, estimated_max_minutes
          FROM delivery_areas
          WHERE active = true AND (lower(name) = lower(${input.name}) OR lower(name) LIKE '%' || lower(${input.name}) || '%')
          ORDER BY CASE WHEN lower(name) = lower(${input.name}) THEN 0 ELSE 1 END, sort_order
          LIMIT 1
        `
      : await sql`
          SELECT slug, name, secondary_name, fee_minor, estimated_min_minutes, estimated_max_minutes, service_radius_km,
            6371 * acos(LEAST(1, GREATEST(-1,
              cos(radians(${input.latitude})) * cos(radians(latitude::double precision)) *
              cos(radians(longitude::double precision) - radians(${input.longitude})) +
              sin(radians(${input.latitude})) * sin(radians(latitude::double precision))
            ))) AS distance_km
          FROM delivery_areas
          WHERE active = true AND latitude IS NOT NULL AND longitude IS NOT NULL AND service_radius_km IS NOT NULL
          ORDER BY distance_km
          LIMIT 1
        `;
    const area = areas[0];
    const serviceable = Boolean(area) && (!("distance_km" in (area ?? {})) || Number(area.distance_km) <= Number(area.service_radius_km ?? Number.POSITIVE_INFINITY));
    return apiSuccess({ serviceable, area: serviceable ? area : null });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
