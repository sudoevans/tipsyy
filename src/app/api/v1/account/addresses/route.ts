import { NextRequest } from "next/server";
import { addressSchema, listAddresses, saveAddress } from "@/server/customer";
import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { requireUser } from "@/server/request-auth";

export async function GET(request: NextRequest) {
  try { const user = await requireUser(request, ["CUSTOMER"]); return apiSuccess(await listAddresses(user.id)); }
  catch (error) { return apiErrorResponse(error); }
}
export async function POST(request: NextRequest) {
  try { const user = await requireUser(request, ["CUSTOMER"]); return apiSuccess(await saveAddress(user.id, await parseJson(request, addressSchema)), { status: 201 }); }
  catch (error) { return apiErrorResponse(error); }
}

