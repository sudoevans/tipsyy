import { NextRequest } from "next/server";
import { apiErrorResponse, apiSuccess } from "@/server/http";
import { getRiderForUser, listRiderDeliveries } from "@/server/operations";
import { requireUser } from "@/server/request-auth";
export async function GET(request: NextRequest) {
  try { const user = await requireUser(request, ["RIDER"]); const rider = await getRiderForUser(user.id); return apiSuccess(await listRiderDeliveries(rider.id)); }
  catch (error) { return apiErrorResponse(error); }
}

