import { readProductImage } from "@/server/product-images";

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> },
) {
  const { key } = await context.params;
  const image = await readProductImage(key.join("/"));
  if (!image) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  image.writeHttpMetadata(headers);
  headers.set("etag", image.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(image.body, { headers });
}
