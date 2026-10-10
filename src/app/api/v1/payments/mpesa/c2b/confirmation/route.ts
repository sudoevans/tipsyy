import { apiErrorResponse } from "@/server/http";
import { getServerEnv } from "@/server/env";
import { ApiError } from "@/server/http";
import { hashSecret, safeSecretEqual } from "@/server/security";
import { processMpesaC2BConfirmation, type MpesaC2BConfirmation } from "@/server/payments";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const configuredToken = getServerEnv().MPESA_CALLBACK_TOKEN;
    const suppliedToken = new URL(request.url).searchParams.get("token");
    if (!configuredToken || !suppliedToken || !safeSecretEqual(suppliedToken, hashSecret(configuredToken))) {
      throw new ApiError(401, "INVALID_WEBHOOK_TOKEN", "Webhook authentication failed.");
    }
    const result = await processMpesaC2BConfirmation(await request.json() as MpesaC2BConfirmation);
    console.info(JSON.stringify({ level: "info", event: "mpesa.c2b.confirmation", requestId, ...result }));
    return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    return apiErrorResponse(error, requestId, "mpesa.c2b.confirmation");
  }
}
