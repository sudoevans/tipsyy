import { NextRequest } from "next/server";
import { addressSchema, deleteAddress, saveAddress } from "@/server/customer";
import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { requireUser } from "@/server/request-auth";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const user = await requireUser(request, ["CUSTOMER"]); const { id } = await context.params; return apiSuccess(await saveAddress(user.id, await parseJson(request, addressSchema), id)); }
  catch (error) { return apiErrorResponse(error); }
}
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const user = await requireUser(request, ["CUSTOMER"]); const { id } = await context.params; await deleteAddress(user.id, id); return apiSuccess({ deleted: true }); }
  catch (error) { return apiErrorResponse(error); }
}
