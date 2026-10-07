import { cartQuoteSchema, quoteCart } from "@/server/checkout";
import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
export async function POST(request: Request) {
  try { return apiSuccess(await quoteCart(await parseJson(request, cartQuoteSchema))); }
  catch (error) { return apiErrorResponse(error); }
}
