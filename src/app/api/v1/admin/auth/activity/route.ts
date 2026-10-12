import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, clearAdminSessionCookie, setAdminSessionCookie } from "@/server/admin-session-cookie";
import { sql } from "@/server/db";
import { hashSecret } from "@/server/security";
import { apiErrorResponse } from "@/server/http";

export async function POST(request: NextRequest) {
  // Reject cross-origin activity requests; idle sessions cannot be revived.
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return new NextResponse(null, { status: 403 });
  try {
    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    const [session] = token ? await sql<{expires_at: Date}[]>`
      UPDATE admin_sessions s SET expires_at=now()+interval '15 minutes'
      FROM users u WHERE u.id=s.user_id AND u.status='ACTIVE' AND u.role IN ('ADMIN','SUPPORT')
        AND s.token_hash=${hashSecret(token)} AND s.revoked_at IS NULL
        AND s.expires_at>now()
      RETURNING s.expires_at
    ` : [];
    if (!session) {
      const response = new NextResponse(null, { status: 401 });
      clearAdminSessionCookie(response);
      return response;
    }
    const response = new NextResponse(null, { status: 204 });
    setAdminSessionCookie(response, token!, session.expires_at);
    return response;
  } catch (error) { return apiErrorResponse(error); }
}
