import type { SmsSendResult } from "./blessedtexts-response";

export function classifyOtpAttempt(result: SmsSendResult, attempts: number) {
  if (result.outcome === "SENT") return { status: "SENT" as const, category: null };
  if (result.outcome === "FAILED") return { status: "FAILED" as const, category: result.failureCategory ?? "PROVIDER_REJECTED" };
  return attempts >= 3
    ? { status: "FAILED" as const, category: "UNCONFIRMED_AFTER_RETRIES" }
    : { status: "UNKNOWN" as const, category: result.failureCategory ?? "UNCONFIRMED_RESPONSE" };
}
