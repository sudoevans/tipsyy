import { apiErrorResponse } from "@/server/http";
import { processMpesaCallback } from "@/server/payments";
import type { StkCallbackPayload } from "@/server/mpesa";
import { getServerEnv } from "@/server/env";
import { ApiError } from "@/server/http";
import { hashSecret, safeSecretEqual } from "@/server/security";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const configuredToken = getServerEnv().MPESA_CALLBACK_TOKEN;
    if (configuredToken) {
      const suppliedToken = new URL(request.url).searchParams.get("token");
      if (!suppliedToken || !safeSecretEqual(suppliedToken, hashSecret(configuredToken))) throw new ApiError(401, "INVALID_WEBHOOK_TOKEN", "Webhook authentication failed.");
    }
    const payload = await request.json() as StkCallbackPayload;
    const result = await processMpesaCallback(payload);
    console.info(JSON.stringify({ level: "info", requestId, message: "M-Pesa callback processed", ...result }));
    return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
