import type { NextResponse } from "next/server";

export const CART_COOKIE = "tipsy_cart";

export function setCartCookie(response: NextResponse, token: string) {
  response.cookies.set(CART_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

