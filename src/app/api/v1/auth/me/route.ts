import { NextRequest } from "next/server";

import { getUserFromSession } from "@/server/auth";
import { apiErrorResponse, apiSuccess, ApiError } from "@/server/http";
import { SESSION_COOKIE } from "@/server/session-cookie";

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.");
    return apiSuccess(user);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
