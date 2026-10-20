import { NextRequest, NextResponse } from "next/server";

import { createSession, verifyOtp, verifyOtpSchema } from "@/server/auth";
import { mergeGuestCartToUser } from "@/server/cart";
import { CART_COOKIE } from "@/server/cart-cookie";
import { apiErrorResponse, parseJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { setSessionCookie } from "@/server/session-cookie";
import { hashSecret, normalizeKenyanPhone } from "@/server/security";
import { getClientIp } from "@/server/client-ip";

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request.headers);
    const input = await parseJson(request, verifyOtpSchema);
    const phone = normalizeKenyanPhone(input.phone);
    await Promise.all([
      enforceRateLimit(`otp-verify-ip:${clientIp ?? "unknown"}`, 15, 600),
      enforceRateLimit(`otp-verify-phone:${hashSecret(phone)}`, 10, 600),
    ]);
    const user = await verifyOtp(input);
    await mergeGuestCartToUser(request.cookies.get(CART_COOKIE)?.value, user.id);
    const session = await createSession(user.id);
    const response = NextResponse.json({ data: { user: { id: user.id, phone: user.phone, displayName: user.display_name } } });
    setSessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
