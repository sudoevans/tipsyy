import { apiErrorResponse, apiSuccess, ApiError } from "@/server/http";
import { getGuestOrder } from "@/server/orders";

export async function GET(request: Request, context: { params: Promise<{ orderNumber: string }> }) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new ApiError(401, "ORDER_ACCESS_REQUIRED", "Order access is required.");
    const { orderNumber } = await context.params;
    return apiSuccess(await getGuestOrder(orderNumber, authorization.slice(7)));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
