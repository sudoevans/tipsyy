import type { Transaction } from "./db";
import { distanceInKm } from "./distance";
import { ApiError } from "./http";

export interface StoreLocationRow {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export async function calculateDeliveryPrice(
  tx: Transaction,
  latitude: number,
  longitude: number,
) {
  const stores = await tx<StoreLocationRow[]>`
    SELECT id,name,address,latitude::float8,longitude::float8
    FROM store_locations WHERE active = true
  `;
  if (!stores.length) {
    throw new ApiError(
      503,
      "DELIVERY_UNAVAILABLE",
      "Delivery is temporarily unavailable. Please try again shortly.",
    );
  }

  const nearest = stores
    .map((store) => ({
      store,
      distanceKm: distanceInKm(
        latitude,
        longitude,
        store.latitude,
        store.longitude,
      ),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
  if (!nearest)
    throw new ApiError(
      503,
      "DELIVERY_UNAVAILABLE",
      "Delivery is temporarily unavailable.",
    );

  const [setting] = await tx<{ amount_minor: number }[]>`
    SELECT COALESCE((value->>'amount_minor')::integer, 5000) AS amount_minor
    FROM platform_settings WHERE key = 'delivery.price_per_km'
  `;
  const rateMinor = setting?.amount_minor ?? 5000;
  const chargedKilometres = Math.max(1, Math.ceil(nearest.distanceKm));
  const feeMinor = chargedKilometres * rateMinor;
  if (!Number.isSafeInteger(feeMinor) || feeMinor > 2_147_483_647) {
    throw new ApiError(
      422,
      "DELIVERY_DISTANCE_INVALID",
      "We could not calculate a valid delivery fee for that location.",
    );
  }
  return {
    store: nearest.store,
    distanceKm: nearest.distanceKm,
    chargedKilometres,
    rateMinor,
    feeMinor,
  };
}
