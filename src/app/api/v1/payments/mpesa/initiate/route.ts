import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { initiateOrderPayment, initiatePaymentSchema } from "@/server/payments";
import { enforceRateLimit } from "@/server/rate-limit";
import { hashSecret } from "@/server/security";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  try {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const input = await parseJson(request, initiatePaymentSchema);
    await enforceRateLimit(`mpesa-initiate:${forwarded ?? "local"}`, 8, 60);
    await enforceRateLimit(`mpesa-initiate-order:${hashSecret(`${input.orderNumber}:${input.accessToken}`)}`, 3, 60);
    const result = await initiateOrderPayment(input);
    console.info(JSON.stringify({ level: "info", event: "checkout.mpesa_acknowledged", requestId, durationMs: Math.round(performance.now() - startedAt) }));
    return apiSuccess(result, { status: 202 });
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", event: "checkout.mpesa_failed", requestId, durationMs: Math.round(performance.now() - startedAt), errorName: error instanceof Error ? error.name : "Unknown" }));
    return apiErrorResponse(error, requestId);
  }
}
