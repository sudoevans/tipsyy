import type { DeliveryLocationDetails } from "./deliveryLocation";

export const CART_STORAGE_KEY = "tipsy-theoryy-cart";
export const DELIVERY_LOCATION_STORAGE_KEY = "tipsy-theoryy-delivery-location";
const CHECKOUT_DETAILS_STORAGE_KEY = "tipsy-theoryy-checkout-details";
const COUPON_STORAGE_KEY = "tipsy-theoryy-coupon";

export interface CheckoutDetails {
  name: string;
  phone: string;
}

type CartSnapshot = Record<string, number>;

let cartWriteQueue: Promise<unknown> = Promise.resolve();
let latestCartWrite: Promise<CartSnapshot> | null = null;

function cartItems(cart: CartSnapshot) {
  return Object.entries(cart)
    .filter(([, quantity]) => Number.isInteger(quantity) && quantity > 0)
    .map(([productSlug, quantity]) => ({ productSlug, quantity }));
}

async function writeCartItems(cart: CartSnapshot) {
  const response = await fetch("/api/v1/cart", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    // Delivery location and promotions are validated when the order is created,
    // so an unrelated saved value can never block adding an available product.
    body: JSON.stringify({ items: cartItems(cart) }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: { items?: Array<{ productSlug: string; quantity: number }> };
    error?: { message?: string };
  };
  if (!response.ok || !payload.data) {
    const error = new Error(
      payload.error?.message ??
        "We could not update your cart. Please try again.",
    );
    Object.assign(error, { status: response.status });
    throw error;
  }
  const confirmed = Object.fromEntries(
    (payload.data.items ?? []).map((item) => [item.productSlug, item.quantity]),
  );
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(confirmed));
  return confirmed;
}

export function confirmCartForCheckout(cart: CartSnapshot) {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  const request = cartWriteQueue
    .catch(() => undefined)
    .then(() => writeCartItems(cart))
    .catch((error: unknown) => {
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? Number(error.status)
          : null;
      if (status !== null && status < 500) throw error;
      // Keep the cart usable if the background server sync is temporarily
      // unavailable. Checkout always validates stock and pricing again.
      return cart;
    });
  cartWriteQueue = request.catch(() => undefined);
  latestCartWrite = request;
  return request;
}

export function saveCartForCheckout(cart: Record<string, number>) {
  void confirmCartForCheckout(cart).catch(() => undefined);
}

export function clearCartForCheckout() {
  window.localStorage.removeItem(CART_STORAGE_KEY);
  window.localStorage.removeItem(COUPON_STORAGE_KEY);
}

export function readCartForCheckout() {
  try {
    const stored = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!stored) return {};

    const parsed = JSON.parse(stored) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, quantity]) => typeof quantity === "number" && quantity > 0,
      ),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

export async function restoreCartForCheckout() {
  while (latestCartWrite) {
    const currentWrite = latestCartWrite;
    try {
      const syncedCart = await currentWrite;
      if (currentWrite === latestCartWrite) {
        latestCartWrite = null;
        return syncedCart;
      }
    } catch {
      if (currentWrite === latestCartWrite) {
        latestCartWrite = null;
        return readCartForCheckout();
      }
    }
  }

  const localCart = readCartForCheckout();
  try {
    const response = await fetch("/api/v1/cart", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) return localCart;
    const payload = (await response.json()) as {
      data?: { items?: Array<{ productSlug: string; quantity: number }> };
    };
    const serverCart = Object.fromEntries(
      (payload.data?.items ?? []).map((item) => [
        item.productSlug,
        item.quantity,
      ]),
    );
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(serverCart));
    return serverCart;
  } catch {
    return localCart;
  }
}

export function saveDeliveryLocation(
  location: string | DeliveryLocationDetails,
) {
  window.localStorage.setItem(
    DELIVERY_LOCATION_STORAGE_KEY,
    typeof location === "string" ? location : JSON.stringify(location),
  );
  window.dispatchEvent(new Event("tipsy:delivery-location-changed"));
}

export function readDeliveryLocation() {
  return readDeliveryDetails()?.area ?? "";
}

export function readDeliveryDetails(): DeliveryLocationDetails | null {
  const stored = window.localStorage.getItem(DELIVERY_LOCATION_STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as Partial<DeliveryLocationDetails>;
    if (
      typeof parsed.area === "string" &&
      typeof parsed.addressLine === "string" &&
      typeof parsed.latitude === "number" &&
      typeof parsed.longitude === "number"
    ) {
      return {
        area: parsed.area,
        addressLine: parsed.addressLine,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        instructions:
          typeof parsed.instructions === "string" ? parsed.instructions : "",
      };
    }
  } catch {
    // Older sessions stored only the selected delivery area name.
    return {
      area: stored,
      addressLine: stored,
      latitude: Number.NaN,
      longitude: Number.NaN,
      instructions: "",
    };
  }
  return null;
}

export function saveCouponCode(code: string) {
  if (code) window.localStorage.setItem(COUPON_STORAGE_KEY, code);
  else window.localStorage.removeItem(COUPON_STORAGE_KEY);
}

export function readCouponCode() {
  return window.localStorage.getItem(COUPON_STORAGE_KEY) ?? "";
}

export function saveCheckoutDetails(details: CheckoutDetails) {
  window.sessionStorage.setItem(
    CHECKOUT_DETAILS_STORAGE_KEY,
    JSON.stringify(details),
  );
}

export function readCheckoutDetails(): CheckoutDetails {
  try {
    const stored = window.sessionStorage.getItem(CHECKOUT_DETAILS_STORAGE_KEY);
    if (!stored) return { name: "", phone: "" };

    const parsed = JSON.parse(stored) as Partial<CheckoutDetails>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : "",
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
    };
  } catch {
    return { name: "", phone: "" };
  }
}
