import assert from "node:assert/strict";
import { test } from "node:test";
import { getClientIp } from "../src/server/client-ip.ts";

test("uses a valid Cloudflare client IP when forwarding is absent", () => {
  assert.equal(getClientIp(new Headers({ "cf-connecting-ip": "196.96.48.121" })), "196.96.48.121");
});

test("falls back to forwarding headers and rejects non-IP placeholders", () => {
  assert.equal(getClientIp(new Headers({ "x-forwarded-for": "2001:db8::1, 192.0.2.2" })), "2001:db8::1");
  assert.equal(getClientIp(new Headers({ "x-real-ip": "192.0.2.2" })), "192.0.2.2");
  assert.equal(getClientIp(new Headers({ "x-forwarded-for": "local" })), null);
  assert.equal(getClientIp(new Headers()), null);
});
