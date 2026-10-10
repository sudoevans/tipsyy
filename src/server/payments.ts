import { z } from "zod";

import {
  convertOrderReservations,
  ensureCheckoutCustomerAccount,
  releaseCouponForOrder,
  releaseOrderReservations,
  RESERVATION_MINUTES,
} from "./checkout";
import { evaluateInventoryNotifications, publishAdminNotification, resolveAdminNotification } from "./admin-notifications";
import { enqueueTelegramAlert } from "./notifications";
import { sql, type Transaction, withTransaction } from "./db";
import { ApiError } from "./http";
import {
  getMpesaAccessToken,
  initiateStkPush,
  mpesaCallbackMetadata,
  queryMpesaPullTransactions,
  queryStkPushStatus,
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

export const adminRecordPaymentSchema = z.object({
  receipt: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8,20}$/),
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

export const checkStkStatusSchema = z.object({
  orderNumber: z.string().min(4).max(40),
  accessToken: z.string().min(20).max(200),
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
  payment_receipt: string | null;
  settlement_source: string | null;
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
  if (!/^\d{14}$/.test(digits)) {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6)) - 1;
  const day = Number(digits.slice(6, 8));
  const hour = Number(digits.slice(8, 10));
  const minute = Number(digits.slice(10, 12));
  const second = Number(digits.slice(12, 14));
  return new Date(Date.UTC(year, month, day, hour - 3, minute, second));
}

interface PulledTransaction {
  receipt: string;
  amountMinor: number;
  payerPhone: string | null;
  billReference: string | null;
  paidAt: Date | null;
  raw: Record<string, unknown>;
}

function valueFrom(record: Record<string, unknown>, keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const entry = Object.entries(record).find(([key]) => wanted.has(key.toLowerCase()));
  return entry?.[1];
}

function pullRows(payload: unknown): Record<string, unknown>[] {
  let root = payload;
  if (root && typeof root === "object" && !Array.isArray(root)) {
    root = (root as Record<string, unknown>).Response ?? (root as Record<string, unknown>).Transaction ?? root;
  }
  if (typeof root === "string") {
    try { root = JSON.parse(root); } catch { return []; }
  }
  const rows: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (valueFrom(record, ["transactionId", "TransactionID", "TransID", "receipt", "Receipt"])) {
      rows.push(record);
      return;
    }
    Object.values(record).forEach(visit);
  };
  visit(root);
  return rows;
}

