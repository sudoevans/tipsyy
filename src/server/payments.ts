import { z } from "zod";

import { convertOrderReservations, releaseOrderReservations } from "./checkout";
import { sql, type Transaction, withTransaction } from "./db";
import { ApiError } from "./http";
import { initiateStkPush, mpesaCallbackMetadata, type StkCallbackPayload } from "./mpesa";
import { hashSecret, normalizeKenyanPhone } from "./security";

export const initiatePaymentSchema = z.object({
  orderNumber: z.string().min(4).max(40),
  accessToken: z.string().min(20).max(200),
  idempotencyKey: z.string().uuid(),
});

export const receiptLookupSchema = z.object({
  orderNumber: z.string().min(4).max(40),
  accessToken: z.string().min(20).max(200),
  receipt: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8,20}$/),
});

export const cancelPaymentSchema = z.object({
  orderNumber: z.string().min(4).max(40),
  accessToken: z.string().min(20).max(200),
  reason: z.enum(["CANCELLED", "TIMED_OUT"]).default("CANCELLED"),
});

interface PaymentContext {
  payment_id: string;
  payment_status: string;
  order_id: string;
  order_number: string;
  order_status: string;
  amount_minor: number;
  customer_phone: string;
  reservation_expires_at: Date;
}

interface CallbackAttempt {
  attempt_id: string;
  payment_id: string;
  payment_status: string;
  order_id: string;
  order_status: string;
  amount_minor: number;
  customer_phone: string;
  user_id: string | null;
}

function callbackPaymentStatus(resultCode: number) {
  if (resultCode === 0) return "SUCCEEDED" as const;
  if (resultCode === 1032) return "CANCELLED" as const;
  if (resultCode === 1037) return "TIMED_OUT" as const;
  return "FAILED" as const;
}

function failureOrderStatus(resultCode: number) {
  return resultCode === 1032 ? "PAYMENT_CANCELLED" as const : "PAYMENT_FAILED" as const;
}

function parseMpesaDate(value: unknown): Date | null {
  const digits = String(value ?? "");
  if (!/^\d{14}$/.test(digits)) return null;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6)) - 1;
  const day = Number(digits.slice(6, 8));
  const hour = Number(digits.slice(8, 10));
  const minute = Number(digits.slice(10, 12));
  const second = Number(digits.slice(12, 14));
  return new Date(Date.UTC(year, month, day, hour - 3, minute, second));
}

async function reacquireAndConvertLateReservation(tx: Transaction, orderId: string) {
  const items = await tx<{ variant_id: string; quantity: number; product_name: string; on_hand_quantity: number; reserved_quantity: number }[]>`
    SELECT oi.variant_id, oi.quantity, oi.product_name, i.on_hand_quantity, i.reserved_quantity
    FROM order_items oi
    JOIN inventory i ON i.variant_id = oi.variant_id
    WHERE oi.order_id = ${orderId}
    FOR UPDATE OF i
  `;
  for (const item of items) {
    if (item.variant_id === null || item.on_hand_quantity - item.reserved_quantity < item.quantity) return false;
  }
  for (const item of items) {
    await tx`
      UPDATE inventory
      SET on_hand_quantity = on_hand_quantity - ${item.quantity},
          sold_quantity = sold_quantity + ${item.quantity},
          updated_at = now()
      WHERE variant_id = ${item.variant_id}
    `;
    await tx`
      UPDATE inventory_reservations
      SET status = 'CONVERTED', converted_at = now()
      WHERE order_id = ${orderId} AND variant_id = ${item.variant_id} AND status IN ('EXPIRED', 'RELEASED')
    `;
  }
  return true;
}

