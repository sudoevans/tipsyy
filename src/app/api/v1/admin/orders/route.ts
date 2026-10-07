import { NextRequest } from "next/server";
import { apiErrorResponse, apiSuccess } from "@/server/http";
import { listOperationalOrders } from "@/server/operations";
import { requireAdmin } from "@/server/request-auth";
export async function GET(request: NextRequest) {
  try { await requireAdmin(request); return apiSuccess(await listOperationalOrders(request.nextUrl.searchParams.get("status") ?? undefined)); }
  catch (error) { return apiErrorResponse(error); }
}
