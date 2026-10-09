import { z } from "zod";

import { calculateDeliveryPrice } from "@/server/delivery-pricing";
import { withTransaction } from "@/server/db";
import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";

const schema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const delivery = await withTransaction((tx) =>
      calculateDeliveryPrice(tx, input.latitude, input.longitude),
    );
    return apiSuccess({
      serviceable: true,
      area: { name: delivery.store.name },
      deliveryFee: delivery.feeMinor,
      distanceKm: Math.round(delivery.distanceKm * 100) / 100,
      ratePerKm: delivery.rateMinor,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
