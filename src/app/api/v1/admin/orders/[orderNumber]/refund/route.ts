import { NextRequest } from "next/server";
import { ApiError, apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { manualRefundSchema, recordManualRefund } from "@/server/operations";
import { requireAdmin } from "@/server/request-auth";

export async function POST(request: NextRequest, context: { params: Promise<{ orderNumber: string }> }) {
  try {
    const admin = await requireAdmin(request);
    if (admin.role !== "ADMIN") throw new ApiError(403, "FORBIDDEN", "Administrator access is required to record refunds.");
    const [{ orderNumber }, input] = await Promise.all([context.params, parseJson(request, manualRefundSchema)]);
    return apiSuccess(await recordManualRefund(orderNumber, admin.id, input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
