export type SmsSendResult = {
  outcome: "SENT" | "FAILED" | "UNKNOWN";
  httpStatus?: number;
  providerStatusCode?: string;
  providerMessageId?: string;
  failureCategory?: string;
};

export function interpretBlessedTextsResponse(httpStatus: number, payload: unknown): SmsSendResult {
  const item = Array.isArray(payload) ? payload[0] : null;
  const record = item && typeof item === "object" ? item as Record<string, unknown> : null;
  const providerStatusCode = typeof record?.status_code === "string" && /^\d{4}$/.test(record.status_code)
    ? record.status_code : undefined;
  const providerMessageId = typeof record?.message_id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(record.message_id)
    ? record.message_id : undefined;
  if (httpStatus >= 200 && httpStatus < 300 && providerStatusCode === "1000" && providerMessageId) {
    return { outcome: "SENT", httpStatus, providerStatusCode, providerMessageId };
  }
  if (providerStatusCode && /^100[1-9]$/.test(providerStatusCode)) {
    const categories: Record<string, string> = {
      "1001": "MISSING_API_KEY", "1002": "INVALID_API_KEY", "1003": "MISSING_SENDER_ID",
      "1004": "INVALID_SENDER_ID", "1005": "MISSING_MESSAGE", "1006": "MISSING_PHONE",
      "1007": "INVALID_PHONE_FORMAT", "1008": "INVALID_PHONE", "1009": "LOW_CREDITS",
    };
    return { outcome: "FAILED", httpStatus, providerStatusCode, failureCategory: categories[providerStatusCode] };
  }
  if ([400, 401, 403].includes(httpStatus)) {
    return { outcome: "FAILED", httpStatus, providerStatusCode,
      failureCategory: httpStatus === 400 ? "BAD_REQUEST_HTTP" : "AUTH_HTTP_ERROR" };
  }
  return { outcome: "UNKNOWN", httpStatus, providerStatusCode, failureCategory: "UNCONFIRMED_RESPONSE" };
}
