import { NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { getRiderForUser, updateRiderAssignment } from "@/server/operations";
import { requireUser } from "@/server/request-auth";
const schema = z.object({ action: z.enum(["ACCEPT", "PICKED_UP", "DELIVERED"]) });
export async function PATCH(request: NextRequest, context: { params: Promise<{ assignmentId: string }> }) {
  try { const user = await requireUser(request, ["RIDER"]); const [rider, input, { assignmentId }] = await Promise.all([getRiderForUser(user.id), parseJson(request, schema), context.params]); return apiSuccess(await updateRiderAssignment(rider.id, assignmentId, input.action)); }
  catch (error) { return apiErrorResponse(error); }
}
