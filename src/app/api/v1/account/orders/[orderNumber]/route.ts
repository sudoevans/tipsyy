import { NextRequest } from "next/server";
import { getCustomerOrder } from "@/server/customer";
import { apiErrorResponse, apiSuccess } from "@/server/http";
import { requireUser } from "@/server/request-auth";
export async function GET(request: NextRequest, context: { params: Promise<{ orderNumber: string }> }) {
  try { const user = await requireUser(request, ["CUSTOMER"]); const { orderNumber } = await context.params; return apiSuccess(await getCustomerOrder(user.id, orderNumber)); }
  catch (error) { return apiErrorResponse(error); }
}
