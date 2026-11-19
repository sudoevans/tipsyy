/**
 * A stock hold exists only while an M-Pesa prompt is active. Orders can be
 * priced and created ahead of that point, but must not consume inventory.
 */
export function needsPaymentStockHold(
  orderStatus: string,
  reservationExpiresAt: Date | null,
  now = Date.now(),
) {
  return (
    orderStatus !== "PENDING_PAYMENT" ||
    !reservationExpiresAt ||
    reservationExpiresAt.getTime() <= now
  );
}

/** A definitive provider response means no handset prompt exists to protect. */
export function releasesStockImmediatelyAfterPromptFailure(code: string | null) {
  return code === "MPESA_AUTH_FAILED" || code === "MPESA_REQUEST_REJECTED";
}