function normalizePulledTransactions(payload: unknown): PulledTransaction[] {
  const transactions: PulledTransaction[] = [];
  const seen = new Set<string>();
  for (const raw of pullRows(payload)) {
    const receipt = String(valueFrom(raw, ["transactionId", "TransactionID", "TransID", "receipt", "Receipt"]) ?? "").trim().toUpperCase();
    const amount = Number(valueFrom(raw, ["amount", "TransAmount", "Amount"]));
    if (!/^[A-Z0-9]{6,24}$/.test(receipt) || !Number.isFinite(amount) || amount <= 0 || seen.has(receipt)) continue;
    seen.add(receipt);
    const phoneRaw = valueFrom(raw, ["msisdn", "MSISDN", "phone", "PhoneNumber"]);
    let payerPhone: string | null = null;
    if (phoneRaw !== undefined && phoneRaw !== null) {
      try { payerPhone = normalizeKenyanPhone(String(phoneRaw)); } catch { payerPhone = null; }
    }
    const reference = valueFrom(raw, ["billreference", "BillRefNumber", "billReference", "AccountReference"]);
    const paidAt = parseMpesaDate(valueFrom(raw, ["trxDate", "TransactionDate", "TransTime", "paidAt"]));
    transactions.push({
      receipt,
      amountMinor: Math.round(amount),
      payerPhone,
      billReference: reference === undefined || reference === null ? null : String(reference).trim(),
      paidAt,
      raw,
    });
  }
  return transactions;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
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
    receipt: string | null;
    payerPhone: string;
    paidAt: Date;
    amountMinor: number;
    source: "MPESA_CALLBACK" | "C2B_CONFIRMATION" | "ADMIN_CONFIRMATION" | "PULL_RECONCILIATION" | "STK_STATUS_QUERY";
    resultDescription: string;
    callbackPayload?: unknown;
    providerPayload?: unknown;
    adminId?: string;
    manualNote?: string;
  },
) {
  const cancelledOrder = input.orderStatus === "CANCELLED" || input.orderStatus === "PAYMENT_CANCELLED";
  const activeReservations = cancelledOrder ? [{ count: 0 }] : await tx<{ count: number }[]>`
    SELECT count(*)::int AS count FROM inventory_reservations
    WHERE order_id = ${input.orderId} AND status = 'ACTIVE'
  `;
  const inventorySettled = !cancelledOrder && (
    activeReservations[0].count > 0
      ? await convertOrderReservations(tx, input.orderId).then(() => true)
      : await reacquireAndConvertLateReservation(tx, input.orderId));
  const nextOrderStatus = cancelledOrder ? input.orderStatus : inventorySettled ? "CONFIRMED" : "PAID_REQUIRES_REVIEW";
  await evaluateInventoryNotifications(tx);

  if (input.attemptId) {
    await tx`
      UPDATE payment_attempts
      SET callback_payload = COALESCE(${input.callbackPayload ? tx.json(JSON.parse(JSON.stringify(input.callbackPayload))) : null}, callback_payload),
          response_payload = COALESCE(${input.providerPayload ? tx.json(JSON.parse(JSON.stringify(input.providerPayload))) : null}, response_payload),
          status = 'SUCCEEDED', result_code = '0', result_description = ${input.resultDescription},
          callback_received_at = CASE WHEN ${input.source} IN ('MPESA_CALLBACK', 'C2B_CONFIRMATION') THEN now() ELSE callback_received_at END,
          completed_at = now()
      WHERE id = ${input.attemptId} AND status <> 'SUCCEEDED'
    `;
  }
  await tx`
    UPDATE payments
    SET status = 'SUCCEEDED', provider_receipt = ${input.receipt}, payer_phone = ${input.payerPhone},
        paid_at = ${input.paidAt}, raw_result = COALESCE(${input.providerPayload ? tx.json(JSON.parse(JSON.stringify(input.providerPayload))) : input.callbackPayload ? tx.json(JSON.parse(JSON.stringify(input.callbackPayload))) : null}, raw_result),
        settlement_source = ${input.source}, manually_confirmed_by = ${input.adminId ?? null},
        manually_confirmed_at = ${input.adminId ? new Date() : null},
        manual_confirmation_note = ${input.manualNote ?? null}, updated_at = now()
    WHERE id = ${input.paymentId} AND status <> 'SUCCEEDED'
  `;
  await tx`
    UPDATE orders
      SET status = ${nextOrderStatus}::order_status, paid_at = ${input.paidAt},
        confirmed_at = ${inventorySettled ? input.paidAt : null}, updated_at = now()
    WHERE id = ${input.orderId}
  `;
  if (nextOrderStatus !== input.orderStatus) await tx`
    INSERT INTO order_events (order_id, from_status, to_status, actor_user_id, source, note, metadata)
      VALUES (${input.orderId}, ${input.orderStatus}::order_status, ${nextOrderStatus}::order_status, ${input.adminId ?? null},
      ${input.source === "ADMIN_CONFIRMATION" ? "admin-payment-confirmation" : input.source === "PULL_RECONCILIATION" ? "mpesa-pull-reconciliation" : input.source === "STK_STATUS_QUERY" ? "mpesa-stk-status-query" : "mpesa-callback"},
      ${input.resultDescription}, ${tx.json({ receipt: input.receipt, settlementSource: input.source })})
  `;
  await tx`
    INSERT INTO notifications (user_id, order_id, channel, event_type, destination, subject, body)
    VALUES (${input.userId}, ${input.orderId}, 'SMS', 'PAYMENT_SUCCESSFUL', ${input.payerPhone}, 'Payment received',
      ${input.receipt ? `M-Pesa payment ${input.receipt} was received.` : "M-Pesa confirmed your payment. Your order is being updated."})
  `;
  await enqueueTelegramAlert(tx, {
    eventType: "ORDER_PAID",
    entityType: "order",
    entityId: input.orderId,
    title: `Payment received · ${input.orderNumber}`,
    body: `${input.orderNumber} payment confirmed for KSh ${input.amountMinor.toLocaleString("en-KE")}.`,
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
      title: cancelledOrder ? "Payment received for cancelled order" : "Paid order needs fulfilment review",
      body: cancelledOrder
        ? `${input.orderNumber} was paid after cancellation. Review the payment and refund; the order will not be reopened.`
        : `${input.orderNumber} was paid, but its items are no longer available to fulfil automatically.`,
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
          initiated_at = now(),
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

export async function checkPendingStkStatus(
  input: z.infer<typeof checkStkStatusSchema>,
) {
  const [attempt] = await sql<
    {
      attempt_id: string;
      attempt_status: string;
      checkout_request_id: string | null;
      callback_received_at: Date | null;
      initiated_at: Date;
      payment_id: string;
      payment_status: string;
      order_id: string;
      order_number: string;
    }[]
  >`
      SELECT pa.id AS attempt_id, pa.status AS attempt_status, pa.checkout_request_id,
           pa.callback_received_at, pa.initiated_at, p.id AS payment_id, p.status AS payment_status,
           o.id AS order_id, o.order_number
    FROM orders o
    JOIN payments p ON p.order_id = o.id
    JOIN LATERAL (
      SELECT id, status, checkout_request_id, initiated_at
      FROM payment_attempts
      WHERE payment_id = p.id
      ORDER BY initiated_at DESC
      LIMIT 1
    ) pa ON true
    WHERE o.order_number = ${input.orderNumber}
      AND o.access_token_hash = ${hashSecret(input.accessToken)}
  `;
  if (!attempt) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
  if (attempt.payment_status !== "PENDING" || attempt.attempt_status !== "PENDING") {
    return { status: attempt.payment_status };
  }
  // A callback is authoritative. Never issue an STK status query once it has
  // arrived, even if another part of callback processing is still underway.
  if (attempt.callback_received_at) {
    return { status: attempt.payment_status, retryAfterMs: 5_000 };
  }
  if (!attempt.checkout_request_id) {
    return { status: "PENDING" as const, retryAfterMs: 5_000 };
  }

  const queryAt = Date.now();
  const initiatedAt = new Date(attempt.initiated_at).getTime();
  if (queryAt - initiatedAt < 30_000) {
    return {
      status: "PENDING" as const,
      retryAfterMs: Math.max(1_000, 30_000 - (queryAt - initiatedAt)),
    };
  }

  const provider = await queryStkPushStatus(attempt.checkout_request_id);
  const rawResultCode = provider.response.ResultCode;
  const resultCode =
    rawResultCode === undefined || rawResultCode === null || rawResultCode === ""
      ? null
      : Number(rawResultCode);
  const resultDescription =
    provider.response.ResultDesc ??
    provider.response.ResponseDescription ??
    "M-Pesa has not returned a final payment result yet.";
  const queryPayload = {
    ...provider.response,
    checkedAt: new Date().toISOString(),
  };

  if (provider.response.CheckoutRequestID && provider.response.CheckoutRequestID !== attempt.checkout_request_id) {
    throw new ApiError(502, "MPESA_STATUS_REFERENCE_MISMATCH", "Safaricom returned a different checkout reference; the order was left unchanged.");
  }

  return withTransaction(async (tx) => {
    const [current] = await tx<
      {
        attempt_status: string;
        checkout_request_id: string | null;
        payment_id: string;
        payment_status: string;
        order_id: string;
        order_number: string;
        order_status: string;
        amount_minor: number;
        customer_phone: string;
        user_id: string | null;
      }[]
    >`
      SELECT pa.status AS attempt_status, pa.checkout_request_id,
             p.id AS payment_id, p.status AS payment_status, o.id AS order_id,
             o.order_number, o.status AS order_status, p.amount_minor,
             o.customer_phone, o.user_id
      FROM payment_attempts pa
      JOIN payments p ON p.id = pa.payment_id
      JOIN orders o ON o.id = p.order_id
      WHERE pa.id = ${attempt.attempt_id}
      FOR UPDATE OF pa, p, o
    `;
    if (!current) throw new ApiError(404, "PAYMENT_ATTEMPT_NOT_FOUND", "Payment attempt not found.");
    await tx`
      UPDATE payment_attempts
      SET response_payload = COALESCE(response_payload, '{}'::jsonb) || ${tx.json({ statusQuery: queryPayload })}
      WHERE id = ${attempt.attempt_id}
    `;
    if (
      current.payment_status !== "PENDING" ||
      current.attempt_status !== "PENDING" ||
      current.checkout_request_id !== attempt.checkout_request_id
    ) {
      return { status: current.payment_status };
    }
    if (resultCode === null || !Number.isFinite(resultCode)) {
      return { status: "PENDING" as const, retryAfterMs: 15_000 };
    }
    // Daraja can accept the status-query request without returning a final
    // result yet. That is not a failed customer payment; keep the order pending.
    if (
      (provider.response.ResponseCode !== undefined &&
        provider.response.ResponseCode !== "0") ||
      resultCode === 499 ||
      resultCode === 4999
    ) {
      return { status: "PENDING" as const, retryAfterMs: 15_000 };
    }
    if (resultCode === 0) {
      const note = "Safaricom confirmed this STK payment by CheckoutRequestID; the receipt callback is still pending.";
      await settleSuccessfulPayment(tx, {
        attemptId: attempt.attempt_id,
        paymentId: current.payment_id,
        orderId: current.order_id,
        orderNumber: current.order_number,
        orderStatus: current.order_status,
        userId: current.user_id,
        receipt: null,
        payerPhone: current.customer_phone,
        paidAt: new Date(),
        amountMinor: current.amount_minor,
        source: "STK_STATUS_QUERY",
        resultDescription: note,
        providerPayload: queryPayload,
      });
      await publishAdminNotification(tx, {
        eventType: "MPESA_QUERY_CONFIRMED_WITHOUT_CALLBACK",
        entityType: "payment_attempt",
        entityId: attempt.attempt_id,
        severity: "WARNING",
        title: "Payment confirmed; receipt callback pending",
        body: `${current.order_number} is paid and inventory has been settled. Pull reconciliation can attach the M-Pesa receipt when available.`,
        href: "/admin/transactions",
      });
      return { status: "SUCCEEDED" as const };
    }

    const resultStatus = callbackPaymentStatus(resultCode);
    const orderStatus = failureOrderStatus(resultCode);
    await releaseOrderReservations(tx, current.order_id);
    await releaseCouponForOrder(tx, current.order_id);
    await tx`
      UPDATE payment_attempts
      SET status = ${resultStatus}::payment_status, result_code = ${String(resultCode)},
          result_description = ${resultDescription}, completed_at = now()
      WHERE id = ${attempt.attempt_id} AND status = 'PENDING'
    `;
    await tx`
      UPDATE payments SET status = ${resultStatus}::payment_status, raw_result = ${tx.json(queryPayload)}, updated_at = now()
      WHERE id = ${current.payment_id} AND status = 'PENDING'
    `;
    await tx`
      UPDATE orders SET status = ${orderStatus}::order_status, cancelled_at = now(), updated_at = now()
      WHERE id = ${current.order_id} AND status = 'PENDING_PAYMENT'
    `;
    await tx`
      INSERT INTO order_events (order_id, from_status, to_status, source, note, metadata)
      VALUES (${current.order_id}, ${current.order_status}, ${orderStatus}, 'mpesa-stk-query', ${resultDescription}, ${tx.json({ resultCode })})
    `;
    await tx`
      INSERT INTO notifications (user_id, order_id, channel, event_type, destination, subject, body)
      VALUES (${current.user_id}, ${current.order_id}, 'SMS', 'PAYMENT_FAILED', ${current.customer_phone}, 'Payment not completed', ${resultDescription})
    `;
    return { status: resultStatus };
  });
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
        SET status = ${input.reason}::payment_status, completed_at = now(), result_description = ${note}
        WHERE payment_id = ${payment.payment_id} AND status = 'PENDING'
      `;
      await tx`UPDATE payments SET status = ${input.reason}::payment_status, updated_at = now() WHERE id = ${payment.payment_id}`;
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
  // Hash the canonical payload into the event key. Identical retries collapse
  // idempotently, while a distinct callback for the same CheckoutRequestID is
  // retained and reviewed instead of being silently discarded.
  const eventKey = `${checkoutRequestId}:${hashSecret(canonicalJson(serializedPayload))}`;
  await sql`
    INSERT INTO webhook_events (provider, event_key, payload)
    VALUES ('MPESA', ${eventKey}, ${sql.json(serializedPayload)})
    ON CONFLICT (provider, event_key) DO NOTHING
  `;
  return withTransaction(async (tx) => {
    const [event] = await tx<{ id: string; processed_at: Date | null }[]>`
      SELECT id, processed_at FROM webhook_events
      WHERE provider = 'MPESA' AND event_key = ${eventKey}
      FOR UPDATE
    `;
    if (!event) throw new ApiError(500, "MPESA_CALLBACK_NOT_STORED", "The M-Pesa callback could not be durably recorded.");
    if (event.processed_at) return { duplicate: true, processed: true };
    await tx`UPDATE webhook_events SET delivery_attempts = delivery_attempts + 1, last_attempt_at = now() WHERE id = ${event.id}`;

    // Capture a successful money-in event before looking up its order. A late,
    // orphaned, or unknown CheckoutRequestID must still create a receipt row.
    let callbackReceipt = "";
    let callbackAmount = 0;
    let callbackPhone: string | null = null;
    let callbackPaidAt: Date | null = null;
    if (resultCode === 0) {
      const metadata = mpesaCallbackMetadata(payload);
      callbackReceipt = typeof metadata.MpesaReceiptNumber === "string" ? metadata.MpesaReceiptNumber.trim().toUpperCase() : "";
      callbackAmount = Number(metadata.Amount);
      try { callbackPhone = normalizeKenyanPhone(String(metadata.PhoneNumber ?? "")); } catch { callbackPhone = null; }
      callbackPaidAt = parseMpesaDate(metadata.TransactionDate);
      if (callbackReceipt && Number.isFinite(callbackAmount) && callbackAmount > 0) {
        await tx`
          INSERT INTO mpesa_receipts (receipt, source, amount_minor, payer_phone, paid_at, status, payload)
          VALUES (${callbackReceipt}, 'STK_CALLBACK', ${Math.round(callbackAmount)}, ${callbackPhone}, ${callbackPaidAt}, 'UNMATCHED', ${tx.json(serializedPayload)})
          ON CONFLICT (receipt) DO NOTHING
        `;
      }
    }

    const attempts = await tx<CallbackAttempt[]>`
      SELECT pa.id AS attempt_id, pa.status AS attempt_status, pa.merchant_request_id,
             p.id AS payment_id, p.status AS payment_status, p.provider_receipt AS payment_receipt,
             p.settlement_source,
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
      // An STK query can confirm payment before Safaricom delivers the receipt
      // callback. Attach that later receipt without settling stock or notifying
      // the customer a second time.
      if (attempt.settlement_source === "STK_STATUS_QUERY" && resultCode === 0 && callbackReceipt) {
        const detailsMatch = callbackAmount === attempt.amount_minor && callbackPhone === attempt.customer_phone;
        const [receiptOwner] = await tx<{ payment_id: string }[]>`
          SELECT id AS payment_id FROM payments WHERE lower(provider_receipt) = lower(${callbackReceipt}) FOR UPDATE
        `;
        const [receiptLedgerOwner] = await tx<{ payment_id: string | null }[]>`
          SELECT payment_id FROM mpesa_receipts WHERE lower(receipt)=lower(${callbackReceipt}) FOR UPDATE
        `;
        const receiptConflict = (receiptOwner && receiptOwner.payment_id !== attempt.payment_id)
          || (receiptLedgerOwner?.payment_id && receiptLedgerOwner.payment_id !== attempt.payment_id);
        if (detailsMatch && !receiptConflict) {
          const paidAt = callbackPaidAt ?? new Date();
          await tx`
            UPDATE mpesa_receipts SET amount_minor=${attempt.amount_minor}, payer_phone=${callbackPhone},
              bill_reference=${attempt.order_number}, paid_at=${paidAt}, payment_id=${attempt.payment_id},
              order_id=${attempt.order_id}, status='MATCHED', updated_at=now()
            WHERE lower(receipt)=lower(${callbackReceipt})
          `;
          await tx`
            UPDATE payments SET provider_receipt=COALESCE(provider_receipt, ${callbackReceipt}),
              payer_phone=${callbackPhone}, paid_at=COALESCE(paid_at, ${paidAt}), updated_at=now()
            WHERE id=${attempt.payment_id}
          `;
          await tx`
            UPDATE payment_attempts SET callback_payload=${tx.json(serializedPayload)}, callback_received_at=now(),
              result_description=${resultDescription}, completed_at=COALESCE(completed_at, now())
            WHERE id=${attempt.attempt_id}
          `;
        } else {
          await tx`
            UPDATE mpesa_receipts SET payer_phone=${callbackPhone}, bill_reference=${attempt.order_number},
              paid_at=${callbackPaidAt}, payment_id=${receiptConflict ? null : attempt.payment_id},
              order_id=${receiptConflict ? null : attempt.order_id}, status='REVIEW', updated_at=now()
            WHERE lower(receipt)=lower(${callbackReceipt})
          `;
          await publishAdminNotification(tx, {
            eventType: "STK_RECEIPT_AFTER_QUERY_MISMATCH", entityType: "payment_attempt", entityId: attempt.attempt_id,
            severity: "CRITICAL", title: "Late STK receipt needs review",
            body: `A receipt arrived after ${attempt.order_number} was settled from a status query, but its details did not safely match or the receipt is already linked elsewhere.`,
            href: "/admin/transactions",
          });
        }
      }
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
        if (receipt) await tx`UPDATE mpesa_receipts SET payer_phone=${callbackPhone}, bill_reference=${attempt.order_number}, paid_at=${parseMpesaDate(metadata.TransactionDate)}, payment_id=${attempt.payment_id}, order_id=${attempt.order_id}, status='REVIEW', updated_at=now() WHERE lower(receipt)=lower(${receipt})`;
        await tx`
          UPDATE webhook_events SET processed_at = now(), processing_error = 'Callback payment details did not match the order.'
          WHERE provider = 'MPESA' AND event_key = ${eventKey}
        `;
        await tx`UPDATE payment_attempts SET callback_payload = ${tx.json(serializedPayload)}, status = 'RECONCILING', result_code = ${String(resultCode)}, result_description = 'Callback verification failed; receipt retained for reconciliation', callback_received_at = now(), completed_at = now() WHERE id = ${attempt.attempt_id} AND status = 'PENDING'`;
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
        await tx`UPDATE mpesa_receipts SET payer_phone=${callbackPhone}, bill_reference=${attempt.order_number}, paid_at=${parseMpesaDate(metadata.TransactionDate)}, status='REVIEW', updated_at=now() WHERE lower(receipt)=lower(${receipt})`;
        await tx`UPDATE webhook_events SET processed_at = now(), processing_error = 'M-Pesa receipt is already attached to another payment.' WHERE provider = 'MPESA' AND event_key = ${eventKey}`;
        await tx`UPDATE payment_attempts SET callback_payload = ${tx.json(serializedPayload)}, status = 'RECONCILING', result_code = ${String(resultCode)}, result_description = 'Receipt already used by another payment; retained for review', callback_received_at = now(), completed_at = now() WHERE id = ${attempt.attempt_id} AND status = 'PENDING'`;
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
      await tx`UPDATE mpesa_receipts SET amount_minor=${attempt.amount_minor}, payer_phone=${callbackPhone}, bill_reference=${attempt.order_number}, paid_at=${paidAt}, payment_id=${attempt.payment_id}, order_id=${attempt.order_id}, status='MATCHED', updated_at=now() WHERE lower(receipt)=lower(${receipt})`;
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
          result_code = ${String(resultCode)}, result_description = ${resultDescription},
          callback_received_at = now(), completed_at = now()
        WHERE id = ${attempt.attempt_id}
      `;
      await tx`UPDATE payments SET status = ${resultStatus}::payment_status, raw_result = ${tx.json(serializedPayload)}, updated_at = now() WHERE id = ${attempt.payment_id}`;
      await tx`UPDATE orders SET status = ${orderStatus}::order_status, cancelled_at = now(), updated_at = now() WHERE id = ${attempt.order_id}`;
      await tx`
        INSERT INTO order_events (order_id, from_status, to_status, source, note, metadata)
        VALUES (${attempt.order_id}, ${attempt.order_status}::order_status, ${orderStatus}::order_status, 'mpesa-callback', ${resultDescription}, ${tx.json({ resultCode })})
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

export interface MpesaC2BConfirmation {
  TransID?: string;
  TransTime?: string;
  TransAmount?: string | number;
  BusinessShortCode?: string;
  BillRefNumber?: string;
  MSISDN?: string | number;
  OrgAccountBalance?: string;
}

/** Persist every successful Paybill confirmation, even when no order matches. */
export async function processMpesaC2BConfirmation(payload: MpesaC2BConfirmation) {
  const receipt = String(payload.TransID ?? "").trim().toUpperCase();
  const amount = Number(payload.TransAmount);
  if (!receipt || !Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "INVALID_MPESA_C2B_CONFIRMATION", "The confirmation is missing a receipt or valid amount.");
  }
  const amountMinor = Math.round(amount);
  const billReference = String(payload.BillRefNumber ?? "").trim();
  let payerPhone: string | null = null;
  try { payerPhone = normalizeKenyanPhone(String(payload.MSISDN ?? "")); } catch { /* retain the receipt for review */ }
  const paidAt = parseMpesaDate(payload.TransTime) ?? new Date();
  const serializedPayload = JSON.parse(JSON.stringify(payload));
  const eventKey = `C2B:${receipt}:${hashSecret(canonicalJson(serializedPayload))}`;
  await sql`
    INSERT INTO webhook_events (provider, event_key, payload)
    VALUES ('MPESA', ${eventKey}, ${sql.json(serializedPayload)})
    ON CONFLICT (provider, event_key) DO NOTHING
  `;

  return withTransaction(async (tx) => {
    const [event] = await tx<{ id: string; processed_at: Date | null }[]>`
      SELECT id, processed_at FROM webhook_events
      WHERE provider = 'MPESA' AND event_key = ${eventKey}
      FOR UPDATE
    `;
    if (!event) throw new ApiError(500, "MPESA_CONFIRMATION_NOT_STORED", "The Paybill confirmation could not be durably recorded.");
    if (event.processed_at) return { duplicate: true, matched: false };
    await tx`UPDATE webhook_events SET delivery_attempts = delivery_attempts + 1, last_attempt_at = now() WHERE id = ${event.id}`;
    const inserted = await tx<{ id: string }[]>`
      INSERT INTO mpesa_receipts (receipt, source, amount_minor, payer_phone, bill_reference, paid_at, status, payload)
      VALUES (${receipt}, 'C2B_CONFIRMATION', ${amountMinor}, ${payerPhone}, ${billReference || null}, ${paidAt}, 'UNMATCHED', ${tx.json(serializedPayload)})
      ON CONFLICT (receipt) DO NOTHING
      RETURNING id
    `;
    if (!inserted.length) {
      const [existing] = await tx<{ payload: unknown }[]>`SELECT payload FROM mpesa_receipts WHERE lower(receipt) = lower(${receipt})`;
      const conflict = canonicalJson(existing?.payload) !== canonicalJson(serializedPayload);
      if (conflict) {
        await tx`UPDATE mpesa_receipts SET status = 'REVIEW', updated_at = now() WHERE lower(receipt) = lower(${receipt})`;
        await tx`UPDATE webhook_events SET processing_error = 'Same Paybill receipt arrived with different transaction details.', processed_at = now() WHERE provider='MPESA' AND event_key=${eventKey}`;
        await publishAdminNotification(tx, {
          eventType: "MPESA_RECEIPT_CONFLICT", entityType: "mpesa_receipt", entityId: receipt,
          severity: "CRITICAL", title: "Conflicting Paybill receipt details",
          body: `Receipt ${receipt} was delivered with different transaction details; the original receipt is retained for review.`,
          href: "/admin/transactions",
        });
      } else {
        await tx`UPDATE webhook_events SET processed_at = now() WHERE provider='MPESA' AND event_key=${eventKey}`;
      }
      return { duplicate: true, matched: false, conflict };
    }

    const [match] = billReference ? await tx<{
      payment_id: string; payment_status: string; order_id: string; order_number: string;
      order_status: string; amount_minor: number; customer_phone: string; user_id: string | null;
    }[]>`
      SELECT p.id AS payment_id, p.status::text AS payment_status, o.id AS order_id,
             o.order_number, o.status::text AS order_status, p.amount_minor,
             o.customer_phone, o.user_id
      FROM orders o JOIN payments p ON p.order_id = o.id
      WHERE o.order_number = ${billReference}
      FOR UPDATE OF p, o
    ` : [];
    const configuredShortcode = process.env.MPESA_SHORTCODE;
    const shortcodeMatches = !payload.BusinessShortCode || payload.BusinessShortCode === configuredShortcode;
    const isMatch = Boolean(shortcodeMatches && match && match.payment_status !== "SUCCEEDED" && match.amount_minor === amountMinor && match.customer_phone === payerPhone);
    if (isMatch && match) {
      await tx`UPDATE mpesa_receipts SET payment_id = ${match.payment_id}, order_id = ${match.order_id}, status = 'MATCHED', updated_at = now() WHERE id = ${inserted[0].id}`;
      await settleSuccessfulPayment(tx, {
        paymentId: match.payment_id, orderId: match.order_id, orderNumber: match.order_number,
        orderStatus: match.order_status, userId: match.user_id, receipt, payerPhone: payerPhone!,
        paidAt, amountMinor, source: "C2B_CONFIRMATION", resultDescription: "M-Pesa Paybill confirmation received.",
        callbackPayload: serializedPayload,
      });
    } else {
      await tx`UPDATE mpesa_receipts SET payment_id = ${match?.payment_id ?? null}, order_id = ${match?.order_id ?? null}, status = 'REVIEW', updated_at = now() WHERE id = ${inserted[0].id}`;
      await publishAdminNotification(tx, {
        eventType: "UNMATCHED_MPESA_RECEIPT", entityType: "mpesa_receipt", entityId: receipt,
        severity: "CRITICAL", title: "Paybill payment needs matching",
        body: `M-Pesa confirmed ${receipt} for KSh ${amount.toLocaleString("en-KE")}; it was saved but could not safely match an order.`,
        href: "/admin/transactions",
      });
    }
    await tx`UPDATE webhook_events SET processed_at = now() WHERE provider='MPESA' AND event_key=${eventKey}`;
    return { duplicate: false, matched: isMatch };
  });
}

/** Reconcile stored STK requests without depending on a customer's open page. */
export async function reconcilePendingStkAttempts(limit = 5) {
  const attempts = await sql<{ attempt_id: string; checkout_request_id: string; order_number: string }[]>`
    SELECT pa.id AS attempt_id, pa.checkout_request_id, o.order_number
    FROM payment_attempts pa
    JOIN payments p ON p.id = pa.payment_id
    JOIN orders o ON o.id = p.order_id
    WHERE pa.status = 'PENDING' AND p.status = 'PENDING'
      AND pa.checkout_request_id IS NOT NULL
      AND pa.initiated_at <= now() - interval '30 seconds'
      AND COALESCE((pa.response_payload->'statusQuery'->>'checkedAt')::timestamptz, '-infinity'::timestamptz) < now() - interval '2 minutes'
    ORDER BY pa.initiated_at ASC
    LIMIT ${Math.max(1, Math.min(limit, 10))}
  `;
  let checked = 0;
  for (const attempt of attempts) {
    try {
      await queryAndRecordStkStatus(attempt.attempt_id, attempt.checkout_request_id, attempt.order_number);
      checked += 1;
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event: "mpesa.stk.reconciliation_failed", attemptId: attempt.attempt_id, errorName: error instanceof Error ? error.name : typeof error }));
    }
  }
  return { checked };
}

