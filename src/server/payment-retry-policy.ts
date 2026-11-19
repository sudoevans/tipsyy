export interface PreviousPaymentAttempt {
  status: string;
  resultCode: string | null;
}

function definitelyNotPaid(attempt: PreviousPaymentAttempt | null): boolean {
  if (!attempt) return false;
  if (!["FAILED", "CANCELLED"].includes(attempt.status)) return false;
  if (["MPESA_AUTH_FAILED", "MPESA_REQUEST_REJECTED"].includes(attempt.resultCode ?? "")) return true;
  const code = Number(attempt.resultCode);
  return attempt.resultCode !== null && Number.isInteger(code) && code > 0 && code !== 1037;
}

export function canRetryPayment(
  orderStatus: string,
  paymentStatus: string,
  previous: PreviousPaymentAttempt | null,
): boolean {
  if (orderStatus === "PENDING_PAYMENT" && paymentStatus === "PENDING") {
    return previous === null || definitelyNotPaid(previous);
  }
  if (orderStatus === "PAYMENT_CANCELLED" && paymentStatus === "CANCELLED" && previous === null) {
    // The reservation expired before any M-Pesa request was made.
    return true;
  }
  if (
    ["PAYMENT_FAILED", "PAYMENT_CANCELLED"].includes(orderStatus) &&
    ["FAILED", "CANCELLED"].includes(paymentStatus)
  ) {
    return definitelyNotPaid(previous);
  }
  return false;
}
