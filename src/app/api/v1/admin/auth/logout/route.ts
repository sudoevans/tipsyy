import { NextRequest, NextResponse } from "next/server";

import { clearAdminSessionCookie, ADMIN_SESSION_COOKIE } from "@/server/admin-session-cookie";
import { sql } from "@/server/db";
import { hashSecret } from "@/server/security";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (token) await sql`UPDATE admin_sessions SET revoked_at = now() WHERE token_hash = ${hashSecret(token)} AND revoked_at IS NULL`;
  const response = NextResponse.json({ data: { signedOut: true } });
  clearAdminSessionCookie(response);
  return response;
}