/** Retry callback business processing after a durable webhook insert survived an error. */
export async function retryUnprocessedMpesaCallbacks(limit = 10) {
  const pending = await sql<{ event_key: string; payload: unknown }[]>`
    SELECT event_key, payload FROM webhook_events
    WHERE provider = 'MPESA' AND processed_at IS NULL
      AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      AND delivery_attempts < 12
    ORDER BY created_at ASC
    LIMIT ${Math.max(1, Math.min(limit, 25))}
  `;
  let processed = 0;
  for (const event of pending) {
    try {
      const payload = event.payload as Record<string, unknown>;
      if (event.event_key.startsWith("C2B:")) {
        await processMpesaC2BConfirmation(payload as MpesaC2BConfirmation);
      } else {
        await processMpesaCallback(payload as StkCallbackPayload);
      }
      processed += 1;
    } catch (error) {
      await sql`
        UPDATE webhook_events
        SET delivery_attempts = delivery_attempts + 1,
            last_attempt_at = now(),
            next_attempt_at = now() + make_interval(secs => LEAST(900, 30 * power(2, LEAST(delivery_attempts, 5))::int)),
            processing_error = 'Callback processing retry failed.'
        WHERE provider = 'MPESA' AND event_key = ${event.event_key} AND processed_at IS NULL
      `;
      console.error(JSON.stringify({ level: "error", event: "mpesa.webhook_retry_failed", eventKey: hashSecret(event.event_key).slice(0, 12), errorName: error instanceof Error ? error.name : typeof error }));
    }
  }
  return { processed, pending: pending.length };
}

