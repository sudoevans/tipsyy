export interface DeliveryLocationDetails {
  area: string;
  addressLine: string;
  latitude: number;
  longitude: number;
  instructions: string;
}

interface ReverseGeocodeResponse {
  address?: Record<string, string | undefined>;
  display_name?: string;
}

function readableLocation(response: ReverseGeocodeResponse) {
  const address = response.address ?? {};
  const area = address.neighbourhood || address.suburb || address.village || address.town || address.city_district || address.city || address.county;
  const town = address.city || address.town || address.village || address.county;
  const values = [area, town].filter((value, index, items) => Boolean(value) && items.indexOf(value) === index);
  return values.join(", ") || response.display_name?.split(",").slice(0, 2).join(",").trim() || null;
}

function reverseGeocode(latitude: number, longitude: number) {
  return new Promise<string>((resolve, reject) => {
    const callbackName = `tipsyTheoryyReverseGeocode${Date.now()}`;
    const callbackHost = window as typeof window & Record<string, unknown>;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => cleanup(new Error("Location lookup timed out")), 8000);

    const cleanup = (error?: Error, result?: string) => {
      window.clearTimeout(timeout);
      script.remove();
      delete callbackHost[callbackName];
      if (error) reject(error);
      else if (result) resolve(result);
    };

    callbackHost[callbackName] = (response: ReverseGeocodeResponse) => {
      const name = readableLocation(response);
      if (!name) {
        cleanup(new Error("We could not read the address for your location."));
        return;
      }
      cleanup(undefined, name);
    };

    script.onerror = () => cleanup(new Error("Location lookup failed"));
    script.src = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&lat=${latitude}&lon=${longitude}&json_callback=${callbackName}`;
    document.body.appendChild(script);
  });
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
  const response = await fetch("/api/v1/delivery-areas/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ latitude, longitude }),
  });
  const payload = await response.json().catch(() => null) as {
    data?: { serviceable: boolean; area: { name: string } | null };
    error?: { message?: string };
  } | null;
  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error?.message ?? "We could not check delivery to your location. Try again.");
  }
  if (!payload.data.serviceable || !payload.data.area) {
    throw new Error("We do not currently deliver to your current location.");
  }

  let addressLine = "Current location";
  try {
    addressLine = await reverseGeocode(latitude, longitude);
  } catch {
    // The precise coordinates remain attached to the order if address lookup is unavailable.
  }

  return { area: payload.data.area.name, addressLine, latitude, longitude, instructions };
}
