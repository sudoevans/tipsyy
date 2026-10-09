import { z } from "zod";

import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";

const schema = z.union([
  z.object({ name: z.string().trim().min(2).max(160) }),
  z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
]);

const deliveryAreas = [
  { slug: "karatina-university-kagochi", name: "Karatina University — Kagochi", secondary_name: "Kagochi, Nyeri", fee_minor: 250, estimated_min_minutes: 30, estimated_max_minutes: 55, latitude: -0.482236, longitude: 37.126167, service_radius_km: 6 },
  { slug: "karatina-town", name: "Karatina Town", secondary_name: "Karatina, Nyeri", fee_minor: 250, estimated_min_minutes: 25, estimated_max_minutes: 50, latitude: -0.484006, longitude: 37.127897, service_radius_km: 7 },
  { slug: "ihwagi", name: "Ihwagi", secondary_name: "Karatina, Nyeri", fee_minor: 300, estimated_min_minutes: 35, estimated_max_minutes: 65, latitude: -0.4518, longitude: 37.1159, service_radius_km: 8 },
  { slug: "kibirigwi", name: "Kibirigwi", secondary_name: "Kianyaga, Nyeri", fee_minor: 350, estimated_min_minutes: 45, estimated_max_minutes: 80, latitude: -0.4099, longitude: 37.2097, service_radius_km: 12 },
  { slug: "kinoo-ward", name: "Kinoo ward", secondary_name: "Kikuyu, Kiambu", fee_minor: 250, estimated_min_minutes: 30, estimated_max_minutes: 55, latitude: -1.25591, longitude: 36.70018, service_radius_km: 8 },
];

function distanceKm(latitude: number, longitude: number, area: typeof deliveryAreas[number]) {
  const radians = Math.PI / 180;
  const latitudeDifference = (area.latitude - latitude) * radians;
  const longitudeDifference = (area.longitude - longitude) * radians;
  const a = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(latitude * radians) * Math.cos(area.latitude * radians) * Math.sin(longitudeDifference / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const area = "name" in input
      ? deliveryAreas.find((candidate) => candidate.name.toLowerCase() === input.name.toLowerCase()
        || candidate.name.toLowerCase().includes(input.name.toLowerCase()))
      : deliveryAreas
        .map((candidate) => ({ candidate, distance: distanceKm(input.latitude, input.longitude, candidate) }))
        .sort((left, right) => left.distance - right.distance)[0]?.candidate;
    const serviceable = area
      ? (!("latitude" in input) || distanceKm(input.latitude, input.longitude, area) <= area.service_radius_km)
      : false;
    return apiSuccess({ serviceable, area: serviceable ? area : null });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
