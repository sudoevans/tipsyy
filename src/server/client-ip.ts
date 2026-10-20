import { isIP } from "node:net";

export function getClientIp(headers: Headers): string | null {
  for (const candidate of [
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for")?.split(",")[0],
  ]) {
    const value = candidate?.trim();
    if (value && isIP(value)) return value;
  }
  return null;
}
