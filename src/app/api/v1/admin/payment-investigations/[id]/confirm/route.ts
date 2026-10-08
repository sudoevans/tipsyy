import { NextRequest } from "next/server";

import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { confirmPaymentInvestigation, confirmPaymentInvestigationSchema } from "@/server/payments";
import { requireAdmin } from "@/server/request-auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [admin, { id }, input] = await Promise.all([
      requireAdmin(request, ["ADMIN"]),
      context.params,
      parseJson(request, confirmPaymentInvestigationSchema),
    ]);
    return apiSuccess(await confirmPaymentInvestigation(id, admin.id, input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
