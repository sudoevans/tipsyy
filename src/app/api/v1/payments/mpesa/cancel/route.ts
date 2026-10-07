import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { cancelPendingOrderPayment, cancelPaymentSchema } from "@/server/payments";
import { enforceRateLimit } from "@/server/rate-limit";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    await enforceRateLimit(`mpesa-cancel:${forwarded ?? "local"}`, 8, 60);
    const input = await parseJson(request, cancelPaymentSchema);
    return apiSuccess(await cancelPendingOrderPayment(input));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
