import type { NextRequest } from "next/server";

import { getUserFromSession } from "./auth";
import { getAdminFromSession } from "./admin-auth";
import { ADMIN_SESSION_COOKIE } from "./admin-session-cookie";
import { ApiError } from "./http";
import { SESSION_COOKIE } from "./session-cookie";

export async function requireUser(request: NextRequest, roles?: string[]) {
  const user = await getUserFromSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.");
  if (roles && !roles.includes(user.role)) throw new ApiError(403, "FORBIDDEN", "You do not have access to this action.");
  return user;
}

export async function requireAdmin(request: NextRequest, roles: string[] = ["ADMIN", "SUPPORT"]) {
  const user = await getAdminFromSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (!user) throw new ApiError(401, "ADMIN_AUTHENTICATION_REQUIRED", "Sign in to the admin portal to continue.");
  if (!roles.includes(user.role)) throw new ApiError(403, "FORBIDDEN", "You do not have access to this action.");
  return user;
}
