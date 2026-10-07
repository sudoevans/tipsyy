import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { initiateOrderPayment, initiatePaymentSchema } from "@/server/payments";
import { enforceRateLimit } from "@/server/rate-limit";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    await enforceRateLimit(`mpesa-initiate:${forwarded ?? "local"}`, 8, 60);
    const input = await parseJson(request, initiatePaymentSchema);
    return apiSuccess(await initiateOrderPayment(input), { status: 202 });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