export async function checkStkStatusForAdmin(orderNumber: string) {
  const [attempt] = await sql<{ attempt_id: string; checkout_request_id: string | null; attempt_status: string; payment_status: string; initiated_at: Date }[]>`
    SELECT pa.id AS attempt_id, pa.checkout_request_id, pa.status::text AS attempt_status,
           p.status::text AS payment_status, pa.initiated_at
    FROM orders o JOIN payments p ON p.order_id = o.id
    JOIN LATERAL (SELECT * FROM payment_attempts WHERE payment_id = p.id ORDER BY initiated_at DESC, id DESC LIMIT 1) pa ON true
    WHERE o.order_number = ${orderNumber}
  `;
  if (!attempt) throw new ApiError(404, "PAYMENT_ATTEMPT_NOT_FOUND", "No M-Pesa attempt exists for this order.");
  if (attempt.payment_status === "REFUNDED") throw new ApiError(409, "PAYMENT_ALREADY_REFUNDED", "A refunded payment cannot be reconciled as a new payment.");
  if (!attempt.checkout_request_id) throw new ApiError(409, "MPESA_REQUEST_NOT_ACCEPTED", "Safaricom did not return a CheckoutRequestID for this attempt.");
  if (Date.now() - new Date(attempt.initiated_at).getTime() < 30_000) {
    throw new ApiError(409, "MPESA_STATUS_TOO_EARLY", "Status checks are available 30 seconds after the STK prompt was accepted.");
  }
  return queryAndRecordStkStatus(attempt.attempt_id, attempt.checkout_request_id, orderNumber);
}

