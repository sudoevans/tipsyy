import { NextRequest } from "next/server";
import { getCustomerProfile, profileSchema, updateCustomerProfile } from "@/server/customer";
import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { requireUser } from "@/server/request-auth";

export async function GET(request: NextRequest) {
  try { const user = await requireUser(request, ["CUSTOMER"]); return apiSuccess(await getCustomerProfile(user.id)); }
  catch (error) { return apiErrorResponse(error); }
}
export async function PATCH(request: NextRequest) {
  try { const user = await requireUser(request, ["CUSTOMER"]); return apiSuccess(await updateCustomerProfile(user.id, await parseJson(request, profileSchema))); }
  catch (error) { return apiErrorResponse(error); }
}

