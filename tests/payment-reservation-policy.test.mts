import assert from "node:assert/strict";
import test from "node:test";

import {
  needsPaymentStockHold,
  releasesStockImmediatelyAfterPromptFailure,
} from "../src/server/payment-reservation-policy.ts";

test("a newly created checkout has no stock hold", () => {
  assert.equal(needsPaymentStockHold("PENDING_PAYMENT", null, 1_000), true);
});

test("an active STK prompt keeps its existing hold", () => {
  assert.equal(
    needsPaymentStockHold("PENDING_PAYMENT", new Date(2_000), 1_000),
    false,
  );
});

test("an expired prompt or non-pending order needs a fresh hold", () => {
  assert.equal(
    needsPaymentStockHold("PENDING_PAYMENT", new Date(1_000), 1_000),
    true,
  );
  assert.equal(
    needsPaymentStockHold("PAYMENT_CANCELLED", new Date(2_000), 1_000),
    true,
  );
});

test("only definite pre-prompt failures release stock immediately", () => {
  assert.equal(releasesStockImmediatelyAfterPromptFailure("MPESA_AUTH_FAILED"), true);
  assert.equal(releasesStockImmediatelyAfterPromptFailure("MPESA_REQUEST_REJECTED"), true);
  assert.equal(releasesStockImmediatelyAfterPromptFailure("MPESA_UNAVAILABLE"), false);
  assert.equal(releasesStockImmediatelyAfterPromptFailure(null), false);
});
