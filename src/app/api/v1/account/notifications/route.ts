import { NextRequest } from "next/server";
import { z } from "zod";
import { listNotifications, markNotificationRead } from "@/server/customer";
import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { requireUser } from "@/server/request-auth";
const schema = z.object({ notificationId: z.string().uuid() });
export async function GET(request: NextRequest) {
  try { const user = await requireUser(request, ["CUSTOMER"]); return apiSuccess(await listNotifications(user.id)); }
  catch (error) { return apiErrorResponse(error); }
}
export async function PATCH(request: NextRequest) {
  try { const user = await requireUser(request, ["CUSTOMER"]); const input = await parseJson(request, schema); await markNotificationRead(user.id, input.notificationId); return apiSuccess({ read: true }); }
  catch (error) { return apiErrorResponse(error); }
}

