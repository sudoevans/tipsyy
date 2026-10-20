import { NextResponse } from "next/server";
import { requestOtp, requestOtpSchema } from "@/server/auth";
import { apiErrorResponse, apiSuccess, ApiError, parseJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { hashSecret, normalizeKenyanPhone } from "@/server/security";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = await parseJson(request, requestOtpSchema);
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const phone = normalizeKenyanPhone(input.phone);
    await Promise.all([
      enforceRateLimit(`otp-ip:${forwarded}`, 8, 600),
      enforceRateLimit(`otp-phone:${hashSecret(phone)}`, 4, 600),
    ]);
    return apiSuccess(await requestOtp(input, forwarded, requestId), { status: 202, headers: { "x-request-id": requestId } });
  } catch (error) {
    if (error instanceof ApiError && error.code === "OTP_SEND_FAILED") {
      return NextResponse.json({ error: { code: error.code,
        message: "The code has not been sent. Please try again shortly.", requestId } },
      { status: 503, headers: { "x-request-id": requestId } });
    }
    return apiErrorResponse(error, requestId, "auth.otp.request");
  }
}
