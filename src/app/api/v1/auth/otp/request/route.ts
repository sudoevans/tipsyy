import { requestOtp, requestOtpSchema } from "@/server/auth";
import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { normalizeKenyanPhone } from "@/server/security";

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, requestOtpSchema);
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const phone = normalizeKenyanPhone(input.phone);
    await Promise.all([
      enforceRateLimit(`otp-ip:${forwarded}`, 8, 600),
      enforceRateLimit(`otp-phone:${phone}`, 4, 600),
    ]);
    return apiSuccess(await requestOtp(input, forwarded), { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
