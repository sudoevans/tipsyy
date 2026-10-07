import { promisify } from "node:util";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { sql } from "./db";
import { ApiError } from "./http";
import { createOpaqueToken, hashSecret } from "./security";

const scrypt = promisify(scryptCallback);
const ADMIN_SESSION_HOURS = 12;

export const adminLoginSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(64).regex(/^[a-z0-9._-]+$/),
  password: z.string().min(8).max(128),
});

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, hash] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function loginAdmin(input: z.infer<typeof adminLoginSchema>) {
    const [account] = await sql<{ id: string; username: string; display_name: string | null; role: string; status: string; password_hash: string; failed_attempts: number; locked_until: Date | null }[]>`
      SELECT u.id, u.username, u.display_name, u.role::text, u.status::text,
             c.password_hash, c.failed_attempts, c.locked_until
      FROM users u JOIN admin_credentials c ON c.user_id = u.id
      WHERE u.username = ${input.username}
    `;
    const invalid = new ApiError(401, "ADMIN_LOGIN_FAILED", "Incorrect username or password.");
    if (!account || !['ADMIN', 'SUPPORT'].includes(account.role) || account.status !== 'ACTIVE') throw invalid;
    if (account.locked_until && account.locked_until.getTime() > Date.now()) {
      throw new ApiError(429, "ADMIN_ACCOUNT_LOCKED", "Too many attempts. Try again later.");
    }
    if (!await verifyPassword(input.password, account.password_hash)) {
      const attempts = account.failed_attempts + 1;
      await sql`UPDATE admin_credentials SET failed_attempts = ${attempts}, locked_until = ${attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null}, updated_at = now() WHERE user_id = ${account.id}`;
      throw invalid;
    }
    await sql`UPDATE admin_credentials SET failed_attempts = 0, locked_until = NULL, updated_at = now() WHERE user_id = ${account.id}`;
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_HOURS * 60 * 60_000);
    await sql`INSERT INTO admin_sessions (user_id, token_hash, expires_at) VALUES (${account.id}, ${hashSecret(token)}, ${expiresAt})`;
    return { token, expiresAt, user: { id: account.id, username: account.username, displayName: account.display_name, role: account.role } };
}

export async function getAdminFromSession(rawToken: string | undefined) {
  if (!rawToken) return null;
  try {
    const [user] = await sql<{ id: string; username: string; display_name: string | null; role: string }[]>`
      SELECT u.id, u.username, u.display_name, u.role::text
      FROM admin_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ${hashSecret(rawToken)}
        AND s.expires_at > now() AND s.revoked_at IS NULL
        AND u.status = 'ACTIVE' AND u.role IN ('ADMIN', 'SUPPORT')
    `;
    return user ?? null;
  } catch (error) {
    console.error("Admin session lookup failed.", { name: error instanceof Error ? error.name : typeof error });
    return null;
  }
}