/** Pulls the Paybill ledger around this order's saved STK attempts and only auto-settles an exact, unique order-reference match. */
export async function pullAndReconcileOrder(orderNumber: string, adminId: string) {
  const [order] = await sql<{
    payment_id: string; payment_status: string; provider_receipt: string | null; amount_minor: number;
    order_id: string; order_number: string; order_status: string; order_created_at: Date;
    customer_phone: string; user_id: string | null;
  }[]>`
    SELECT p.id AS payment_id, p.status::text AS payment_status, p.provider_receipt, p.amount_minor,
           o.id AS order_id, o.order_number, o.status::text AS order_status, o.created_at AS order_created_at,
           o.customer_phone, o.user_id
    FROM orders o JOIN payments p ON p.order_id=o.id
    WHERE o.order_number=${orderNumber}
  `;
  if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
  if (order.provider_receipt) return { status: "RECEIPT_ALREADY_LINKED", orderNumber, receipt: order.provider_receipt };

  const attempts = await sql<{ id: string; initiated_at: Date; checkout_request_id: string | null; merchant_request_id: string | null }[]>`
    SELECT id, initiated_at, checkout_request_id, merchant_request_id
    FROM payment_attempts WHERE payment_id=${order.payment_id}
    ORDER BY initiated_at ASC, id ASC
  `;
  const startedAt = attempts[0]?.initiated_at ?? order.order_created_at;
  const now = new Date();
  const oldestAllowed = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  if (startedAt < oldestAllowed) {
    throw new ApiError(409, "MPESA_PULL_WINDOW_EXPIRED", "M-Pesa Pull Transactions can only search the recent 48-hour window. Use the statement/receipt review flow for this older order.");
  }
  const startDate = new Date(Math.max(startedAt.getTime() - 5 * 60_000, oldestAllowed.getTime()));
  // The order's M-Pesa attempt is the anchor: include a short pre-window for
  // clock skew and up to 30 minutes after the latest prompt, rather than
  // pulling unrelated account history for the entire time until an admin clicks.
  const latestAttemptAt = attempts.at(-1)?.initiated_at ?? order.order_created_at;
  const endDate = new Date(Math.min(now.getTime(), latestAttemptAt.getTime() + 30 * 60_000));
  const pageSize = 100;
  // Keep the admin request within Worker limits. If the order's window is very
  // busy, leave it unchanged and require another review path instead of timing
  // out a live request or settling from a partial ledger page.
  const maxPages = 3;
  const pulled: PulledTransaction[] = [];
  const accessToken = await getMpesaAccessToken();
  let pages = 0;
  let complete = false;
  for (let offset = 0; pages < maxPages; offset += pageSize) {
    const result = await queryMpesaPullTransactions({ startDate, endDate, offset, accessToken });
    pages += 1;
    const pageRows = normalizePulledTransactions(result.response);
    pulled.push(...pageRows);
    if (pageRows.length < pageSize || String(result.response.ResponseCode ?? "") === "1001") {
      complete = true;
      break;
    }
  }
  const unique = [...new Map(pulled.map((transaction) => [transaction.receipt, transaction])).values()];
  if (!complete) {
    await sql`
      INSERT INTO admin_activity_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES (${adminId}, 'payment.pull_reconciliation_incomplete', 'order', ${order.order_id}, ${sql.json({ orderNumber, pageCount: pages, resultCount: unique.length, startDate: startDate.toISOString(), endDate: endDate.toISOString() })})
    `;
    return { status: "SEARCH_INCOMPLETE", orderNumber, checkedCount: unique.length, pages };
  }

  const normalizedOrderNumber = order.order_number.trim().toUpperCase();
  const referenceMatches = unique.filter((transaction) => transaction.billReference?.trim().toUpperCase() === normalizedOrderNumber);
  const validMatches = referenceMatches.filter((transaction) => {
    const payerMatches = !transaction.payerPhone || transaction.payerPhone === order.customer_phone;
    const timeMatches = !transaction.paidAt || transaction.paidAt.getTime() >= startedAt.getTime() - 5 * 60_000;
    return transaction.amountMinor === order.amount_minor && payerMatches && timeMatches;
  });
  const selected = validMatches.length === 1 ? validMatches[0] : null;
  const plausibleMatches = unique.filter((transaction) => {
    const payerMatches = !transaction.payerPhone || transaction.payerPhone === order.customer_phone;
    const timeMatches = !transaction.paidAt || transaction.paidAt.getTime() >= startedAt.getTime() - 5 * 60_000;
    return transaction.amountMinor === order.amount_minor && payerMatches && timeMatches;
  });
  const related = selected ? [selected] : referenceMatches.length ? referenceMatches : plausibleMatches;
  const chosenAttempt = selected?.paidAt
    ? [...attempts].reverse().find((attempt) => attempt.initiated_at.getTime() <= selected.paidAt!.getTime() + 5 * 60_000)
    : attempts.at(-1);

  return withTransaction(async (tx) => {
    const [current] = await tx<{
      payment_id: string; payment_status: string; provider_receipt: string | null; amount_minor: number;
      order_id: string; order_number: string; order_status: string; customer_phone: string; user_id: string | null;
    }[]>`
      SELECT p.id AS payment_id, p.status::text AS payment_status, p.provider_receipt, p.amount_minor,
             o.id AS order_id, o.order_number, o.status::text AS order_status, o.customer_phone, o.user_id
      FROM orders o JOIN payments p ON p.order_id=o.id
      WHERE o.order_number=${orderNumber} FOR UPDATE OF p,o
    `;
    if (!current) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
    if (current.payment_status === "REFUNDED") {
      await tx`
        INSERT INTO admin_activity_logs (actor_user_id, action, entity_type, entity_id, metadata)
        VALUES (${adminId}, 'payment.pull_reconciliation_refunded_review', 'order', ${current.order_id}, ${tx.json({ orderNumber, resultCount: unique.length, startDate: startDate.toISOString(), endDate: endDate.toISOString() })})
      `;
      return { status: "REVIEW_REQUIRED", orderNumber, checkedCount: unique.length, candidateCount: referenceMatches.length, reason: "PAYMENT_REFUNDED" };
    }
    if (current.payment_status === "SUCCEEDED" && current.provider_receipt) {
      return { status: "RECEIPT_ALREADY_LINKED", orderNumber, receipt: current.provider_receipt };
    }

    if (selected) {
      const [receiptOwner] = await tx<{ payment_id: string | null; order_id: string | null; status: string }[]>`
        SELECT payment_id, order_id, status FROM mpesa_receipts WHERE lower(receipt)=lower(${selected.receipt}) FOR UPDATE
      `;
      const [paymentOwner] = await tx<{ payment_id: string }[]>`
        SELECT id AS payment_id FROM payments WHERE lower(provider_receipt)=lower(${selected.receipt}) FOR UPDATE
      `;
      const alreadySame = receiptOwner?.payment_id === current.payment_id || paymentOwner?.payment_id === current.payment_id;
      const existingUnlinked = Boolean(receiptOwner && !receiptOwner.payment_id);
      const collision = (receiptOwner?.payment_id && receiptOwner.payment_id !== current.payment_id)
        || (paymentOwner?.payment_id && paymentOwner.payment_id !== current.payment_id)
        || (current.provider_receipt && current.provider_receipt.toUpperCase() !== selected.receipt);
      if (collision) {
        if (receiptOwner) await tx`UPDATE mpesa_receipts SET status='REVIEW', updated_at=now() WHERE lower(receipt)=lower(${selected.receipt})`;
        else await tx`
          INSERT INTO mpesa_receipts (receipt, source, amount_minor, payer_phone, bill_reference, paid_at, status, payload)
          VALUES (${selected.receipt}, 'PULL_QUERY', ${selected.amountMinor}, ${selected.payerPhone}, ${selected.billReference}, ${selected.paidAt}, 'REVIEW', ${tx.json(JSON.parse(JSON.stringify(selected.raw)))})
          ON CONFLICT (receipt) DO NOTHING
        `;
        await publishAdminNotification(tx, {
          eventType: "DUPLICATE_MPESA_RECEIPT", entityType: "mpesa_receipt", entityId: selected.receipt,
          severity: "CRITICAL", title: "Pulled M-Pesa receipt is already linked",
          body: `Receipt ${selected.receipt} matched ${orderNumber} details but is linked to a different payment. It was not reassigned.`, href: "/admin/transactions",
        });
        await tx`
          INSERT INTO admin_activity_logs (actor_user_id, action, entity_type, entity_id, metadata)
          VALUES (${adminId}, 'payment.pull_reconciliation_conflict', 'order', ${current.order_id}, ${tx.json({ orderNumber, receipt: selected.receipt, startDate: startDate.toISOString(), endDate: endDate.toISOString() })})
        `;
        return { status: "REVIEW_REQUIRED", orderNumber, candidateCount: referenceMatches.length };
      }

      if ((alreadySame || existingUnlinked) && current.payment_status === "SUCCEEDED") {
        await tx`UPDATE payments SET provider_receipt=COALESCE(provider_receipt, ${selected.receipt}), updated_at=now() WHERE id=${current.payment_id}`;
        await tx`UPDATE mpesa_receipts SET payment_id=${current.payment_id}, order_id=${current.order_id}, status='MATCHED', updated_at=now() WHERE lower(receipt)=lower(${selected.receipt})`;
        await tx`
          INSERT INTO admin_activity_logs (actor_user_id, action, entity_type, entity_id, metadata)
          VALUES (${adminId}, 'payment.pull_receipt_attached', 'order', ${current.order_id}, ${tx.json({ orderNumber, receipt: selected.receipt, startDate: startDate.toISOString(), endDate: endDate.toISOString() })})
        `;
        return { status: "RECEIPT_ATTACHED", orderNumber, receipt: selected.receipt, alreadySettled: true };
      }

      if (alreadySame || existingUnlinked) {
        await tx`
          UPDATE mpesa_receipts SET amount_minor=${selected.amountMinor}, payer_phone=${selected.payerPhone},
            bill_reference=${selected.billReference}, paid_at=${selected.paidAt}, payment_id=${current.payment_id},
            order_id=${current.order_id}, status='MATCHED', payload=${tx.json(JSON.parse(JSON.stringify(selected.raw)))}, updated_at=now()
          WHERE lower(receipt)=lower(${selected.receipt})
        `;
      }

      if (!alreadySame && !existingUnlinked) {
        await tx`
          INSERT INTO mpesa_receipts (receipt, source, amount_minor, payer_phone, bill_reference, paid_at, payment_id, order_id, status, payload)
          VALUES (${selected.receipt}, 'PULL_QUERY', ${selected.amountMinor}, ${selected.payerPhone}, ${selected.billReference}, ${selected.paidAt}, ${current.payment_id}, ${current.order_id}, 'MATCHED', ${tx.json(JSON.parse(JSON.stringify(selected.raw)))})
        `;
      }

      let fulfilmentReview = false;
      if (current.payment_status !== "SUCCEEDED") {
        const settled = await settleSuccessfulPayment(tx, {
          attemptId: chosenAttempt?.id ?? null,
          paymentId: current.payment_id,
          orderId: current.order_id,
          orderNumber: current.order_number,
          orderStatus: current.order_status,
          userId: current.user_id,
          receipt: selected.receipt,
          payerPhone: selected.payerPhone ?? current.customer_phone,
          paidAt: selected.paidAt ?? new Date(),
          amountMinor: current.amount_minor,
          source: "PULL_RECONCILIATION",
          resultDescription: "Payment verified from Safaricom Pull Transactions and matched to the exact order reference.",
          providerPayload: selected.raw,
          adminId,
        });
        fulfilmentReview = !settled.inventorySettled;
      } else {
        await tx`
          UPDATE payments SET provider_receipt=${selected.receipt}, payer_phone=COALESCE(${selected.payerPhone}, payer_phone),
            paid_at=COALESCE(paid_at, ${selected.paidAt}), updated_at=now()
          WHERE id=${current.payment_id}
        `;
      }
      await tx`
        INSERT INTO admin_activity_logs (actor_user_id, action, entity_type, entity_id, metadata)
        VALUES (${adminId}, ${current.payment_status === "SUCCEEDED" ? "payment.pull_receipt_attached" : "payment.pull_reconciled"}, 'order', ${current.order_id},
          ${tx.json({ orderNumber, receipt: selected.receipt, amountMinor: selected.amountMinor, paidAt: selected.paidAt?.toISOString() ?? null, startDate: startDate.toISOString(), endDate: endDate.toISOString(), pages, fulfilmentReview })})
      `;
      return { status: current.payment_status === "SUCCEEDED" ? "RECEIPT_ATTACHED" : "RECONCILED", orderNumber, receipt: selected.receipt, fulfilmentReview };
    }

    for (const transaction of related) {
      const [existing] = await tx<{ status: string }[]>`
        SELECT status FROM mpesa_receipts WHERE lower(receipt)=lower(${transaction.receipt}) FOR UPDATE
      `;
      if (existing) {
        await tx`UPDATE mpesa_receipts SET status='REVIEW', updated_at=now() WHERE lower(receipt)=lower(${transaction.receipt}) AND status <> 'MATCHED'`;
      } else {
        await tx`
          INSERT INTO mpesa_receipts (receipt, source, amount_minor, payer_phone, bill_reference, paid_at, payment_id, order_id, status, payload)
          VALUES (${transaction.receipt}, 'PULL_QUERY', ${transaction.amountMinor}, ${transaction.payerPhone}, ${transaction.billReference}, ${transaction.paidAt}, ${current.payment_id}, ${current.order_id}, 'REVIEW', ${tx.json(JSON.parse(JSON.stringify(transaction.raw)))})
        `;
      }
    }
    const status = related.length ? "REVIEW_REQUIRED" : "NO_MATCH";
    if (related.length) await publishAdminNotification(tx, {
      eventType: "PULLED_MPESA_RECEIPT_REVIEW", entityType: "order", entityId: current.order_id,
      severity: "CRITICAL", title: "Pulled M-Pesa transaction needs review",
      body: `Pull Transactions found ${related.length} possible transaction(s) for ${orderNumber}, but the order reference or payment details did not uniquely match.`, href: "/admin/transactions",
    });
    await tx`
      INSERT INTO admin_activity_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES (${adminId}, ${related.length ? 'payment.pull_reconciliation_review' : 'payment.pull_reconciliation_no_match'}, 'order', ${current.order_id},
        ${tx.json({ orderNumber, resultCount: unique.length, referenceMatchCount: referenceMatches.length, candidateCount: related.length, startDate: startDate.toISOString(), endDate: endDate.toISOString(), pages })})
    `;
    return { status, orderNumber, checkedCount: unique.length, candidateCount: related.length, pages };
  });
}

