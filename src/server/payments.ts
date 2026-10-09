import { z } from "zod";

import {
  convertOrderReservations,
  ensureCheckoutCustomerAccount,
  releaseOrderReservations,
  RESERVATION_MINUTES,
} from "./checkout";
import { evaluateInventoryNotifications, publishAdminNotification, resolveAdminNotification } from "./admin-notifications";
import { enqueueTelegramAlert } from "./notifications";
import { sql, type Transaction, withTransaction } from "./db";
import { ApiError } from "./http";
import {
  initiateStkPush,
  mpesaCallbackMetadata,
  type StkCallbackPayload,
} from "./mpesa";
import { hashSecret, normalizeKenyanPhone } from "./security";

export const initiatePaymentSchema = z.object({
  orderNumber: z.string().min(4).max(40),
  accessToken: z.string().min(20).max(200),
  idempotencyKey: z.string().uuid(),
});

export const receiptLookupSchema = z.object({
  orderNumber: z.string().min(4).max(40),
  accessToken: z.string().min(20).max(200),
  receipt: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{8,20}$/),
});

export const reportPaymentIssueSchema = z.object({
  orderNumber: z.string().min(4).max(40),
  accessToken: z.string().min(20).max(200),
  receipt: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{8,20}$/),
});

export const confirmPaymentInvestigationSchema = z.object({
  receipt: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{8,20}$/),
  payerPhone: z.string().min(9).max(25),
  amountMinor: z.coerce.number().int().positive(),
  paidAt: z.coerce.date(),
  note: z.string().trim().min(8).max(800),
});

export const cancelPaymentSchema = z.object({
  orderNumber: z.string().min(4).max(40),
  accessToken: z.string().min(20).max(200),
  reason: z.literal("CANCELLED").default("CANCELLED"),
});

interface PaymentContext {
  payment_id: string;
  payment_status: string;
  order_id: string;
  order_number: string;
  order_status: string;
  amount_minor: number;
  customer_name: string;
  customer_phone: string;
  user_id: string | null;
  reservation_expires_at: Date;
}

interface CallbackAttempt {
  attempt_id: string;
  attempt_status: string;
  payment_id: string;
  payment_status: string;
  order_id: string;
  order_number: string;
  order_status: string;
  amount_minor: number;
  customer_phone: string;
  user_id: string | null;
  merchant_request_id: string | null;
}

function callbackPaymentStatus(resultCode: number) {
  if (resultCode === 0) return "SUCCEEDED" as const;
  if (resultCode === 1032) return "CANCELLED" as const;
  if (resultCode === 1037) return "TIMED_OUT" as const;
  return "FAILED" as const;
}

