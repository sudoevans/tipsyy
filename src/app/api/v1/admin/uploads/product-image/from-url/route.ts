import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE } from "@/server/admin-session-cookie";
import { getAdminFromSession } from "@/server/admin-auth";
import { sql } from "@/server/db";
import { ApiError, apiErrorResponse, apiSuccess } from "@/server/http";

export const runtime = "nodejs";

const imageExtensions = new Map([["image/jpeg", "jpg"], ["image/jpg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
const maxBytes = 5 * 1024 * 1024;

function assertRemoteUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new ApiError(422, "INVALID_IMAGE_URL", "Enter a valid image URL."); }
  const hostname = url.hostname.toLowerCase();
  const privateIpv4 = /^(10|127)\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  if (!["http:", "https:"].includes(url.protocol) || privateIpv4 || hostname === "localhost" || hostname.endsWith(".local")) {
    throw new ApiError(422, "INVALID_IMAGE_URL", "Use a public http or https image URL.");
  }
  return url;
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const cookieStore = await cookies();
    const admin = await getAdminFromSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    if (!admin || !["ADMIN", "SUPPORT"].includes(admin.role)) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in to update product images.");
    const body = await request.json().catch(() => null) as { url?: unknown } | null;
    if (!body || typeof body.url !== "string" || !body.url.trim()) throw new ApiError(422, "INVALID_IMAGE_URL", "Enter an image URL first.");
    const requestedUrl = assertRemoteUrl(body.url.trim());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    let response: Response;
    try { response = await fetch(requestedUrl, { signal: controller.signal, redirect: "follow", headers: { Accept: "image/jpeg,image/png,image/webp" }, cache: "no-store" }); }
    catch { throw new ApiError(422, "IMAGE_RETRIEVAL_FAILED", "We could not retrieve that image. Check the URL and try again."); }
    finally { clearTimeout(timeout); }
    if (!response.ok) throw new ApiError(422, "IMAGE_RETRIEVAL_FAILED", "We could not retrieve that image. Check the URL and try again.");
    const finalUrl = assertRemoteUrl(response.url || requestedUrl.toString());
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
    const extension = imageExtensions.get(contentType);
    if (!extension) throw new ApiError(422, "INVALID_IMAGE", "The URL must point to a JPG, PNG, or WebP image.");
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > maxBytes) throw new ApiError(422, "IMAGE_TOO_LARGE", "Images must be 5 MB or smaller.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > maxBytes) throw new ApiError(422, "IMAGE_TOO_LARGE", "Images must be 5 MB or smaller.");
    const directory = path.join(process.cwd(), "public", "uploads", "products");
    await mkdir(directory, { recursive: true });
    const filename = `${crypto.randomUUID()}.${extension}`;
    await writeFile(path.join(directory, filename), bytes);
    await sql`
      INSERT INTO admin_activity_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES (${admin.id}, 'product_image.retrieved', 'product_image', ${filename}, ${sql.json({ source: 'url', sourceUrl: finalUrl.toString() })})
    `;
    return apiSuccess({ url: `/uploads/products/${filename}`, sourceUrl: finalUrl.toString() }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
