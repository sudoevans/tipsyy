import { sql } from "@/server/db";
import { apiErrorResponse, apiSuccess } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [setting] = await sql<{ number: string | null }[]>`
      SELECT value->>'number' AS number
      FROM platform_settings
      WHERE key='support.whatsapp'
    `;
    const number = String(setting?.number ?? "").replace(/\D/g, "");
    return apiSuccess({ number });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
