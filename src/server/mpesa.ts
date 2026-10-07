import { ApiError } from "./http";
import { requireMpesaConfig } from "./env";

interface TokenResponse {
  access_token?: string;
  expires_in?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface StkPushResponse {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  CustomerMessage?: string;
  errorCode?: string;
  errorMessage?: string;
  requestId?: string;
}

export interface StkCallbackItem {
  Name: string;
  Value?: string | number;
}

export interface StkCallbackPayload {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: { Item?: StkCallbackItem[] };
    };
  };
}

function apiBase(environment: "sandbox" | "production") {
  return environment === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
}

function darajaTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}${part("month")}${part("day")}${part("hour")}${part("minute")}${part("second")}`;
}

async function parseDarajaResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & { errorCode?: string; errorMessage?: string };
  if (!response.ok) {
    throw new ApiError(502, "MPESA_UNAVAILABLE", payload.errorMessage ?? "M-Pesa could not process the request.", {
      providerStatus: response.status,
      providerCode: payload.errorCode,
    });
  }
  return payload;
}

export async function getMpesaAccessToken() {
  const config = requireMpesaConfig();
  const credentials = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
  const response = await fetch(`${apiBase(config.environment)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await parseDarajaResponse<TokenResponse>(response);
  if (!payload.access_token) throw new ApiError(502, "MPESA_AUTH_FAILED", "M-Pesa authentication did not return an access token.");
  return payload.access_token;
}

export async function initiateStkPush(input: {
  amount: number;
  phone: string;
  orderNumber: string;
}): Promise<{ request: Record<string, unknown>; response: StkPushResponse }> {
  const config = requireMpesaConfig();
  const accessToken = await getMpesaAccessToken();
  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString("base64");
  const request = {
    BusinessShortCode: config.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: config.transactionType,
    Amount: Math.round(input.amount),
    PartyA: input.phone,
    PartyB: config.shortcode,
    PhoneNumber: input.phone,
    CallBackURL: config.callbackUrl,
    AccountReference: input.orderNumber.slice(0, 12),
    TransactionDesc: `Payment for ${input.orderNumber}`.slice(0, 20),
  };

  const response = await fetch(`${apiBase(config.environment)}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(request),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await parseDarajaResponse<StkPushResponse>(response);
  if (payload.ResponseCode !== "0" || !payload.CheckoutRequestID) {
    throw new ApiError(502, "MPESA_REQUEST_REJECTED", payload.errorMessage ?? payload.ResponseDescription ?? "M-Pesa rejected the payment request.", {
      providerCode: payload.errorCode ?? payload.ResponseCode,
    });
  }
  return { request: { ...request, Password: "[REDACTED]" }, response: payload };
}

export function mpesaCallbackMetadata(payload: StkCallbackPayload) {
  const items = payload.Body?.stkCallback?.CallbackMetadata?.Item ?? [];
  return Object.fromEntries(items.filter((item) => item.Name).map((item) => [item.Name, item.Value]));
}
