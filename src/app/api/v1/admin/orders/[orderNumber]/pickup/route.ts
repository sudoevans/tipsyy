import { NextRequest } from "next/server";
import { apiErrorResponse, apiSuccess } from "@/server/http";
import { markOrderPickedUp } from "@/server/operations";
import { requireAdmin } from "@/server/request-auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderNumber: string }> },
) {
  try {
    const user = await requireAdmin(request);
    const { orderNumber } = await context.params;
    return apiSuccess(await markOrderPickedUp(orderNumber, user.id));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
