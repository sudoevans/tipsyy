import { NextRequest } from "next/server";
import { z } from "zod";

import { recordDriverPayout } from "@/app/[locale]/(admin)/admin/actions";
import { sql } from "@/server/db";
import { apiErrorResponse, apiSuccess, ApiError } from "@/server/http";
import { requireAdmin } from "@/server/request-auth";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    await requireAdmin(request);
    const payoutId = z.string().uuid().parse(request.nextUrl.searchParams.get("requestId"));
    const riderId = z.string().uuid().parse(request.nextUrl.searchParams.get("riderId"));
    const [payout] = await sql<{ amount: number; reference: string; count: number }[]>`
      SELECT dp.amount_minor AS amount,dp.reference,COUNT(dpi.assignment_id)::int AS count
      FROM driver_payouts dp
      LEFT JOIN driver_payout_items dpi ON dpi.payout_id=dp.id
      WHERE dp.id=${payoutId} AND dp.rider_id=${riderId} AND dp.status='PAID'
      GROUP BY dp.id
    `;
    return apiSuccess({ payout: payout ?? null }, { headers: { "x-request-id": requestId } });
  } catch (error) {
    return apiErrorResponse(error, requestId, "admin.rider-payouts.status");
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) {
      throw new ApiError(403, "INVALID_ORIGIN", "Please reload the admin page and try again.");
    }
    await requireAdmin(request);
    const formData = await request.formData();
    const result = await recordDriverPayout(formData);
    return apiSuccess(result, { headers: { "x-request-id": requestId } });
  } catch (error) {
    return apiErrorResponse(error, requestId, "admin.rider-payouts");
  }
}
