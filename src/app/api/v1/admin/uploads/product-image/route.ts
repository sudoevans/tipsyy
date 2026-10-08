import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE } from "@/server/admin-session-cookie";
import { getAdminFromSession } from "@/server/admin-auth";
import { sql } from "@/server/db";
import { ApiError, apiErrorResponse, apiSuccess } from "@/server/http";
import { storeProductImage } from "@/server/product-images";

type ImageExtension = "jpg" | "png" | "webp";

const allowedTypes = new Map<string, ImageExtension>([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

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
    const uploaded = await storeProductImage(
      await file.arrayBuffer(),
      extension,
      file.type,
    );
    await sql`
      INSERT INTO admin_activity_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES (${admin.id}, 'product_image.uploaded', 'product_image', ${uploaded.key}, ${sql.json({ source: 'upload', size: file.size })})
    `;
    return apiSuccess({ url: uploaded.url }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
