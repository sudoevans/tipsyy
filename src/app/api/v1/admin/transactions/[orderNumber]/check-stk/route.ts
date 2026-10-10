import { apiErrorResponse, apiSuccess } from "@/server/http";
import { checkStkStatusForAdmin } from "@/server/payments";
import { requireAdmin } from "@/server/request-auth";

export async function POST(request: NextRequest, context: { params: Promise<{ orderNumber: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    await requireAdmin(request);
    const { orderNumber } = await context.params;
    return apiSuccess(await checkStkStatusForAdmin(orderNumber));
  } catch (error) {
    return apiErrorResponse(error, requestId, "admin.transactions.check-stk");
  }
}
import type { NextRequest } from "next/server";
