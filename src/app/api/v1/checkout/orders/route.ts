import { createCheckoutOrder, createOrderSchema } from "@/server/checkout";
import { getCart, resolveCartIdentity } from "@/server/cart";
import { CART_COOKIE } from "@/server/cart-cookie";
import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { SESSION_COOKIE } from "@/server/session-cookie";
import { initiateOrderPayment } from "@/server/payments";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  try {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    await enforceRateLimit(`checkout:${forwarded ?? "local"}`, 20, 60);
    const input = await parseJson(request, createOrderSchema);
    const identity = await resolveCartIdentity(request.cookies.get(SESSION_COOKIE)?.value, request.cookies.get(CART_COOKIE)?.value);
    const cart = await getCart(identity);
    const order = await createCheckoutOrder(input, cart.id);
    const payment = input.paymentIdempotencyKey
      ? await initiateOrderPayment({
          orderNumber: order.orderNumber,
          accessToken: order.accessToken,
          idempotencyKey: input.paymentIdempotencyKey,
        })
      : null;
    console.info(JSON.stringify({ level: "info", event: "checkout.order_created", requestId, durationMs: Math.round(performance.now() - startedAt) }));
    return apiSuccess({ ...order, payment }, { status: 201 });
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", event: "checkout.order_failed", requestId, durationMs: Math.round(performance.now() - startedAt), errorName: error instanceof Error ? error.name : "Unknown" }));
    return apiErrorResponse(error, requestId, "/api/v1/checkout/orders");
  }
}
