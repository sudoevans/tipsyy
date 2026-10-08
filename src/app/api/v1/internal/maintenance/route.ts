import { expireReservations } from "@/server/checkout";
import { getServerEnv } from "@/server/env";
import { apiErrorResponse, apiSuccess, ApiError } from "@/server/http";
import { dispatchPendingNotifications } from "@/server/notifications";
import { processOpenPaymentInvestigations } from "@/server/payment-reconciliation";
import { hashSecret, safeSecretEqual } from "@/server/security";

export async function POST(request: Request) {
  try {
    const secret = getServerEnv().INTERNAL_JOB_SECRET;
    if (!secret) throw new ApiError(503, "MAINTENANCE_NOT_CONFIGURED", "The maintenance worker secret is not configured.");
    const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!supplied || !safeSecretEqual(supplied, hashSecret(secret))) throw new ApiError(401, "INVALID_JOB_SECRET", "Worker authentication failed.");
    const [expiredReservations, notifications, reconciliations] = await Promise.all([expireReservations(), dispatchPendingNotifications(), processOpenPaymentInvestigations()]);
    return apiSuccess({ expiredReservations, notifications, reconciliations });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