export async function adminRecordPaymentEvidence(orderNumber: string, adminId: string, input: z.infer<typeof adminRecordPaymentSchema>) {
  const payerPhone = normalizeKenyanPhone(input.payerPhone);
  if (input.paidAt.getTime() > Date.now() + 5 * 60_000) throw new ApiError(422, "INVALID_PAYMENT_TIME", "The M-Pesa payment time cannot be in the future.");
  return withTransaction(async (tx) => {
    const [record] = await tx<{
      payment_id: string; payment_status: string; provider_receipt: string | null; amount_minor: number; order_id: string;
      order_number: string; order_status: string; order_created_at: Date; customer_phone: string; user_id: string | null;
    }[]>`
      SELECT p.id AS payment_id, p.status::text AS payment_status, p.provider_receipt, p.amount_minor,
             o.id AS order_id, o.order_number, o.status::text AS order_status,
             o.created_at AS order_created_at, o.customer_phone, o.user_id
      FROM orders o JOIN payments p ON p.order_id = o.id
      WHERE o.order_number = ${orderNumber}
      FOR UPDATE OF p, o
    `;
    if (!record) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found.");
    if (record.payment_status === "REFUNDED") throw new ApiError(409, "PAYMENT_ALREADY_REFUNDED", "A refunded payment cannot be linked as a new payment receipt.");
    if (record.payment_status === "SUCCEEDED") {
      if (record.provider_receipt) return { recorded: true, matched: true, existing: true, orderNumber, receipt: record.provider_receipt };
      if (input.amountMinor !== record.amount_minor || payerPhone !== record.customer_phone) {
        throw new ApiError(422, "PAYMENT_RECEIPT_MISMATCH", "The verified receipt amount and payer must match this paid order before attaching it.");
      }
      if (input.paidAt.getTime() < record.order_created_at.getTime() - 5 * 60_000) throw new ApiError(422, "PAYMENT_TIME_MISMATCH", "The payment time must be after the order was created.");
      const [receiptOwner] = await tx<{ id: string }[]>`SELECT id FROM mpesa_receipts WHERE lower(receipt)=lower(${input.receipt}) FOR UPDATE`;
      if (receiptOwner) throw new ApiError(409, "RECEIPT_ALREADY_RECORDED", "This receipt is already recorded. Review the existing M-Pesa receipt entry.");
      await tx`
        INSERT INTO mpesa_receipts (receipt, source, amount_minor, payer_phone, bill_reference, paid_at, payment_id, order_id, status, payload)
        VALUES (${input.receipt}, 'C2B_CONFIRMATION', ${input.amountMinor}, ${payerPhone}, ${orderNumber}, ${input.paidAt}, ${record.payment_id}, ${record.order_id}, 'MATCHED', ${tx.json({ source: "ADMIN_RECEIPT_ATTACHMENT", note: input.note, verifiedAt: new Date().toISOString() })})
      `;
      await tx`UPDATE payments SET provider_receipt=${input.receipt}, payer_phone=${payerPhone}, paid_at=COALESCE(paid_at, ${input.paidAt}), updated_at=now() WHERE id=${record.payment_id}`;
      await tx`
        INSERT INTO admin_activity_logs (actor_user_id, action, entity_type, entity_id, metadata)
        VALUES (${adminId}, 'payment.receipt_attached_by_admin', 'order', ${record.order_id}, ${tx.json({ orderNumber, receipt: input.receipt, amountMinor: input.amountMinor, paidAt: input.paidAt.toISOString(), note: input.note })})
      `;
      return { recorded: true, matched: true, existing: false, receipt: input.receipt, orderNumber, receiptAttached: true };
    }
    if (input.paidAt.getTime() < record.order_created_at.getTime() - 5 * 60_000) throw new ApiError(422, "PAYMENT_TIME_MISMATCH", "The payment time must be after the order was created.");
    const [receiptOwner] = await tx<{ id: string }[]>`SELECT id FROM mpesa_receipts WHERE lower(receipt) = lower(${input.receipt}) FOR UPDATE`;
    if (receiptOwner) throw new ApiError(409, "RECEIPT_ALREADY_RECORDED", "This receipt is already recorded. Review the existing Paybill receipt entry.");
    const matched = input.amountMinor === record.amount_minor && payerPhone === record.customer_phone;
    const [paymentReceiptOwner] = await tx<{ payment_id: string }[]>`
      SELECT id AS payment_id FROM payments WHERE lower(provider_receipt) = lower(${input.receipt}) FOR UPDATE
    `;
    const canSettle = matched && (!paymentReceiptOwner || paymentReceiptOwner.payment_id === record.payment_id);
    const payload = { source: "ADMIN_REVIEW", note: input.note, verifiedAt: new Date().toISOString() };
    await tx`
      INSERT INTO mpesa_receipts (receipt, source, amount_minor, payer_phone, bill_reference, paid_at, payment_id, order_id, status, payload)
      VALUES (${input.receipt}, 'C2B_CONFIRMATION', ${input.amountMinor}, ${payerPhone}, ${orderNumber}, ${input.paidAt}, ${canSettle || !paymentReceiptOwner ? record.payment_id : null}, ${canSettle || !paymentReceiptOwner ? record.order_id : null}, ${canSettle ? "MATCHED" : "REVIEW"}, ${tx.json(payload)})
    `;
    if (canSettle) {
      const result = await settleSuccessfulPayment(tx, {
        paymentId: record.payment_id, orderId: record.order_id, orderNumber: record.order_number,
        orderStatus: record.order_status, userId: record.user_id, receipt: input.receipt,
        payerPhone, paidAt: input.paidAt, amountMinor: record.amount_minor,
        source: "ADMIN_CONFIRMATION", resultDescription: "Paybill payment confirmed by an administrator.",
        adminId, manualNote: input.note,
      });
      await tx`
        INSERT INTO admin_activity_logs (actor_user_id, action, entity_type, entity_id, metadata)
        VALUES (${adminId}, 'payment.manually_confirmed', 'order', ${record.order_id}, ${tx.json({ orderNumber, receipt: input.receipt, amountMinor: input.amountMinor, paidAt: input.paidAt.toISOString(), note: input.note })})
      `;
      return { recorded: true, matched: true, existing: false, orderNumber, fulfilmentReview: !result.inventorySettled };
    }
    if (paymentReceiptOwner && paymentReceiptOwner.payment_id !== record.payment_id) {
      await publishAdminNotification(tx, {
        eventType: "DUPLICATE_MPESA_RECEIPT", entityType: "mpesa_receipt", entityId: input.receipt,
        severity: "CRITICAL", title: "Receipt recorded but already linked to another payment",
        body: `Receipt ${input.receipt} is kept in the money-in ledger but cannot be allocated to ${orderNumber} automatically.`, href: "/admin/transactions",
      });
      await tx`INSERT INTO admin_activity_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES (${adminId}, 'payment.evidence_recorded', 'order', ${record.order_id}, ${tx.json({ orderNumber, receipt: input.receipt, amountMinor: input.amountMinor, paidAt: input.paidAt.toISOString(), note: input.note, receiptCollision: true })})`;
      return { recorded: true, matched: false, existing: false, orderNumber };
    }
    await tx`
      UPDATE payments SET status = 'RECONCILING', provider_receipt = ${input.receipt}, payer_phone = ${payerPhone}, paid_at = ${input.paidAt}, settlement_source = 'ADMIN_CONFIRMATION', manual_confirmation_note = ${input.note}, updated_at = now()
      WHERE id = ${record.payment_id}
    `;
    await publishAdminNotification(tx, {
      eventType: "ADMIN_RECORDED_PAYMENT_NEEDS_REVIEW", entityType: "order", entityId: record.order_id,
      severity: "CRITICAL", title: "Payment evidence recorded; order amount or payer differs",
      body: `${orderNumber} receipt ${input.receipt} is retained, but needs review before fulfilment.`, href: "/admin/transactions",
    });
    await tx`
      INSERT INTO admin_activity_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES (${adminId}, 'payment.evidence_recorded', 'order', ${record.order_id}, ${tx.json({ orderNumber, receipt: input.receipt, amountMinor: input.amountMinor, expectedAmountMinor: record.amount_minor, paidAt: input.paidAt.toISOString(), note: input.note })})
    `;
    return { recorded: true, matched: false, existing: false, orderNumber };
  });
}

