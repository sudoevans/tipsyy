import { NextRequest } from "next/server";
import { getCustomerLoyalty } from "@/server/customer";
import { apiErrorResponse, apiSuccess } from "@/server/http";
import { requireUser } from "@/server/request-auth";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request, ["CUSTOMER"]);
    return apiSuccess(await getCustomerLoyalty(user.id));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
