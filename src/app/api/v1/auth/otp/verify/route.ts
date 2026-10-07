import { NextRequest, NextResponse } from "next/server";

import { createSession, verifyOtp, verifyOtpSchema } from "@/server/auth";
import { mergeGuestCartToUser } from "@/server/cart";
import { CART_COOKIE } from "@/server/cart-cookie";
import { apiErrorResponse, parseJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { setSessionCookie } from "@/server/session-cookie";

export async function POST(request: NextRequest) {
  try {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    await enforceRateLimit(`otp-verify:${forwarded}`, 15, 600);
    const user = await verifyOtp(await parseJson(request, verifyOtpSchema));
    await mergeGuestCartToUser(request.cookies.get(CART_COOKIE)?.value, user.id);
    const session = await createSession(user.id);
    const response = NextResponse.json({ data: { user: { id: user.id, phone: user.phone, displayName: user.display_name } } });
    setSessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
