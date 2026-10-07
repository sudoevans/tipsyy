import { NextRequest } from "next/server";
import { z } from "zod";
import { listFavourites, setFavourite } from "@/server/customer";
import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { requireUser } from "@/server/request-auth";
const schema = z.object({ productSlug: z.string().min(1).max(120), favourite: z.boolean() });
export async function GET(request: NextRequest) {
  try { const user = await requireUser(request, ["CUSTOMER"]); return apiSuccess(await listFavourites(user.id)); }
  catch (error) { return apiErrorResponse(error); }
}
export async function PUT(request: NextRequest) {
  try { const user = await requireUser(request, ["CUSTOMER"]); const input = await parseJson(request, schema); return apiSuccess(await setFavourite(user.id, input.productSlug, input.favourite)); }
  catch (error) { return apiErrorResponse(error); }
}