export async function initiateOrderPayment(input: z.infer<typeof initiatePaymentSchema>) {
  const context = await withTransaction(async (tx) => {
    const [payment] = await tx<PaymentContext[]>`
      SELECT p.id AS payment_id, p.status AS payment_status, o.id AS order_id,
             o.order_number, o.status AS order_status, p.amount_minor,
             o.customer_phone, o.reservation_expires_at
      FROM orders o
      JOIN payments p ON p.order_id = o.id
      WHERE o.order_number = ${input.orderNumber} AND o.access_token_hash = ${hashSecret(input.accessToken)}
      FOR UPDATE OF o, p
    `;
    if (!payment) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
    if (payment.payment_status === "SUCCEEDED") {
      throw new ApiError(409, "PAYMENT_ALREADY_COMPLETE", "This order has already been paid.");
    }
    if (payment.order_status !== "PENDING_PAYMENT") {
      throw new ApiError(409, "ORDER_NOT_PAYABLE", "This order can no longer be paid.");
    }
    if (new Date(payment.reservation_expires_at).getTime() <= Date.now()) {
      await releaseOrderReservations(tx, payment.order_id, "EXPIRED");
      await tx`UPDATE orders SET status = 'PAYMENT_CANCELLED', cancelled_at = now(), updated_at = now() WHERE id = ${payment.order_id}`;
      throw new ApiError(409, "RESERVATION_EXPIRED", "Your stock reservation expired. Review your cart and try again.");
    }

    const [existing] = await tx<{ id: string; status: string; checkout_request_id: string | null; merchant_request_id: string | null }[]>`
      SELECT id, status, checkout_request_id, merchant_request_id
      FROM payment_attempts WHERE idempotency_key = ${input.idempotencyKey}
    `;
    if (existing) return { payment, attempt: existing, existing: true };
    const [pending] = await tx<{ id: string }[]>`
      SELECT id FROM payment_attempts WHERE payment_id = ${payment.payment_id} AND status = 'PENDING'
    `;
    if (pending) throw new ApiError(409, "PAYMENT_ALREADY_PENDING", "An M-Pesa prompt is already pending for this order.");

    const [attempt] = await tx<{ id: string; status: string; checkout_request_id: string | null; merchant_request_id: string | null }[]>`
      INSERT INTO payment_attempts (payment_id, idempotency_key, request_payload)
      VALUES (${payment.payment_id}, ${input.idempotencyKey}, ${tx.json({ orderNumber: input.orderNumber, phone: payment.customer_phone, amount: payment.amount_minor })})
      RETURNING id, status, checkout_request_id, merchant_request_id
    `;
    return { payment, attempt, existing: false };
  });

  if (context.existing) {
    return {
      status: context.attempt.status,
      checkoutRequestId: context.attempt.checkout_request_id,
      merchantRequestId: context.attempt.merchant_request_id,
    };
  }

  try {
    const provider = await initiateStkPush({
      amount: context.payment.amount_minor,
      phone: context.payment.customer_phone,
      orderNumber: context.payment.order_number,
    });
    await sql`
      UPDATE payment_attempts
      SET merchant_request_id = ${provider.response.MerchantRequestID ?? null},
          checkout_request_id = ${provider.response.CheckoutRequestID ?? null},
          request_payload = ${sql.json(JSON.parse(JSON.stringify(provider.request)))},
          response_payload = ${sql.json(JSON.parse(JSON.stringify(provider.response)))}
      WHERE id = ${context.attempt.id}
    `;
    return {
      status: "PENDING" as const,
      checkoutRequestId: provider.response.CheckoutRequestID,
      merchantRequestId: provider.response.MerchantRequestID,
      customerMessage: provider.response.CustomerMessage ?? "Check your phone and enter your M-Pesa PIN.",
    };
  } catch (error) {
    await sql`
      UPDATE payment_attempts
      SET status = 'FAILED', completed_at = now(), result_description = ${error instanceof Error ? error.message : "M-Pesa initiation failed"}
      WHERE id = ${context.attempt.id}
    `;
    throw error;
  }
}

export async function cancelPendingOrderPayment(input: z.infer<typeof cancelPaymentSchema>) {
  return withTransaction(async (tx) => {
    const [payment] = await tx<{ payment_id: string; order_id: string; order_status: string; payment_status: string }[]>`
      SELECT p.id AS payment_id, o.id AS order_id, o.status AS order_status, p.status AS payment_status
      FROM orders o
      JOIN payments p ON p.order_id = o.id
      WHERE o.order_number = ${input.orderNumber} AND o.access_token_hash = ${hashSecret(input.accessToken)}
      FOR UPDATE OF o, p
    `;
    if (!payment) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
    if (payment.payment_status === "SUCCEEDED") throw new ApiError(409, "PAYMENT_ALREADY_COMPLETE", "This order has already been paid.");

    if (payment.order_status === "PENDING_PAYMENT" && payment.payment_status === "PENDING") {
      await releaseOrderReservations(tx, payment.order_id);
      const note = input.reason === "TIMED_OUT"
        ? "M-Pesa prompt timed out after 30 seconds of inactivity."
        : "Customer cancelled the pending M-Pesa payment.";
      await tx`
        UPDATE payment_attempts
        SET status = ${input.reason}, completed_at = now(), result_description = ${note}
        WHERE payment_id = ${payment.payment_id} AND status = 'PENDING'
      `;
      await tx`UPDATE payments SET status = ${input.reason}, updated_at = now() WHERE id = ${payment.payment_id}`;
      await tx`
        UPDATE orders SET status = 'PAYMENT_CANCELLED', cancelled_at = now(), updated_at = now()
        WHERE id = ${payment.order_id}
      `;
      await tx`
        INSERT INTO order_events (order_id, from_status, to_status, source, note)
        VALUES (${payment.order_id}, 'PENDING_PAYMENT', 'PAYMENT_CANCELLED', ${input.reason === "TIMED_OUT" ? "mpesa-timeout" : "customer-cancelled"}, ${note})
      `;
    }
    return { status: "CANCELLED" as const };
  });
}

