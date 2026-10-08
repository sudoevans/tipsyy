import { NextRequest } from "next/server";
import { z } from "zod";

import {
  getAdminNotificationSummary,
  listAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from "@/server/admin-notifications";
import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { requireAdmin } from "@/server/request-auth";

const updateSchema = z.union([
  z.object({ notificationId: z.string().uuid() }),
  z.object({ markAll: z.literal(true) }),
]);

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const page = Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1;
    const pageSize = Number.parseInt(request.nextUrl.searchParams.get("pageSize") ?? "6", 10) || 6;
    const [summary, notifications] = await Promise.all([
      getAdminNotificationSummary(admin.id),
      listAdminNotifications(admin.id, page, pageSize),
    ]);
    return apiSuccess({ summary, notifications });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const input = await parseJson(request, updateSchema);
    if ("notificationId" in input) {
      const updated = await markAdminNotificationRead(admin.id, input.notificationId);
      if (!updated) return apiSuccess({ read: false });
    } else {
      await markAllAdminNotificationsRead(admin.id);
    }
    return apiSuccess({ read: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
