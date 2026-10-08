import { getCloudflareContext } from "@opennextjs/cloudflare";

import { ApiError } from "./http";

type ProductImageObject = {
  body: ReadableStream;
  httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
};

type ProductImageBucket = {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView,
    options: { httpMetadata: { contentType: string; cacheControl: string } },
  ): Promise<unknown>;
  get(key: string): Promise<ProductImageObject | null>;
};

const productImagePath = "/api/v1/product-images/";

function isProductImageKey(value: string) {
  return /^products\/[a-f0-9-]{36}\.(jpg|png|webp)$/i.test(value);
}

async function productImageBucket() {
  const context = await getCloudflareContext({ async: true });
  const bucket = (context.env as typeof context.env & {
    PRODUCT_IMAGES?: ProductImageBucket;
  }).PRODUCT_IMAGES;
  if (!bucket) {
    throw new ApiError(
      503,
      "IMAGE_STORAGE_NOT_CONFIGURED",
      "Product image storage is not configured.",
    );
  }
  return bucket;
}

export function productImageUrl(key: string) {
  if (!isProductImageKey(key)) {
    throw new ApiError(422, "INVALID_IMAGE", "Invalid product image path.");
  }
  return `${productImagePath}${key}`;
}

export async function storeProductImage(
  bytes: ArrayBuffer,
  extension: "jpg" | "png" | "webp",
  contentType: string,
) {
  const key = `products/${crypto.randomUUID()}.${extension}`;
  const bucket = await productImageBucket();
  await bucket.put(key, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
  return { key, url: productImageUrl(key) };
}

export async function readProductImage(key: string) {
  if (!isProductImageKey(key)) return null;
  return (await productImageBucket()).get(key);
}
