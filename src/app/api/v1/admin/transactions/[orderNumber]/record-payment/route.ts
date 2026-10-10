import type { NextRequest } from "next/server";
import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { adminRecordPaymentEvidence, adminRecordPaymentSchema } from "@/server/payments";
import { requireAdmin } from "@/server/request-auth";

export async function POST(request: NextRequest, context: { params: Promise<{ orderNumber: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const admin = await requireAdmin(request, ["ADMIN"]);
    const [{ orderNumber }, input] = await Promise.all([context.params, parseJson(request, adminRecordPaymentSchema)]);
    return apiSuccess(await adminRecordPaymentEvidence(orderNumber, admin.id, input));
  } catch (error) {
    return apiErrorResponse(error, requestId, "admin.transactions.record-payment");
  }
}
