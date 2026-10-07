import { NextRequest, NextResponse } from "next/server";

import { completeGoogleAuthorization, createSession } from "@/server/auth";
import { mergeGuestCartToUser } from "@/server/cart";
import { CART_COOKIE } from "@/server/cart-cookie";
import { getServerEnv } from "@/server/env";
import { apiErrorResponse, ApiError } from "@/server/http";
import { setSessionCookie } from "@/server/session-cookie";

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const expectedState = request.cookies.get("tipsy_google_state")?.value;
    const verifier = request.cookies.get("tipsy_google_verifier")?.value;
    if (!code || !state || !expectedState || state !== expectedState || !verifier) {
      throw new ApiError(400, "GOOGLE_STATE_INVALID", "Google sign-in could not be verified. Please try again.");
    }
    const env = getServerEnv();
    const user = await completeGoogleAuthorization({ code, verifier, redirectUri: `${env.APP_URL}/api/v1/auth/google/callback` });
    await mergeGuestCartToUser(request.cookies.get(CART_COOKIE)?.value, user.id);
    const session = await createSession(user.id);
    const response = NextResponse.redirect(new URL("/", env.APP_URL));
    setSessionCookie(response, session.token, session.expiresAt);
    response.cookies.delete("tipsy_google_state");
    response.cookies.delete("tipsy_google_verifier");
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
