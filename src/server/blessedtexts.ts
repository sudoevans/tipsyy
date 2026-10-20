import { getServerEnv } from "./env";
import { interpretBlessedTextsResponse, type SmsSendResult } from "./blessedtexts-response";

export async function sendBlessedTextsOtp(phone: string, message: string): Promise<SmsSendResult> {
  const env = getServerEnv();
  if (!env.BLESSEDTEXTS_API_KEY) return { outcome: "FAILED", failureCategory: "NOT_CONFIGURED" };
  try {
    const response = await fetch("https://sms.blessedtexts.com/api/sms/v1/sendsms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ api_key: env.BLESSEDTEXTS_API_KEY, sender_id: env.BLESSEDTEXTS_SENDER_ID, phone, message }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const payload: unknown = await response.json().catch(() => null);
    return interpretBlessedTextsResponse(response.status, payload);
  } catch {
    return { outcome: "UNKNOWN", failureCategory: "NETWORK_OR_TIMEOUT" };
  }
}
