import { NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { getRiderForUser, setRiderAvailability } from "@/server/operations";
import { requireUser } from "@/server/request-auth";
const schema = z.object({ availability: z.enum(["ONLINE", "OFFLINE"]) });
export async function PATCH(request: NextRequest) {
  try { const user = await requireUser(request, ["RIDER"]); const [rider, input] = await Promise.all([getRiderForUser(user.id), parseJson(request, schema)]); return apiSuccess(await setRiderAvailability(rider.id, input.availability)); }
  catch (error) { return apiErrorResponse(error); }
}

