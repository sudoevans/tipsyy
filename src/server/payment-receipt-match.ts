export function receiptMatchesOrder(
  receipt: {
    amount_minor: number;
    payer_phone: string | null;
    bill_reference: string | null;
    paid_at: Date | null;
    payment_id: string | null;
    order_id: string | null;
    status: string;
  },
  order: {
    payment_id: string;
    order_id: string;
    order_number: string;
    amount_minor: number;
    customer_phone: string;
    created_at: Date;
    status: string;
  },
  receiptOwnerId?: string,
) {
  const linked =
    receipt.payment_id === order.payment_id &&
    receipt.order_id === order.order_id;
  return (
    ["UNMATCHED", "MATCHED"].includes(receipt.status) &&
    order.status !== "REFUNDED" &&
    (!receiptOwnerId || receiptOwnerId === order.payment_id) &&
    (!receipt.payment_id || receipt.payment_id === order.payment_id) &&
    (!receipt.order_id || receipt.order_id === order.order_id) &&
    (linked ||
      receipt.bill_reference?.trim().toUpperCase() ===
        order.order_number.toUpperCase()) &&
    receipt.amount_minor === order.amount_minor &&
    receipt.payer_phone === order.customer_phone &&
    receipt.paid_at !== null &&
    receipt.paid_at.getTime() >= order.created_at.getTime() - 5 * 60_000 &&
    receipt.paid_at.getTime() <= Date.now() + 5 * 60_000
  );
}
