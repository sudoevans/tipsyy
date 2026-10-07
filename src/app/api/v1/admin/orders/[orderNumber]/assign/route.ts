import { NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { assignRider } from "@/server/operations";
import { requireAdmin } from "@/server/request-auth";
const schema = z.object({ riderId: z.string().uuid() });
export async function POST(request: NextRequest, context: { params: Promise<{ orderNumber: string }> }) {
  try { const user = await requireAdmin(request); const [{ orderNumber }, input] = await Promise.all([context.params, parseJson(request, schema)]); return apiSuccess(await assignRider(orderNumber, input.riderId, user.id)); }
  catch (error) { return apiErrorResponse(error); }
}
