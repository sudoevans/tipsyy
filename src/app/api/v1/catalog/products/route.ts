import { getCatalog } from "@/server/checkout";
import { apiErrorResponse, apiSuccess } from "@/server/http";

export async function GET() {
  try {
    return apiSuccess(await getCatalog());
  } catch (error) {
    return apiErrorResponse(error);
  }
}
