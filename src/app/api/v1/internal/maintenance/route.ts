import { expireReservations } from "@/server/checkout";
import { getServerEnv } from "@/server/env";
import { apiErrorResponse, apiSuccess, ApiError } from "@/server/http";
import { dispatchPendingNotifications } from "@/server/notifications";
import { processOpenPaymentInvestigations } from "@/server/payment-reconciliation";
import { reconcilePendingStkAttempts, retryUnprocessedMpesaCallbacks } from "@/server/payments";
import { hashSecret, safeSecretEqual } from "@/server/security";

async function runMaintenanceTask<T>(name: string, work: () => Promise<T>) {
  try {
    return { name, ok: true as const, result: await work() };
  } catch (error) {
    const fields = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
    console.error(JSON.stringify({
      level: "error",
      event: "maintenance.task_failed",
      task: name,
      errorName: error instanceof Error ? error.name : typeof error,
      ...(typeof fields.code === "string" && /^[0-9A-Z]{5}$/.test(fields.code) ? { sqlState: fields.code } : {}),
      ...(typeof fields.table_name === "string" ? { table: fields.table_name } : {}),
      ...(typeof fields.column_name === "string" ? { column: fields.column_name } : {}),
      ...(typeof fields.constraint_name === "string" ? { constraint: fields.constraint_name } : {}),
    }));
    return { name, ok: false as const };
  }
}

export async function POST(request: Request) {
  try {
    const secret = getServerEnv().INTERNAL_JOB_SECRET;
    if (!secret) throw new ApiError(503, "MAINTENANCE_NOT_CONFIGURED", "The maintenance worker secret is not configured.");
    const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!supplied || !safeSecretEqual(supplied, hashSecret(secret))) throw new ApiError(401, "INVALID_JOB_SECRET", "Worker authentication failed.");
    // Keep the minute cron bounded. A transient failure in one subsystem must
    // not turn the whole scheduled invocation into an unhandled 500 or prevent
    // independent payment-recovery work from running.
    const tasks = await Promise.all([
      runMaintenanceTask("expire_reservations", expireReservations),
      runMaintenanceTask("dispatch_notifications", () => dispatchPendingNotifications(2)),
      runMaintenanceTask("payment_investigations", () => processOpenPaymentInvestigations(1)),
      runMaintenanceTask("stk_status_checks", () => reconcilePendingStkAttempts(1)),
      runMaintenanceTask("mpesa_callback_retries", () => retryUnprocessedMpesaCallbacks(5)),
    ]);
    return apiSuccess({ tasks, hasFailures: tasks.some((task) => !task.ok) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
