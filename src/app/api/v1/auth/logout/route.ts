import { NextRequest, NextResponse } from "next/server";

import { sql } from "@/server/db";
import { hashSecret } from "@/server/security";
import { clearSessionCookie, SESSION_COOKIE } from "@/server/session-cookie";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${hashSecret(token)}`;
  const response = NextResponse.json({ data: { signedOut: true } });
  clearSessionCookie(response);
  return response;
}
