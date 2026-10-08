import { getServerEnv } from "@/server/env";
import { ApiError, apiErrorResponse } from "@/server/http";
import { processMpesaTransactionStatusTimeout } from "@/server/payment-reconciliation";
import type { TransactionStatusResultPayload } from "@/server/mpesa";
import { hashSecret, safeSecretEqual } from "@/server/security";

export async function POST(request: Request) {
  try {
    const configuredToken = getServerEnv().MPESA_CALLBACK_TOKEN;
    const suppliedToken = new URL(request.url).searchParams.get("token");
    if (!configuredToken || !suppliedToken || !safeSecretEqual(suppliedToken, hashSecret(configuredToken))) {
      throw new ApiError(401, "INVALID_WEBHOOK_TOKEN", "Webhook authentication failed.");
    }
    await processMpesaTransactionStatusTimeout(await request.json() as TransactionStatusResultPayload);
    return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
