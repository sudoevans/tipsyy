import { NextRequest } from "next/server";

import { cartSnapshotSchema, getCart, replaceCart, resolveCartIdentity } from "@/server/cart";
import { CART_COOKIE, setCartCookie } from "@/server/cart-cookie";
import { apiErrorResponse, apiSuccess, parseJson } from "@/server/http";
import { SESSION_COOKIE } from "@/server/session-cookie";

async function identity(request: NextRequest) {
  return resolveCartIdentity(request.cookies.get(SESSION_COOKIE)?.value, request.cookies.get(CART_COOKIE)?.value);
}

function responseWithIdentity<T>(data: T, resolved: Awaited<ReturnType<typeof identity>>) {
  const response = apiSuccess(data);
  if (resolved.isNewGuest && resolved.guestToken) setCartCookie(response, resolved.guestToken);
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await identity(request);
    return responseWithIdentity(await getCart(resolved), resolved);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const [resolved, input] = await Promise.all([identity(request), parseJson(request, cartSnapshotSchema)]);
    return responseWithIdentity(await replaceCart(resolved, input), resolved);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