export async function processMpesaCallback(payload: StkCallbackPayload) {
  const callback = payload.Body?.stkCallback;
  if (!callback?.CheckoutRequestID || typeof callback.ResultCode !== "number") {
    throw new ApiError(400, "INVALID_MPESA_CALLBACK", "The callback payload is missing required M-Pesa fields.");
  }
  const checkoutRequestId = callback.CheckoutRequestID;
  const resultCode = callback.ResultCode;
  const resultDescription = callback.ResultDesc ?? "M-Pesa returned a payment result.";
  const serializedPayload = JSON.parse(JSON.stringify(payload));
  const eventKey = `${checkoutRequestId}:${resultCode}`;
  return withTransaction(async (tx) => {
    const inserted = await tx<{ id: string }[]>`
      INSERT INTO webhook_events (provider, event_key, payload)
      VALUES ('MPESA', ${eventKey}, ${tx.json(serializedPayload)})
      ON CONFLICT (provider, event_key) DO NOTHING
      RETURNING id
    `;
    if (inserted.length === 0) return { duplicate: true, processed: true };

    const attempts = await tx<CallbackAttempt[]>`
      SELECT pa.id AS attempt_id, p.id AS payment_id, p.status AS payment_status,
             o.id AS order_id, o.status AS order_status, p.amount_minor, o.customer_phone, o.user_id
      FROM payment_attempts pa
      JOIN payments p ON p.id = pa.payment_id
      JOIN orders o ON o.id = p.order_id
      WHERE pa.checkout_request_id = ${checkoutRequestId}
      FOR UPDATE OF pa, p, o
    `;
    const attempt = attempts[0];
    if (!attempt) {
      await tx`
        UPDATE webhook_events SET processed_at = now(), processing_error = 'Unknown CheckoutRequestID'
        WHERE provider = 'MPESA' AND event_key = ${eventKey}
      `;
      return { duplicate: false, processed: false };
    }
    if (attempt.payment_status === "SUCCEEDED") {
      await tx`UPDATE webhook_events SET processed_at = now() WHERE provider = 'MPESA' AND event_key = ${eventKey}`;
      return { duplicate: true, processed: true };
    }

    const metadata = mpesaCallbackMetadata(payload);
    const resultStatus = callbackPaymentStatus(resultCode);

    if (resultStatus === "SUCCEEDED") {
      const receipt = typeof metadata.MpesaReceiptNumber === "string" ? metadata.MpesaReceiptNumber : "";
      const amount = Number(metadata.Amount);
      let callbackPhone: string | null = null;
      try {
        callbackPhone = normalizeKenyanPhone(String(metadata.PhoneNumber ?? ""));
      } catch {
        callbackPhone = null;
      }
      if (!receipt || !Number.isFinite(amount) || Math.round(amount) !== attempt.amount_minor || callbackPhone !== attempt.customer_phone) {
        await tx`
          UPDATE webhook_events SET processed_at = now(), processing_error = 'Callback payment details did not match the order.'
          WHERE provider = 'MPESA' AND event_key = ${eventKey}
        `;
        await tx`
          UPDATE payment_attempts SET callback_payload = ${tx.json(serializedPayload)}, status = 'FAILED', result_code = ${String(resultCode)},
            result_description = 'Callback verification failed', completed_at = now() WHERE id = ${attempt.attempt_id}
        `;
        return { duplicate: false, processed: false };
      }

      const activeReservations = await tx<{ count: number }[]>`
        SELECT count(*)::int AS count FROM inventory_reservations WHERE order_id = ${attempt.order_id} AND status = 'ACTIVE'
      `;
      const inventorySettled = activeReservations[0].count > 0
        ? await convertOrderReservations(tx, attempt.order_id).then(() => true)
        : await reacquireAndConvertLateReservation(tx, attempt.order_id);
      const paidAt = parseMpesaDate(metadata.TransactionDate) ?? new Date();

      await tx`
        UPDATE payment_attempts SET callback_payload = ${tx.json(serializedPayload)}, status = 'SUCCEEDED', result_code = '0',
          result_description = ${resultDescription}, completed_at = now() WHERE id = ${attempt.attempt_id}
      `;
      await tx`
        UPDATE payments SET status = 'SUCCEEDED', provider_receipt = ${receipt}, payer_phone = ${callbackPhone},
          paid_at = ${paidAt}, raw_result = ${tx.json(serializedPayload)}, updated_at = now() WHERE id = ${attempt.payment_id}
      `;
      await tx`
        UPDATE orders SET status = ${inventorySettled ? "CONFIRMED" : "PAID"}, paid_at = ${paidAt},
          confirmed_at = ${inventorySettled ? paidAt : null}, updated_at = now() WHERE id = ${attempt.order_id}
      `;
      await tx`
        INSERT INTO order_events (order_id, from_status, to_status, source, note, metadata)
        VALUES (${attempt.order_id}, ${attempt.order_status}, 'PAID', 'mpesa-callback', 'M-Pesa payment verified.', ${tx.json({ receipt })})
      `;
      if (inventorySettled) {
        await tx`
          INSERT INTO order_events (order_id, from_status, to_status, source, note)
          VALUES (${attempt.order_id}, 'PAID', 'CONFIRMED', 'mpesa-callback', 'Payment confirmed and reserved inventory converted to sale.')
        `;
      }
      await tx`
        INSERT INTO notifications (user_id, order_id, channel, event_type, destination, subject, body)
        VALUES (${attempt.user_id}, ${attempt.order_id}, 'SMS', 'PAYMENT_SUCCESSFUL', ${callbackPhone}, 'Payment received', ${`M-Pesa payment ${receipt} was received.`})
      `;
    } else {
      const orderStatus = failureOrderStatus(resultCode);
      await releaseOrderReservations(tx, attempt.order_id);
      await tx`
        UPDATE payment_attempts SET callback_payload = ${tx.json(serializedPayload)}, status = ${resultStatus},
          result_code = ${String(resultCode)}, result_description = ${resultDescription}, completed_at = now()
        WHERE id = ${attempt.attempt_id}
      `;
      await tx`UPDATE payments SET status = ${resultStatus}, raw_result = ${tx.json(serializedPayload)}, updated_at = now() WHERE id = ${attempt.payment_id}`;
      await tx`UPDATE orders SET status = ${orderStatus}, cancelled_at = now(), updated_at = now() WHERE id = ${attempt.order_id}`;
      await tx`
        INSERT INTO order_events (order_id, from_status, to_status, source, note, metadata)
        VALUES (${attempt.order_id}, ${attempt.order_status}, ${orderStatus}, 'mpesa-callback', ${resultDescription}, ${tx.json({ resultCode })})
      `;
      await tx`
        INSERT INTO notifications (user_id, order_id, channel, event_type, destination, subject, body)
        VALUES (${attempt.user_id}, ${attempt.order_id}, 'SMS', 'PAYMENT_FAILED', ${attempt.customer_phone}, 'Payment not completed', ${resultDescription})
      `;
    }

    await tx`UPDATE webhook_events SET processed_at = now() WHERE provider = 'MPESA' AND event_key = ${eventKey}`;
    return { duplicate: false, processed: true };
  });
}

export async function verifyReceipt(input: z.infer<typeof receiptLookupSchema>) {
  const [payment] = await sql<{
    status: string;
    provider_receipt: string | null;
    paid_at: Date | null;
    amount_minor: number;
  }[]>`
    SELECT p.status, p.provider_receipt, p.paid_at, p.amount_minor
    FROM orders o JOIN payments p ON p.order_id = o.id
    WHERE o.order_number = ${input.orderNumber} AND o.access_token_hash = ${hashSecret(input.accessToken)}
  `;
  if (!payment) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
  if (payment.status !== "SUCCEEDED" || payment.provider_receipt !== input.receipt) {
    throw new ApiError(422, "RECEIPT_NOT_VERIFIED", "That code does not match a completed M-Pesa payment for this order.");
  }
  return { verified: true, receipt: payment.provider_receipt, paidAt: payment.paid_at, amount: payment.amount_minor };
}
