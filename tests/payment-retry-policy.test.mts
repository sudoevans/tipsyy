import assert from "node:assert/strict";
import test from "node:test";

import { canRetryPayment } from "../src/server/payment-retry-policy.ts";

test("a new order can request its first prompt", () => {
  assert.equal(canRetryPayment("PENDING_PAYMENT", "PENDING", null), true);
});

test("a definite failed response can be retried on the same order", () => {
  assert.equal(canRetryPayment("PAYMENT_FAILED", "FAILED", { status: "FAILED", resultCode: "2001" }), true);
  assert.equal(canRetryPayment("PAYMENT_CANCELLED", "CANCELLED", { status: "CANCELLED", resultCode: "1032" }), true);
  assert.equal(canRetryPayment("PENDING_PAYMENT", "PENDING", { status: "FAILED", resultCode: "MPESA_REQUEST_REJECTED" }), true);
});

test("an uncertain or successful payment cannot trigger another prompt", () => {
  assert.equal(canRetryPayment("PENDING_PAYMENT", "PENDING", { status: "PENDING", resultCode: null }), false);
  assert.equal(canRetryPayment("PENDING_PAYMENT", "PENDING", { status: "FAILED", resultCode: null }), false);
  assert.equal(canRetryPayment("PAYMENT_CANCELLED", "CANCELLED", { status: "CANCELLED", resultCode: null }), false);
  assert.equal(canRetryPayment("PAYMENT_CANCELLED", "TIMED_OUT", { status: "TIMED_OUT", resultCode: "1037" }), false);
  assert.equal(canRetryPayment("CONFIRMED", "SUCCEEDED", { status: "SUCCEEDED", resultCode: "0" }), false);
  assert.equal(canRetryPayment("PENDING_PAYMENT", "RECONCILING", { status: "FAILED", resultCode: "2001" }), false);
});

test("an expired reservation with no M-Pesa attempt can be reused", () => {
  assert.equal(canRetryPayment("PAYMENT_CANCELLED", "CANCELLED", null), true);
});
