import assert from "node:assert/strict";
import { test } from "node:test";
import { receiptMatchesOrder } from "../src/server/payment-receipt-match.ts";

const created = new Date(Date.now() - 60_000);
const order = {
  payment_id: "payment-a",
  order_id: "order-a",
  order_number: "TT-2075",
  amount_minor: 1249,
  customer_phone: "254700000001",
  created_at: created,
  status: "PENDING",
};
const receipt = {
  amount_minor: 1249,
  payer_phone: order.customer_phone,
  bill_reference: order.order_number,
  paid_at: new Date(),
  payment_id: null,
  order_id: null,
  status: "UNMATCHED",
};
test("an exact trusted receipt matches its order", () =>
  assert.equal(receiptMatchesOrder(receipt, order), true));
test("same items/amount do not allow another order receipt", () =>
  assert.equal(
    receiptMatchesOrder({ ...receipt, bill_reference: "TT-2074" }, order),
    false,
  ));
test("receipt already attached elsewhere cannot be reused", () => {
  assert.equal(
    receiptMatchesOrder({ ...receipt, payment_id: "another-payment" }, order),
    false,
  );
  assert.equal(receiptMatchesOrder(receipt, order, "another-payment"), false);
});
test("amount, phone, timestamp and refund state must match", () => {
  assert.equal(
    receiptMatchesOrder({ ...receipt, amount_minor: 100 }, order),
    false,
  );
  assert.equal(
    receiptMatchesOrder({ ...receipt, payer_phone: "254700000002" }, order),
    false,
  );
  assert.equal(
    receiptMatchesOrder(
      { ...receipt, paid_at: new Date(created.getTime() - 3600000) },
      order,
    ),
    false,
  );
  assert.equal(
    receiptMatchesOrder({ ...receipt, paid_at: null }, order),
    false,
  );
  assert.equal(
    receiptMatchesOrder(receipt, { ...order, status: "REFUNDED" }),
    false,
  );
  assert.equal(
    receiptMatchesOrder({ ...receipt, status: "REVIEW" }, order),
    false,
  );
});
