import { NextRequest } from "next/server";
import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { transitionOrder, transitionOrderSchema } from "@/server/operations";
import { requireAdmin } from "@/server/request-auth";
export async function PATCH(request: NextRequest, context: { params: Promise<{ orderNumber: string }> }) {
  try { const user = await requireAdmin(request); const [{ orderNumber }, input] = await Promise.all([context.params, parseJson(request, transitionOrderSchema)]); return apiSuccess(await transitionOrder(orderNumber, input.status, user.id, "admin", input.note)); }
  catch (error) { return apiErrorResponse(error); }
}
