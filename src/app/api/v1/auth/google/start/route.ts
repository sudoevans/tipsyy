import { NextResponse } from "next/server";

import { createGoogleAuthorization } from "@/server/auth";
import { apiErrorResponse } from "@/server/http";

export async function GET() {
  try {
    const authorization = createGoogleAuthorization();
    const response = NextResponse.redirect(authorization.url);
    const cookie = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/api/v1/auth/google", maxAge: 600 };
    response.cookies.set("tipsy_google_state", authorization.state, cookie);
    response.cookies.set("tipsy_google_verifier", authorization.verifier, cookie);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
