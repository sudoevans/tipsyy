import { PAYMENT_LIVE_COOKIE, verifyPaymentLiveToken } from "./payment-live-auth";

export async function upgradePaymentConnection(
  request: Request,
  orderNumber: string,
  namespace: CloudflareEnv["ORDER_PAYMENT_UPDATES"],
  secret: string,
) {
  if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("WebSocket upgrade required.", { status: 426 });
  }
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return new Response("Invalid origin.", { status: 403 });
  }
  const cookie = request.headers.get("Cookie")?.split(";")
    .map((part) => part.trim()).find((part) => part.startsWith(`${PAYMENT_LIVE_COOKIE}=`));
  try {
    if (!cookie || !secret) throw new Error("Missing subscription.");
    await verifyPaymentLiveToken(cookie.slice(PAYMENT_LIVE_COOKIE.length + 1), orderNumber, secret);
  } catch {
    return new Response("Please reconnect to your order.", { status: 401 });
  }
  // Forward no cookies or customer credentials to the Durable Object.
  return namespace.getByName(orderNumber).fetch(new Request("https://payment-updates/live", {
    headers: { Upgrade: "websocket" },
  }));
}