async function queryAndRecordStkStatus(attemptId: string, checkoutRequestId: string, orderNumber: string) {
  const provider = await queryStkPushStatus(checkoutRequestId);
  const checkedAt = new Date();
  const rawResultCode = provider.response.ResultCode;
  const resultCode = rawResultCode === undefined || rawResultCode === null || rawResultCode === "" ? null : Number(rawResultCode);
  const resultDescription = provider.response.ResultDesc ?? provider.response.ResponseDescription ?? "Safaricom has not returned a final result.";
  const safeResult = {
    ResponseCode: provider.response.ResponseCode ?? null,
    ResponseDescription: provider.response.ResponseDescription ?? null,
    ResultCode: provider.response.ResultCode ?? null,
    ResultDesc: provider.response.ResultDesc ?? null,
    checkedAt: checkedAt.toISOString(),
  };
  if (provider.response.CheckoutRequestID && provider.response.CheckoutRequestID !== checkoutRequestId) {
    throw new ApiError(502, "MPESA_STATUS_REFERENCE_MISMATCH", "Safaricom returned a different checkout reference; the order was left unchanged.");
  }
  return withTransaction(async (tx) => {
    const [current] = await tx<{
      payment_id: string; payment_status: string; attempt_status: string; order_id: string;
      order_number: string; order_status: string; amount_minor: number; customer_phone: string;
      user_id: string | null; attempt_id: string;
    }[]>`
      SELECT p.id AS payment_id, p.status::text AS payment_status, pa.status::text AS attempt_status,
             pa.id AS attempt_id, o.id AS order_id, o.order_number, o.status::text AS order_status,
             p.amount_minor, o.customer_phone, o.user_id
      FROM payment_attempts pa JOIN payments p ON p.id = pa.payment_id JOIN orders o ON o.id=p.order_id
      WHERE pa.id = ${attemptId} AND pa.checkout_request_id = ${checkoutRequestId}
      FOR UPDATE OF pa, p, o
    `;
    if (!current) throw new ApiError(404, "PAYMENT_ATTEMPT_NOT_FOUND", "The M-Pesa attempt could not be found.");
    if (current.payment_status === "REFUNDED") throw new ApiError(409, "PAYMENT_ALREADY_REFUNDED", "A refunded payment cannot be reconciled as a new payment.");
    await tx`
      UPDATE payment_attempts SET response_payload = COALESCE(response_payload, '{}'::jsonb) || ${tx.json({ statusQuery: safeResult })}
      WHERE id = ${attemptId}
    `;
    let fulfilmentReview = false;
    if (resultCode === 0 && (provider.response.ResponseCode === undefined || provider.response.ResponseCode === "0") && current.payment_status !== "SUCCEEDED") {
      const note = "Safaricom confirmed this STK payment by CheckoutRequestID; the receipt callback is still pending.";
      const settlement = await settleSuccessfulPayment(tx, {
        attemptId: current.attempt_id,
        paymentId: current.payment_id,
        orderId: current.order_id,
        orderNumber: current.order_number,
        orderStatus: current.order_status,
        userId: current.user_id,
        receipt: null,
        payerPhone: current.customer_phone,
        paidAt: checkedAt,
        amountMinor: current.amount_minor,
        source: "STK_STATUS_QUERY",
        resultDescription: note,
        providerPayload: safeResult,
      });
      fulfilmentReview = !settlement.inventorySettled;
      await publishAdminNotification(tx, {
        eventType: "MPESA_QUERY_CONFIRMED_WITHOUT_CALLBACK", entityType: "payment_attempt", entityId: attemptId,
        severity: fulfilmentReview ? "CRITICAL" : "WARNING",
        title: fulfilmentReview ? "Payment confirmed; fulfilment needs review" : "Payment confirmed; receipt callback pending",
        body: `${orderNumber} is paid from the STK status result. Pull reconciliation can attach its receipt when available.`, href: "/admin/transactions",
      });
    }
    const confirmed = current.payment_status === "SUCCEEDED" || (resultCode === 0 && (provider.response.ResponseCode === undefined || provider.response.ResponseCode === "0"));
    return { paymentStatus: confirmed ? "SUCCEEDED" : current.payment_status, resultCode, resultDescription, checkedAt: checkedAt.toISOString(), fulfilmentReview };
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
      VALUES (${payment.order_id}, ${payment.order_status}::order_status, ${payment.order_status}::order_status, 'customer-payment-report',
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
