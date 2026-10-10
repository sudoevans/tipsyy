import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { requireSessionSecret } from "./env";
import { ApiError } from "./http";

export function normalizeKenyanPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  let normalized = digits;
  if (/^0[17]\d{8}$/.test(digits)) normalized = `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) normalized = `254${digits}`;
  if (!/^254[17]\d{8}$/.test(normalized)) {
    throw new ApiError(422, "INVALID_PHONE", "Enter a valid Kenyan mobile number.");
  }
  return normalized;
}

export function formatKenyanPhone(phone: string): string {
  const normalized = normalizeKenyanPhone(phone);
  const local = `0${normalized.slice(3)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function createNumericCode(length = 6): string {
  const max = 10 ** length;
  const value = Number.parseInt(randomBytes(4).toString("hex"), 16) % max;
  return value.toString().padStart(length, "0");
}

export function hashSecret(value: string): string {
  return createHmac("sha256", requireSessionSecret()).update(value).digest("hex");
}

function settingsEncryptionKey() {
  return createHash("sha256")
    .update("tipsy-platform-settings-v1:")
    .update(requireSessionSecret())
    .digest();
}

export function encryptPlatformSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", settingsEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptPlatformSecret(value: string): string {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error("Stored Telegram credential is invalid. Save it again in Settings.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    settingsEncryptionKey(),
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function safeSecretEqual(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashSecret(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
