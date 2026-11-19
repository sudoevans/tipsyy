import { apiErrorResponse, apiSuccess, ApiError } from "@/server/http";
import { getGuestOrder } from "@/server/orders";
import { enforceRateLimit } from "@/server/rate-limit";
import { hashSecret } from "@/server/security";
import { requireSessionSecret } from "@/server/env";
import { createPaymentLiveToken, paymentLivePath, PAYMENT_LIVE_COOKIE } from "@/server/payment-live-auth";

// Authorize once over HTTPS. The browser sends this HttpOnly cookie on upgrade;
// the order bearer token never appears in a WebSocket URL or protocol header.
export async function GET(request: Request, context: { params: Promise<{ orderNumber: string }> }) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new ApiError(401, "ORDER_ACCESS_REQUIRED", "Order access is required.");
    const token = authorization.slice(7);
    const { orderNumber } = await context.params;
    await enforceRateLimit("order-live:" + hashSecret(orderNumber + ":" + token), 20, 60);
    await getGuestOrder(orderNumber, token);
    const path = paymentLivePath(orderNumber);
    const ticket = await createPaymentLiveToken(orderNumber, requireSessionSecret());
    return apiSuccess({ webSocketPath: path }, { headers: {
      "Cache-Control": "private, no-store",
      "Set-Cookie": `${PAYMENT_LIVE_COOKIE}=${ticket}; Path=${path}; HttpOnly; SameSite=Strict; Max-Age=120${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
    } });
  } catch (error) {
    return apiErrorResponse(error, undefined, "checkout.live.authorize");
  }
}
