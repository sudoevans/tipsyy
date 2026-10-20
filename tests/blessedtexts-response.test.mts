import assert from "node:assert/strict";
import { test } from "node:test";
import { interpretBlessedTextsResponse } from "../src/server/blessedtexts-response.ts";
import { classifyOtpAttempt } from "../src/server/otp-sms-policy.ts";

test("accepted SMS requires a provider message ID", () => {
  assert.deepEqual(interpretBlessedTextsResponse(200, [{ status_code: "1000", message_id: "msg-123" }]), {
    outcome: "SENT", httpStatus: 200, providerStatusCode: "1000", providerMessageId: "msg-123",
  });
  assert.equal(interpretBlessedTextsResponse(200, [{ status_code: "1000" }]).outcome, "UNKNOWN");
});

for (const code of ["1001", "1002", "1003", "1004", "1005", "1006", "1007", "1008", "1009"]) {
  test(`provider rejection ${code} is definitive`, () => {
    const result = interpretBlessedTextsResponse(200, [{ status_code: code, status_desc: "Do not log this" }]);
    assert.equal(result.outcome, "FAILED");
    assert.equal(result.providerStatusCode, code);
    assert.ok(result.failureCategory);
    assert.equal(JSON.stringify(result).includes("Do not log this"), false);
  });
}

test("malformed and ambiguous responses remain unknown", () => {
  assert.equal(interpretBlessedTextsResponse(200, { status_code: "1000" }).outcome, "UNKNOWN");
  assert.equal(interpretBlessedTextsResponse(502, null).outcome, "UNKNOWN");
  assert.equal(interpretBlessedTextsResponse(500, [{ status_code: "1000", message_id: "msg-123" }]).outcome, "UNKNOWN");
  assert.equal(interpretBlessedTextsResponse(401, null).outcome, "FAILED");
});

test("uncertain outcomes retry the same code only while attempts remain", () => {
  assert.equal(classifyOtpAttempt({ outcome: "UNKNOWN", failureCategory: "NETWORK_OR_TIMEOUT" }, 1).status, "UNKNOWN");
  assert.deepEqual(classifyOtpAttempt({ outcome: "UNKNOWN" }, 3), {
    status: "FAILED", category: "UNCONFIRMED_AFTER_RETRIES",
  });
  assert.equal(classifyOtpAttempt({ outcome: "FAILED", failureCategory: "LOW_CREDITS" }, 1).status, "FAILED");
  assert.equal(classifyOtpAttempt({ outcome: "SENT", providerMessageId: "id" }, 2).status, "SENT");
});
