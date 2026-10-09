import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

import { sql, withTransaction } from "./db";
import { getServerEnv } from "./env";
import { ApiError } from "./http";
import { claimPendingLoyaltyPoints } from "./loyalty";
import { createNumericCode, createOpaqueToken, hashSecret, normalizeKenyanPhone, safeSecretEqual } from "./security";

export const requestOtpSchema = z.object({
  phone: z.string().min(9).max(25),
  purpose: z.enum(["LOGIN", "CREATE_ACCOUNT"]).default("LOGIN"),
});

export const verifyOtpSchema = z.object({
  phone: z.string().min(9).max(25),
  code: z.string().regex(/^\d{6}$/),
  purpose: z.enum(["LOGIN", "CREATE_ACCOUNT"]).default("LOGIN"),
  displayName: z.string().trim().min(2).max(100).optional(),
  orderNumber: z.string().min(4).max(40).optional(),
  orderAccessToken: z.string().min(20).max(200).optional(),
});

const SESSION_DAYS = 30;

async function sendOtp(phone: string, code: string) {
  const env = getServerEnv();
  if (!env.OTP_PROVIDER_URL || !env.OTP_PROVIDER_TOKEN) {
    throw new ApiError(503, "OTP_PROVIDER_NOT_CONFIGURED", "Phone verification is not configured yet.");
  }
  const response = await fetch(env.OTP_PROVIDER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OTP_PROVIDER_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      to: phone,
      senderId: env.OTP_SENDER_ID,
      message: `${code} is your Tipsy Theory verification code. It expires in 5 minutes.`,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new ApiError(502, "OTP_DELIVERY_FAILED", "We could not send the verification code. Please try again.");
}

export async function requestOtp(input: z.infer<typeof requestOtpSchema>, requestIp?: string) {
  const phone = normalizeKenyanPhone(input.phone);
  const code = createNumericCode();
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  const [otp] = await sql<{ id: string }[]>`
    INSERT INTO phone_otps (phone, purpose, code_hash, expires_at, request_ip)
    VALUES (${phone}, ${input.purpose}, ${hashSecret(`${phone}:${input.purpose}:${code}`)}, ${expiresAt}, ${requestIp ?? null})
    RETURNING id
  `;
  try {
    await sendOtp(phone, code);
    await sql`
      INSERT INTO notifications (channel, event_type, destination, subject, body, status, attempts, sent_at)
      VALUES ('SMS', 'OTP_SENT', ${phone}, 'Verification code sent', 'A phone verification code was sent.', 'SENT', 1, now())
    `;
  } catch (error) {
    await sql`DELETE FROM phone_otps WHERE id = ${otp.id}`;
    throw error;
  }
  return { sent: true, expiresAt: expiresAt.toISOString(), maskedPhone: `0${phone.slice(3, 6)} *** ${phone.slice(-3)}` };
}

export async function createSession(userId: string) {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await sql`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (${userId}, ${hashSecret(token)}, ${expiresAt})`;
  return { token, expiresAt };
}

export async function verifyOtp(input: z.infer<typeof verifyOtpSchema>) {
  const phone = normalizeKenyanPhone(input.phone);
  return withTransaction(async (tx) => {
    const [otp] = await tx<{
      id: string;
      code_hash: string;
      expires_at: Date;
      attempts: number;
      max_attempts: number;
    }[]>`
      SELECT id, code_hash, expires_at, attempts, max_attempts
      FROM phone_otps
      WHERE phone = ${phone} AND purpose = ${input.purpose} AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1
      FOR UPDATE
    `;
    if (!otp) throw new ApiError(422, "OTP_NOT_FOUND", "Request a new verification code.");
    if (new Date(otp.expires_at).getTime() <= Date.now()) throw new ApiError(422, "OTP_EXPIRED", "That verification code has expired.");
    if (otp.attempts >= otp.max_attempts) throw new ApiError(429, "OTP_ATTEMPTS_EXCEEDED", "Too many incorrect attempts. Request a new code.");

    const matches = safeSecretEqual(`${phone}:${input.purpose}:${input.code}`, otp.code_hash);
    if (!matches) {
      await tx`UPDATE phone_otps SET attempts = attempts + 1 WHERE id = ${otp.id}`;
      throw new ApiError(422, "OTP_INCORRECT", "That verification code is incorrect.", { attemptsRemaining: otp.max_attempts - otp.attempts - 1 });
    }
    await tx`UPDATE phone_otps SET consumed_at = now() WHERE id = ${otp.id}`;

    const [user] = await tx<{ id: string; display_name: string | null; phone: string }[]>`
      INSERT INTO users (phone, display_name, phone_verified_at, last_login_at)
      VALUES (${phone}, ${input.displayName ?? null}, now(), now())
      ON CONFLICT (phone) DO UPDATE SET
        display_name = COALESCE(users.display_name, EXCLUDED.display_name),
        phone_verified_at = COALESCE(users.phone_verified_at, now()),
        last_login_at = now(),
        updated_at = now()
      RETURNING id, display_name, phone
    `;

    if (input.orderNumber && input.orderAccessToken) {
      const attached = await tx<{ id: string }[]>`
        UPDATE orders SET user_id = ${user.id}, updated_at = now()
        WHERE order_number = ${input.orderNumber}
          AND access_token_hash = ${hashSecret(input.orderAccessToken)}
          AND customer_phone = ${phone}
        RETURNING id
      `;
      if (attached[0]) await tx`UPDATE notifications SET user_id = ${user.id} WHERE order_id = ${attached[0].id} AND user_id IS NULL`;
    }
    await claimPendingLoyaltyPoints(tx, user.id, phone);
    return user;
  });
}

export async function getUserFromSession(rawToken: string | undefined) {
  if (!rawToken) return null;
  const [user] = await sql<{
    id: string;
    phone: string | null;
    email: string | null;
    display_name: string | null;
    role: string;
  }[]>`
    SELECT u.id, u.phone, u.email, u.display_name, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashSecret(rawToken)} AND s.expires_at > now() AND u.status = 'ACTIVE'
  `;
  return user ?? null;
}

export function createGoogleAuthorization() {
  const env = getServerEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new ApiError(503, "GOOGLE_AUTH_NOT_CONFIGURED", "Google sign-in is not configured yet.");
  }
  const state = createOpaqueToken(24);
  const verifier = createOpaqueToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const redirectUri = `${env.APP_URL}/api/v1/auth/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url, state, verifier, redirectUri };
}

export async function completeGoogleAuthorization(input: { code: string; verifier: string; redirectUri: string }) {
  const env = getServerEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new ApiError(503, "GOOGLE_AUTH_NOT_CONFIGURED", "Google sign-in is not configured yet.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
      code_verifier: input.verifier,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const tokens = await response.json() as { id_token?: string; error_description?: string };
  if (!response.ok || !tokens.id_token) throw new ApiError(502, "GOOGLE_AUTH_FAILED", tokens.error_description ?? "Google sign-in could not be completed.");

  const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  const verified = await jwtVerify(tokens.id_token, jwks, {
    audience: env.GOOGLE_CLIENT_ID,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  });
  const subject = verified.payload.sub;
  const email = typeof verified.payload.email === "string" ? verified.payload.email : null;
  const name = typeof verified.payload.name === "string" ? verified.payload.name : null;
  if (!subject || !email || verified.payload.email_verified !== true) throw new ApiError(422, "GOOGLE_IDENTITY_INVALID", "Google did not return a verified email address.");

  const [user] = await sql<{ id: string; phone: string | null; email: string; display_name: string | null }[]>`
    INSERT INTO users (email, google_subject, display_name, last_login_at)
    VALUES (${email}, ${subject}, ${name}, now())
    ON CONFLICT (email) DO UPDATE SET
      google_subject = COALESCE(users.google_subject, EXCLUDED.google_subject),
      display_name = COALESCE(users.display_name, EXCLUDED.display_name),
      last_login_at = now(),
      updated_at = now()
    RETURNING id, phone, email, display_name
  `;
  return user;
}
