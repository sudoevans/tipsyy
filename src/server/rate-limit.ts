import { sql } from "./db";
import { ApiError } from "./http";

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const expiresAt = new Date(Date.now() + windowSeconds * 1000);
  const [record] = await sql<{ count: number; expires_at: Date }[]>`
    INSERT INTO rate_limits (key, count, window_started_at, expires_at)
    VALUES (${key}, 1, now(), ${expiresAt})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.expires_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
      window_started_at = CASE WHEN rate_limits.expires_at <= now() THEN now() ELSE rate_limits.window_started_at END,
      expires_at = CASE WHEN rate_limits.expires_at <= now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END
    RETURNING count, expires_at
  `;

  if (record.count > limit) {
    throw new ApiError(429, "RATE_LIMITED", "Too many attempts. Please wait and try again.", {
      retryAfter: Math.max(1, Math.ceil((new Date(record.expires_at).getTime() - Date.now()) / 1000)),
    });
  }
}
