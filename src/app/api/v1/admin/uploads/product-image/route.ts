import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE } from "@/server/admin-session-cookie";
import { getAdminFromSession } from "@/server/admin-auth";
import { ApiError, apiErrorResponse, apiSuccess } from "@/server/http";

export const runtime = "nodejs";

const allowedTypes = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const cookieStore = await cookies();
    const admin = await getAdminFromSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    if (!admin || !["ADMIN", "SUPPORT"].includes(admin.role)) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in to upload product images.");
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ApiError(422, "INVALID_IMAGE", "Choose an image before uploading.");
    if (file.size > 5 * 1024 * 1024) throw new ApiError(422, "IMAGE_TOO_LARGE", "Images must be 5 MB or smaller.");
    const extension = allowedTypes.get(file.type);
    if (!extension) throw new ApiError(422, "INVALID_IMAGE", "Use a JPG, PNG, or WebP image.");
    const directory = path.join(process.cwd(), "public", "uploads", "products");
    await mkdir(directory, { recursive: true });
    const filename = `${crypto.randomUUID()}.${extension}`;
    await writeFile(path.join(directory, filename), Buffer.from(await file.arrayBuffer()));
    return apiSuccess({ url: `/uploads/products/${filename}` }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