function failureOrderStatus(resultCode: number) {
  return resultCode === 1032
    ? ("PAYMENT_CANCELLED" as const)
    : ("PAYMENT_FAILED" as const);
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

async function reacquireAndConvertLateReservation(
  tx: Transaction,
  orderId: string,
) {
  const [expectedItems] = await tx<{ count: number }[]>`
    SELECT count(*)::int AS count FROM order_items WHERE order_id = ${orderId}
  `;
  const items = await tx<
    {
      variant_id: string;
      quantity: number;
      product_name: string;
      on_hand_quantity: number;
      reserved_quantity: number;
    }[]
  >`
    SELECT oi.variant_id, oi.quantity, oi.product_name, i.on_hand_quantity, i.reserved_quantity
    FROM order_items oi
    JOIN inventory i ON i.variant_id = oi.variant_id
    WHERE oi.order_id = ${orderId}
    FOR UPDATE OF i
  `;
  if (items.length === 0 || items.length !== expectedItems?.count) return false;
  for (const item of items) {
    if (
      item.variant_id === null ||
      item.on_hand_quantity - item.reserved_quantity < item.quantity
    )
      return false;
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

async function settleSuccessfulPayment(
  tx: Transaction,
  input: {
    attemptId?: string | null;
    paymentId: string;
    orderId: string;
    orderNumber: string;
    orderStatus: string;
    userId: string | null;
    receipt: string;
    payerPhone: string;
    paidAt: Date;
    amountMinor: number;
    source: "MPESA_CALLBACK" | "ADMIN_CONFIRMATION";
    resultDescription: string;
    callbackPayload?: unknown;
    adminId?: string;
    manualNote?: string;
  },
) {
  const activeReservations = await tx<{ count: number }[]>`
    SELECT count(*)::int AS count FROM inventory_reservations
    WHERE order_id = ${input.orderId} AND status = 'ACTIVE'
  `;
  const inventorySettled =
    activeReservations[0].count > 0
      ? await convertOrderReservations(tx, input.orderId).then(() => true)
      : await reacquireAndConvertLateReservation(tx, input.orderId);
  const nextOrderStatus = inventorySettled ? "CONFIRMED" : "PAID_REQUIRES_REVIEW";
  await evaluateInventoryNotifications(tx);

  if (input.attemptId) {
    await tx`
      UPDATE payment_attempts
      SET callback_payload = COALESCE(${input.callbackPayload ? tx.json(JSON.parse(JSON.stringify(input.callbackPayload))) : null}, callback_payload),
          status = 'SUCCEEDED', result_code = '0', result_description = ${input.resultDescription},
          callback_received_at = CASE WHEN ${input.source} = 'MPESA_CALLBACK' THEN now() ELSE callback_received_at END,
          completed_at = now()
      WHERE id = ${input.attemptId} AND status <> 'SUCCEEDED'
    `;
  }
  await tx`
    UPDATE payments
    SET status = 'SUCCEEDED', provider_receipt = ${input.receipt}, payer_phone = ${input.payerPhone},
        paid_at = ${input.paidAt}, raw_result = COALESCE(${input.callbackPayload ? tx.json(JSON.parse(JSON.stringify(input.callbackPayload))) : null}, raw_result),
        settlement_source = ${input.source}, manually_confirmed_by = ${input.adminId ?? null},
        manually_confirmed_at = ${input.adminId ? new Date() : null},
        manual_confirmation_note = ${input.manualNote ?? null}, updated_at = now()
    WHERE id = ${input.paymentId} AND status <> 'SUCCEEDED'
  `;
  await tx`
    UPDATE orders
    SET status = ${nextOrderStatus}, paid_at = ${input.paidAt},
        confirmed_at = ${inventorySettled ? input.paidAt : null}, updated_at = now()
    WHERE id = ${input.orderId}
  `;
  await tx`
    INSERT INTO order_events (order_id, from_status, to_status, actor_user_id, source, note, metadata)
    VALUES (${input.orderId}, ${input.orderStatus}, ${nextOrderStatus}, ${input.adminId ?? null},
      ${input.source === "MPESA_CALLBACK" ? "mpesa-callback" : "admin-payment-confirmation"},
      ${input.resultDescription}, ${tx.json({ receipt: input.receipt, settlementSource: input.source })})
  `;
  await tx`
    INSERT INTO notifications (user_id, order_id, channel, event_type, destination, subject, body)
    VALUES (${input.userId}, ${input.orderId}, 'SMS', 'PAYMENT_SUCCESSFUL', ${input.payerPhone}, 'Payment received',
      ${`M-Pesa payment ${input.receipt} was received.`})
  `;
  await enqueueTelegramAlert(tx, {
    eventType: "ORDER_PAID",
    entityType: "order",
    entityId: input.orderId,
    title: `Payment received · ${input.orderNumber}`,
    body: `${input.orderNumber} payment confirmed for KSh ${(input.amountMinor / 100).toLocaleString("en-KE")}.`,
  });

  if (inventorySettled) {
    await publishAdminNotification(tx, {
      eventType: "ORDER_READY",
      entityType: "order",
      entityId: input.orderId,
      severity: "INFO",
      title: "New paid order",
      body: `${input.orderNumber} is paid and ready for operations.`,
      href: `/admin/orders?q=${encodeURIComponent(input.orderNumber)}`,
    });
  } else {
    await publishAdminNotification(tx, {
      eventType: "PAID_FULFILMENT_REVIEW",
      entityType: "order",
      entityId: input.orderId,
      severity: "CRITICAL",
      title: "Paid order needs fulfilment review",
      body: `${input.orderNumber} was paid, but its items are no longer available to fulfil automatically.`,
      href: `/admin/orders?q=${encodeURIComponent(input.orderNumber)}`,
    });
  }
  return { inventorySettled, nextOrderStatus };
}

export async function initiateOrderPayment(
  input: z.infer<typeof initiatePaymentSchema>,
) {
  const context = await withTransaction(async (tx) => {
    const [payment] = await tx<PaymentContext[]>`
      SELECT p.id AS payment_id, p.status AS payment_status, o.id AS order_id,
             o.order_number, o.status AS order_status, p.amount_minor,
             o.customer_name, o.customer_phone, o.user_id, o.reservation_expires_at
      FROM orders o
      JOIN payments p ON p.order_id = o.id
      WHERE o.order_number = ${input.orderNumber} AND o.access_token_hash = ${hashSecret(input.accessToken)}
      FOR UPDATE OF o, p
    `;
    if (!payment)
      throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
    if (!payment.user_id) {
      const customerUserId = await ensureCheckoutCustomerAccount(
        tx,
        payment.customer_name,
        payment.customer_phone,
      );
      if (customerUserId) {
        await tx`UPDATE orders SET user_id = ${customerUserId}, updated_at = now() WHERE id = ${payment.order_id}`;
      }
    }
    if (payment.payment_status === "SUCCEEDED") {
      throw new ApiError(
        409,
        "PAYMENT_ALREADY_COMPLETE",
        "This order has already been paid.",
      );
    }
    if (payment.payment_status === "RECONCILING") {
      throw new ApiError(
        409,
        "PAYMENT_UNDER_REVIEW",
        "This payment is being reviewed. Check its status instead of starting another prompt.",
      );
    }
    if (payment.order_status !== "PENDING_PAYMENT") {
      throw new ApiError(
        409,
        "ORDER_NOT_PAYABLE",
        "This order can no longer be paid.",
      );
    }
    if (new Date(payment.reservation_expires_at).getTime() <= Date.now()) {
      await releaseOrderReservations(tx, payment.order_id, "EXPIRED");
      await tx`UPDATE orders SET status = 'PAYMENT_CANCELLED', cancelled_at = now(), updated_at = now() WHERE id = ${payment.order_id}`;
      throw new ApiError(
        409,
        "RESERVATION_EXPIRED",
        "Your stock reservation expired. Review your cart and try again.",
      );
    }

    const [existing] = await tx<
      {
        id: string;
        payment_id: string;
        status: string;
        checkout_request_id: string | null;
        merchant_request_id: string | null;
      }[]
    >`
      SELECT id, payment_id, status, checkout_request_id, merchant_request_id
      FROM payment_attempts WHERE idempotency_key = ${input.idempotencyKey}
    `;
    if (existing) {
      if (existing.payment_id !== payment.payment_id) {
        throw new ApiError(409, "IDEMPOTENCY_KEY_CONFLICT", "This payment request could not be safely repeated.");
      }
      return { payment, attempt: existing, existing: true };
    }
    const [pending] = await tx<{ id: string }[]>`
      SELECT id FROM payment_attempts WHERE payment_id = ${payment.payment_id} AND status = 'PENDING'
    `;
    if (pending)
      throw new ApiError(
        409,
        "PAYMENT_ALREADY_PENDING",
        "An M-Pesa prompt is already pending for this order.",
      );

    const [attempt] = await tx<
      {
        id: string;
        status: string;
        checkout_request_id: string | null;
        merchant_request_id: string | null;
      }[]
    >`
      INSERT INTO payment_attempts (payment_id, idempotency_key, request_fingerprint, request_payload)
      VALUES (${payment.payment_id}, ${input.idempotencyKey}, ${hashSecret(`${payment.order_id}:${payment.customer_phone}:${payment.amount_minor}`)}, ${tx.json({ orderNumber: input.orderNumber, phone: payment.customer_phone, amount: payment.amount_minor })})
      RETURNING id, status, checkout_request_id, merchant_request_id
    `;
    const reservationExpiresAt = new Date(
      Date.now() + RESERVATION_MINUTES * 60_000,
    );
    await tx`
      UPDATE orders SET reservation_expires_at = ${reservationExpiresAt}, updated_at = now()
      WHERE id = ${payment.order_id} AND status = 'PENDING_PAYMENT'
    `;
    await tx`
      UPDATE inventory_reservations SET expires_at = ${reservationExpiresAt}
      WHERE order_id = ${payment.order_id} AND status = 'ACTIVE'
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
      customerMessage:
        provider.response.CustomerMessage ??
        "Check your phone and enter your M-Pesa PIN.",
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

export async function cancelPendingOrderPayment(
  input: z.infer<typeof cancelPaymentSchema>,
) {
  return withTransaction(async (tx) => {
    const [payment] = await tx<
      {
        payment_id: string;
        order_id: string;
        order_status: string;
        payment_status: string;
      }[]
    >`
      SELECT p.id AS payment_id, o.id AS order_id, o.status AS order_status, p.status AS payment_status
      FROM orders o
      JOIN payments p ON p.order_id = o.id
      WHERE o.order_number = ${input.orderNumber} AND o.access_token_hash = ${hashSecret(input.accessToken)}
      FOR UPDATE OF o, p
    `;
    if (!payment)
      throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
    if (payment.payment_status === "SUCCEEDED")
      throw new ApiError(
        409,
        "PAYMENT_ALREADY_COMPLETE",
        "This order has already been paid.",
      );
    if (payment.payment_status === "RECONCILING") {
      throw new ApiError(
        409,
        "PAYMENT_UNDER_REVIEW",
        "This payment has been reported for review and cannot be cancelled.",
      );
    }

    if (
      payment.order_status === "PENDING_PAYMENT" &&
      payment.payment_status === "PENDING"
    ) {
      await releaseOrderReservations(tx, payment.order_id);
      const note = "Customer cancelled the pending M-Pesa payment.";
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
        VALUES (${payment.order_id}, 'PENDING_PAYMENT', 'PAYMENT_CANCELLED', 'customer-cancelled', ${note})
      `;
    }
    return { status: "CANCELLED" as const };
  });
}

export async function processMpesaCallback(payload: StkCallbackPayload) {
  const callback = payload.Body?.stkCallback;
  if (!callback?.CheckoutRequestID || typeof callback.ResultCode !== "number") {
    throw new ApiError(
      400,
      "INVALID_MPESA_CALLBACK",
      "The callback payload is missing required M-Pesa fields.",
    );
  }
  const checkoutRequestId = callback.CheckoutRequestID;
  const resultCode = callback.ResultCode;
  const resultDescription =
    callback.ResultDesc ?? "M-Pesa returned a payment result.";
  const serializedPayload = JSON.parse(JSON.stringify(payload));
  const eventKey = checkoutRequestId;
  return withTransaction(async (tx) => {
    const inserted = await tx<{ id: string }[]>`
      INSERT INTO webhook_events (provider, event_key, payload)
      VALUES ('MPESA', ${eventKey}, ${tx.json(serializedPayload)})
      ON CONFLICT (provider, event_key) DO NOTHING
      RETURNING id
    `;
    if (inserted.length === 0) {
      const [existing] = await tx<{ payload: unknown }[]>`
        SELECT payload FROM webhook_events WHERE provider = 'MPESA' AND event_key = ${eventKey}
      `;
      if (JSON.stringify(existing?.payload) !== JSON.stringify(serializedPayload)) {
        await tx`
          UPDATE webhook_events
          SET processing_error = 'Conflicting callback payload received for CheckoutRequestID.'
          WHERE provider = 'MPESA' AND event_key = ${eventKey}
        `;
        await publishAdminNotification(tx, {
          eventType: "CONFLICTING_MPESA_CALLBACK",
          entityType: "mpesa_checkout_request",
          entityId: checkoutRequestId,
          severity: "CRITICAL",
          title: "Conflicting M-Pesa callback",
          body: "A second callback for the same request carried different payment data.",
          href: "/admin/transactions",
        });
      }
      return { duplicate: true, processed: true };
    }

    const attempts = await tx<CallbackAttempt[]>`
      SELECT pa.id AS attempt_id, pa.status AS attempt_status, pa.merchant_request_id,
             p.id AS payment_id, p.status AS payment_status,
             o.id AS order_id, o.order_number, o.status AS order_status, p.amount_minor, o.customer_phone, o.user_id
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
      await publishAdminNotification(tx, {
        eventType: "UNKNOWN_MPESA_CALLBACK",
        entityType: "mpesa_checkout_request",
        entityId: checkoutRequestId,
        severity: "CRITICAL",
        title: "Unknown M-Pesa callback",
        body: "M-Pesa sent a callback that does not belong to a recorded payment attempt.",
        href: "/admin/transactions",
      });
      return { duplicate: false, processed: false };
    }
    if (!callback.MerchantRequestID || callback.MerchantRequestID !== attempt.merchant_request_id) {
      await tx`
        UPDATE webhook_events SET processed_at = now(), processing_error = 'MerchantRequestID did not match the payment attempt.'
        WHERE provider = 'MPESA' AND event_key = ${eventKey}
      `;
      await publishAdminNotification(tx, {
        eventType: "MPESA_CALLBACK_MISMATCH",
        entityType: "payment_attempt",
        entityId: attempt.attempt_id,
        severity: "CRITICAL",
        title: "M-Pesa callback needs review",
        body: "A payment callback did not match its original M-Pesa request.",
        href: "/admin/transactions",
      });
      return { duplicate: false, processed: false };
    }
    if (attempt.payment_status === "SUCCEEDED") {
      await tx`UPDATE webhook_events SET processed_at = now() WHERE provider = 'MPESA' AND event_key = ${eventKey}`;
      return { duplicate: true, processed: true };
    }

    const metadata = mpesaCallbackMetadata(payload);
    const resultStatus = callbackPaymentStatus(resultCode);

    if (resultStatus === "SUCCEEDED") {
      const receipt =
        typeof metadata.MpesaReceiptNumber === "string"
          ? metadata.MpesaReceiptNumber
          : "";
      const amount = Number(metadata.Amount);
      let callbackPhone: string | null = null;
      try {
        callbackPhone = normalizeKenyanPhone(
          String(metadata.PhoneNumber ?? ""),
        );
      } catch {
        callbackPhone = null;
      }
      if (
        !receipt ||
        !Number.isFinite(amount) ||
        Math.round(amount) !== attempt.amount_minor ||
        callbackPhone !== attempt.customer_phone
      ) {
        await tx`
          UPDATE webhook_events SET processed_at = now(), processing_error = 'Callback payment details did not match the order.'
          WHERE provider = 'MPESA' AND event_key = ${eventKey}
        `;
        await tx`UPDATE payment_attempts SET callback_payload = ${tx.json(serializedPayload)}, status = 'FAILED', result_code = ${String(resultCode)}, result_description = 'Callback verification failed', callback_received_at = now(), completed_at = now() WHERE id = ${attempt.attempt_id} AND status = 'PENDING'`;
        await tx`UPDATE payments SET status = 'RECONCILING', updated_at = now() WHERE id = ${attempt.payment_id} AND status <> 'SUCCEEDED'`;
        await publishAdminNotification(tx, {
          eventType: "MPESA_CALLBACK_MISMATCH",
          entityType: "payment_attempt",
          entityId: attempt.attempt_id,
          severity: "CRITICAL",
          title: "M-Pesa callback needs review",
          body: "The receipt, amount, or payer number did not match the expected order payment.",
          href: "/admin/transactions",
        });
        return { duplicate: false, processed: false };
      }
      const [receiptOwner] = await tx<{ payment_id: string }[]>`
        SELECT id AS payment_id FROM payments
        WHERE lower(provider_receipt) = lower(${receipt})
        FOR UPDATE
      `;
      if (receiptOwner && receiptOwner.payment_id !== attempt.payment_id) {
        await tx`UPDATE webhook_events SET processed_at = now(), processing_error = 'M-Pesa receipt is already attached to another payment.' WHERE provider = 'MPESA' AND event_key = ${eventKey}`;
        await tx`UPDATE payment_attempts SET callback_payload = ${tx.json(serializedPayload)}, status = 'FAILED', result_code = ${String(resultCode)}, result_description = 'Receipt already used by another payment', callback_received_at = now(), completed_at = now() WHERE id = ${attempt.attempt_id} AND status = 'PENDING'`;
        await tx`UPDATE payments SET status = 'RECONCILING', updated_at = now() WHERE id = ${attempt.payment_id} AND status <> 'SUCCEEDED'`;
        await publishAdminNotification(tx, {
          eventType: "DUPLICATE_MPESA_RECEIPT",
          entityType: "payment_attempt",
          entityId: attempt.attempt_id,
          severity: "CRITICAL",
          title: "M-Pesa receipt collision",
          body: "A callback supplied a receipt already recorded against a different payment.",
          href: "/admin/transactions",
        });
        return { duplicate: false, processed: false };
      }
      const paidAt = parseMpesaDate(metadata.TransactionDate) ?? new Date();
      await settleSuccessfulPayment(tx, {
        attemptId: attempt.attempt_id,
        paymentId: attempt.payment_id,
        orderId: attempt.order_id,
        orderNumber: attempt.order_number,
        orderStatus: attempt.order_status,
        userId: attempt.user_id,
        receipt: receipt.toUpperCase(),
        payerPhone: callbackPhone ?? attempt.customer_phone,
        paidAt,
        amountMinor: attempt.amount_minor,
        source: "MPESA_CALLBACK",
        resultDescription,
        callbackPayload: serializedPayload,
      });
    } else {
      if (attempt.attempt_status !== "PENDING") {
        await tx`UPDATE webhook_events SET processed_at = now() WHERE provider = 'MPESA' AND event_key = ${eventKey}`;
        return { duplicate: true, processed: true };
      }
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

export async function reportPaymentIssue(
  input: z.infer<typeof reportPaymentIssueSchema>,
) {
  return withTransaction(async (tx) => {
    const [payment] = await tx<{
      payment_id: string;
      payment_status: string;
      order_id: string;
      order_number: string;
      order_status: string;
      order_created_at: Date;
      customer_phone: string;
      user_id: string | null;
    }[]>`
      SELECT p.id AS payment_id, p.status AS payment_status, o.id AS order_id,
             o.order_number, o.status AS order_status, o.customer_phone, o.user_id
      FROM orders o JOIN payments p ON p.order_id = o.id
      WHERE o.order_number = ${input.orderNumber}
        AND o.access_token_hash = ${hashSecret(input.accessToken)}
      FOR UPDATE OF o, p
    `;
    if (!payment) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
    if (payment.payment_status === "SUCCEEDED") {
      throw new ApiError(409, "PAYMENT_ALREADY_COMPLETE", "This order has already been paid.");
    }
    if (["REFUNDED"].includes(payment.payment_status)) {
      throw new ApiError(409, "PAYMENT_NOT_REPORTABLE", "This payment can no longer be reviewed.");
    }
    const [existing] = await tx<{ id: string; claimed_receipt: string; status: string }[]>`
      SELECT id, claimed_receipt, status::text FROM payment_investigations
      WHERE payment_id = ${payment.payment_id} AND status IN ('OPEN', 'RECONCILING', 'MATCHED')
      FOR UPDATE
    `;
    if (existing) {
      if (existing.claimed_receipt !== input.receipt) {
        throw new ApiError(409, "PAYMENT_REVIEW_ALREADY_OPEN", "A payment report is already being reviewed for this order.");
      }
      return { id: existing.id, status: existing.status, existing: true };
    }
    const [investigation] = await tx<{ id: string }[]>`
      INSERT INTO payment_investigations (payment_id, order_id, customer_user_id, claimed_receipt, status)
      VALUES (${payment.payment_id}, ${payment.order_id}, ${payment.user_id}, ${input.receipt}, 'OPEN')
      RETURNING id
    `;
    await tx`
      UPDATE payments SET status = 'RECONCILING', updated_at = now()
      WHERE id = ${payment.payment_id} AND status <> 'SUCCEEDED'
    `;
    await tx`
      INSERT INTO order_events (order_id, from_status, to_status, source, note, metadata)
      VALUES (${payment.order_id}, ${payment.order_status}, ${payment.order_status}, 'customer-payment-report',
        'Customer reported a completed M-Pesa payment that needs verification.', ${tx.json({ investigationId: investigation.id })})
    `;
    await publishAdminNotification(tx, {
      eventType: "PAYMENT_INVESTIGATION",
      entityType: "payment_investigation",
      entityId: investigation.id,
      severity: "CRITICAL",
      title: "Payment needs review",
      body: `${payment.order_number} was reported as paid but has not been confirmed.`,
      href: "/admin/transactions",
    });
    return { id: investigation.id, status: "OPEN", existing: false };
  });
}

export async function confirmPaymentInvestigation(
  investigationId: string,
  adminId: string,
  input: z.infer<typeof confirmPaymentInvestigationSchema>,
) {
  const payerPhone = normalizeKenyanPhone(input.payerPhone);
  if (input.paidAt.getTime() > Date.now() + 5 * 60_000) {
    throw new ApiError(422, "INVALID_PAYMENT_TIME", "The M-Pesa payment time cannot be in the future.");
  }
  return withTransaction(async (tx) => {
    const [record] = await tx<{
      investigation_id: string;
      investigation_status: string;
      claimed_receipt: string;
      payment_id: string;
      payment_status: string;
      amount_minor: number;
      provider_receipt: string | null;
      order_id: string;
      order_number: string;
      order_status: string;
      order_created_at: Date;
      customer_phone: string;
      user_id: string | null;
    }[]>`
      SELECT i.id AS investigation_id, i.status::text AS investigation_status, i.claimed_receipt,
             p.id AS payment_id, p.status::text AS payment_status, p.amount_minor, p.provider_receipt,
             o.id AS order_id, o.order_number, o.status::text AS order_status, o.created_at AS order_created_at, o.customer_phone, o.user_id
      FROM payment_investigations i
      JOIN payments p ON p.id = i.payment_id
      JOIN orders o ON o.id = i.order_id
      WHERE i.id = ${investigationId}
      FOR UPDATE OF i, p, o
    `;
    if (!record) throw new ApiError(404, "PAYMENT_REPORT_NOT_FOUND", "Payment report not found.");
    if (record.investigation_status === "CONFIRMED" || record.payment_status === "SUCCEEDED") {
      return { confirmed: true, orderNumber: record.order_number, existing: true };
    }
    if (["REJECTED", "CLOSED"].includes(record.investigation_status)) {
      throw new ApiError(409, "PAYMENT_REPORT_CLOSED", "This payment report is closed.");
    }
    if (record.claimed_receipt !== input.receipt) {
      throw new ApiError(422, "RECEIPT_EVIDENCE_MISMATCH", "Use the receipt code supplied in the customer report.");
    }
    if (record.amount_minor !== input.amountMinor || record.customer_phone !== payerPhone) {
      throw new ApiError(422, "PAYMENT_EVIDENCE_MISMATCH", "The recorded amount and payer phone must match the order.");
    }
    if (input.paidAt.getTime() < record.order_created_at.getTime() - 5 * 60_000) {
      throw new ApiError(422, "PAYMENT_TIME_MISMATCH", "The M-Pesa payment time must be after this order was created.");
    }
    const [receiptOwner] = await tx<{ payment_id: string }[]>`
      SELECT id AS payment_id FROM payments
      WHERE lower(provider_receipt) = lower(${input.receipt})
      FOR UPDATE
    `;
    if (receiptOwner && receiptOwner.payment_id !== record.payment_id) {
      await publishAdminNotification(tx, {
        eventType: "DUPLICATE_MPESA_RECEIPT",
        entityType: "payment_investigation",
        entityId: record.investigation_id,
        severity: "CRITICAL",
        title: "M-Pesa receipt collision",
        body: "The reported receipt is already attached to another payment.",
        href: "/admin/transactions",
      });
      throw new ApiError(409, "RECEIPT_ALREADY_USED", "This M-Pesa receipt is already attached to another payment.");
    }

    await tx`
      UPDATE payment_attempts SET status = 'CANCELLED', completed_at = now(),
        result_description = 'Payment manually confirmed after evidence review.'
      WHERE payment_id = ${record.payment_id} AND status = 'PENDING'
    `;
    const result = await settleSuccessfulPayment(tx, {
      paymentId: record.payment_id,
      orderId: record.order_id,
      orderNumber: record.order_number,
      orderStatus: record.order_status,
      userId: record.user_id,
      receipt: input.receipt,
      payerPhone,
      paidAt: input.paidAt,
      amountMinor: record.amount_minor,
      source: "ADMIN_CONFIRMATION",
      resultDescription: "Payment manually confirmed by an administrator after evidence review.",
      adminId,
      manualNote: input.note,
    });
    await tx`
      UPDATE payment_investigations
      SET status = 'CONFIRMED', reviewed_by = ${adminId}, reviewed_at = now(),
          manual_paid_at = ${input.paidAt}, resolution_note = ${input.note}, updated_at = now()
      WHERE id = ${record.investigation_id}
    `;
    await tx`
      INSERT INTO admin_activity_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES (${adminId}, 'payment.manually_confirmed', 'payment_investigation', ${record.investigation_id},
        ${tx.json({ orderNumber: record.order_number, receipt: input.receipt, amountMinor: input.amountMinor, paidAt: input.paidAt.toISOString() })})
    `;
    await resolveAdminNotification(tx, "PAYMENT_INVESTIGATION", "payment_investigation", record.investigation_id);
    return { confirmed: true, orderNumber: record.order_number, fulfilmentReview: !result.inventorySettled, existing: false };
  });
}

export async function verifyReceipt(
  input: z.infer<typeof receiptLookupSchema>,
) {
  const [payment] = await sql<
    {
      status: string;
      provider_receipt: string | null;
      paid_at: Date | null;
      amount_minor: number;
    }[]
  >`
    SELECT p.status, p.provider_receipt, p.paid_at, p.amount_minor
    FROM orders o JOIN payments p ON p.order_id = o.id
    WHERE o.order_number = ${input.orderNumber} AND o.access_token_hash = ${hashSecret(input.accessToken)}
  `;
  if (!payment) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
  if (
    payment.status !== "SUCCEEDED" ||
    payment.provider_receipt !== input.receipt
  ) {
    throw new ApiError(
      422,
      "RECEIPT_NOT_VERIFIED",
      "That code does not match a completed M-Pesa payment for this order.",
    );
  }
  return {
    verified: true,
    receipt: payment.provider_receipt,
    paidAt: payment.paid_at,
    amount: payment.amount_minor,
  };
}
