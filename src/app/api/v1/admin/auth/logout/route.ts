import { NextRequest, NextResponse } from "next/server";

import { clearAdminSessionCookie, ADMIN_SESSION_COOKIE } from "@/server/admin-session-cookie";
import { sql } from "@/server/db";
import { hashSecret } from "@/server/security";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (token) {
    const [session] = await sql<{ user_id: string }[]>`
      UPDATE admin_sessions SET revoked_at = now()
      WHERE token_hash = ${hashSecret(token)} AND revoked_at IS NULL
      RETURNING user_id
    `;
    if (session) {
      await sql`
        INSERT INTO admin_activity_logs (actor_user_id, action, entity_type, entity_id)
        VALUES (${session.user_id}, 'admin.signed_out', 'user', ${session.user_id})
      `;
    }
  }
  const response = NextResponse.json({ data: { signedOut: true } });
  clearAdminSessionCookie(response);
  return response;
}
