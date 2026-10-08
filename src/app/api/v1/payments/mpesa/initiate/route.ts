import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { initiateOrderPayment, initiatePaymentSchema } from "@/server/payments";
import { enforceRateLimit } from "@/server/rate-limit";
import { hashSecret } from "@/server/security";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const input = await parseJson(request, initiatePaymentSchema);
    await enforceRateLimit(`mpesa-initiate:${forwarded ?? "local"}`, 8, 60);
    await enforceRateLimit(`mpesa-initiate-order:${hashSecret(`${input.orderNumber}:${input.accessToken}`)}`, 3, 60);
    return apiSuccess(await initiateOrderPayment(input), { status: 202 });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
