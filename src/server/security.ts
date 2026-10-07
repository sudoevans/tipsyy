import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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

export function safeSecretEqual(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashSecret(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
