export interface DeliveryLocationDetails {
  area: string;
  addressLine: string;
  latitude: number;
  longitude: number;
  instructions: string;
  distanceKm?: number;
  chargedKilometres?: number;
  ratePerKm?: number;
  feeKsh?: number;
}

function getPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Your device does not support location services."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, (error) => {
      reject(new Error(error.code === error.PERMISSION_DENIED
        ? "Allow location access in your browser, then try again."
        : "We could not get your current location. Check your connection and try again."));
    }, { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 });
  });
}

export async function getCurrentDeliveryLocation(instructions = ""): Promise<DeliveryLocationDetails> {
  const position = await getPosition();
  const { latitude, longitude } = position.coords;
  let response: Response;
  try {
    response = await fetch("/api/v1/delivery-areas/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude, longitude }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error("We couldn’t check delivery from your location. Check your connection and try again.");
  }
  const payload = await response.json().catch(() => null) as {
    data?: {
      serviceable: boolean;
      area: { name: string } | null;
      distanceKm?: number;
      chargedKilometres?: number;
      ratePerKm?: number;
      deliveryFee?: number;
    };
    error?: { message?: string };
  } | null;
  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error?.message ?? "We could not check delivery to your location. Try again.");
  }
  if (!payload.data.serviceable || !payload.data.area) {
    throw new Error("We do not currently deliver to your current location.");
  }

  return {
    area: payload.data.area.name,
    addressLine: "Current location",
    latitude,
    longitude,
    instructions,
    distanceKm: payload.data.distanceKm,
    chargedKilometres: payload.data.chargedKilometres,
    ratePerKm: payload.data.ratePerKm,
    feeKsh: payload.data.deliveryFee,
  };
}
