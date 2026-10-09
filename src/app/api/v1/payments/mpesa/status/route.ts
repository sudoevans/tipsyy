import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import {
  checkPendingStkStatus,
  checkStkStatusSchema,
} from "@/server/payments";
import { enforceRateLimit } from "@/server/rate-limit";
import { hashSecret } from "@/server/security";
import { getGuestOrder } from "@/server/orders";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = await parseJson(request, checkStkStatusSchema);
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    await enforceRateLimit(
      `mpesa-status:${hashSecret(`${input.orderNumber}:${input.accessToken}`)}`,
      8,
      60,
    );
    if (forwarded) await enforceRateLimit(`mpesa-status-ip:${forwarded}`, 60, 60);

    await checkPendingStkStatus(input);
    return apiSuccess(await getGuestOrder(input.orderNumber, input.accessToken));
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
