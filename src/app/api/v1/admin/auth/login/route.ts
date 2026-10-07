import { NextResponse } from "next/server";

import { adminLoginSchema, loginAdmin } from "@/server/admin-auth";
import { setAdminSessionCookie } from "@/server/admin-session-cookie";
import { apiErrorResponse, parseJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, adminLoginSchema);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    await enforceRateLimit(`admin-login:${ip}`, 10, 900);
    const result = await loginAdmin(input);
    const response = NextResponse.json({ data: { user: result.user } });
    setAdminSessionCookie(response, result.token, result.expiresAt);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
