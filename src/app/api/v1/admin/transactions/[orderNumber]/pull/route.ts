import type { NextRequest } from "next/server";
import { apiErrorResponse, apiSuccess } from "@/server/http";
import { pullAndReconcileOrder } from "@/server/payments";
import { requireAdmin } from "@/server/request-auth";

export async function POST(request: NextRequest, context: { params: Promise<{ orderNumber: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const admin = await requireAdmin(request, ["ADMIN"]);
    const { orderNumber } = await context.params;
    return apiSuccess(await pullAndReconcileOrder(orderNumber, admin.id));
  } catch (error) {
    return apiErrorResponse(error, requestId, "admin.transactions.pull-reconcile");
  }
}
