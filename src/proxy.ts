import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "./i18n/routing";

const handleIntlRouting = createMiddleware(routing);
const ADMIN_HOSTNAME = "admin.tipsytheoryy.com";
const ADMIN_PATH = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?admin(?:\/|$)/i;
const ADMIN_API_PATH = /^\/api\/v1\/admin(?:\/|$)/i;

export default function proxy(request: NextRequest) {
  const hostname = request.headers.get("host")?.split(":")[0].toLowerCase();
  const pathname = request.nextUrl.pathname;
  const isAdminRoute = ADMIN_PATH.test(pathname) || ADMIN_API_PATH.test(pathname);
  const isLocalDevelopment = hostname === "localhost" || hostname === "127.0.0.1";

  if (isAdminRoute && hostname !== ADMIN_HOSTNAME && !isLocalDevelopment) {
    if (ADMIN_API_PATH.test(pathname)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.rewrite(new URL("/__admin-route-not-found__", request.url));
  }

  if (ADMIN_API_PATH.test(pathname)) return NextResponse.next();

  if (hostname === ADMIN_HOSTNAME) {
    const legacyAdminPath = pathname.match(/^\/(?:en\/)?admin(?:\/(.*))?$/i);
    if (legacyAdminPath) {
      const canonicalUrl = request.nextUrl.clone();
      canonicalUrl.pathname = legacyAdminPath[1]
        ? `/${legacyAdminPath[1]}`
        : "/";
      return NextResponse.redirect(canonicalUrl);
    }

    // Keep the admin app's existing route tree while exposing clean URLs on
    // the admin hostname: / -> /admin and /login -> /admin/login internally.
    const adminUrl = request.nextUrl.clone();
    adminUrl.pathname = `/en/admin${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(adminUrl);
  }

  return handleIntlRouting(request);
}

export const config = {
  matcher: [
    "/api/v1/admin/:path*",
    "/((?!api/|_next|_vercel|.*\\..*).*)",
  ],
};
