import { getHomeContent } from "@/server/content";
import { apiErrorResponse, apiSuccess } from "@/server/http";
export async function GET() {
  try { return apiSuccess(await getHomeContent()); }
  catch (error) { return apiErrorResponse(error); }
}

