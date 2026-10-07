import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { receiptLookupSchema, verifyReceipt } from "@/server/payments";
import { enforceRateLimit } from "@/server/rate-limit";

export async function POST(request: Request) {
  try {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    await enforceRateLimit(`mpesa-receipt:${forwarded ?? "local"}`, 8, 300);
    return apiSuccess(await verifyReceipt(await parseJson(request, receiptLookupSchema)));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
